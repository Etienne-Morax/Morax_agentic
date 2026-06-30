/**
 * Morax worker - adaptateurs Supabase + Telegram.
 * Le worker utilise la service role (bypass RLS) mais filtre TOUJOURS par tenant_id.
 * pgmq est exposé via des fonctions SQL wrapper (voir migrations).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Langfuse } from 'langfuse'
import type { Pack, TenantConfig } from '@morax/model-core'
import type { WorkerConfig } from '../config.js'
import type {
  CreditsRepository,
  DocumentRepository,
  JobRunRepository,
  Notifier,
  PendingActionRepository,
  Ports,
  QueueClient,
  TenantRepository,
  Tracer,
} from '../ports.js'
import type { ExtractedFields, JobMessage, QueueEnvelope } from '../types.js'
import { makeMedia } from './r2.js'

const QUEUE_NAME = 'morax_jobs'

function makeQueue(db: SupabaseClient): QueueClient {
  return {
    async read(batchSize, visibilityTimeoutSec) {
      const { data, error } = await db.rpc('morax_queue_read', {
        p_queue: QUEUE_NAME,
        p_vt: visibilityTimeoutSec,
        p_qty: batchSize,
      })
      if (error) throw new Error(`[queue.read] ${error.message}`)
      const rows = (data ?? []) as Array<{
        msg_id: number
        read_ct: number
        enqueued_at: string
        message: JobMessage
      }>
      return rows.map(
        (r): QueueEnvelope => ({
          msg_id: r.msg_id,
          read_ct: r.read_ct,
          enqueued_at: r.enqueued_at,
          message: r.message,
        }),
      )
    },
    async delete(msgId) {
      const { error } = await db.rpc('morax_queue_delete', {
        p_queue: QUEUE_NAME,
        p_msg_id: msgId,
      })
      if (error) throw new Error(`[queue.delete] ${error.message}`)
    },
    async archive(msgId) {
      const { error } = await db.rpc('morax_queue_archive', {
        p_queue: QUEUE_NAME,
        p_msg_id: msgId,
      })
      if (error) throw new Error(`[queue.archive] ${error.message}`)
    },
  }
}

function makeTenants(db: SupabaseClient): TenantRepository {
  return {
    async load(tenantId) {
      const { data, error } = await db
        .from('tenants')
        .select(
          'tenant_id, offre, fallback_quota, action_quota_monthly, alert_threshold_pct, quota_exceeded_behavior, packs_actifs, data_region, gdpr_dpa_signed, personal_data_consent',
        )
        .eq('tenant_id', tenantId)
        .single()
      if (error || !data) {
        throw new Error(`[tenants.load] tenant ${tenantId} introuvable : ${error?.message}`)
      }
      const row = data as Record<string, unknown>
      return {
        tenant_id: tenantId,
        offre: row.offre as TenantConfig['offre'],
        fallback_quota: Boolean(row.fallback_quota),
        action_quota_monthly: Number(row.action_quota_monthly),
        alert_threshold_pct: Number(row.alert_threshold_pct),
        quota_exceeded_behavior:
          row.quota_exceeded_behavior as TenantConfig['quota_exceeded_behavior'],
        packs_actifs: (row.packs_actifs as Pack[]) ?? ['base'],
        data_region: row.data_region as string | undefined,
        gdpr_dpa_signed: Boolean(row.gdpr_dpa_signed),
        personal_data_consent: Boolean(row.personal_data_consent),
      }
    },
  }
}

function makeDocuments(db: SupabaseClient): DocumentRepository {
  return {
    async setStatus(tenantId, documentId, status) {
      const { error } = await db
        .from('documents')
        .update({ status })
        .eq('tenant_id', tenantId)
        .eq('id', documentId)
      if (error) throw new Error(`[documents.setStatus] ${error.message}`)
    },
    async saveExtracted(tenantId, documentId, fields: ExtractedFields, needsHumanValidation) {
      const { error } = await db
        .from('documents')
        .update({ extracted: fields, needs_human_validation: needsHumanValidation })
        .eq('tenant_id', tenantId)
        .eq('id', documentId)
      if (error) throw new Error(`[documents.saveExtracted] ${error.message}`)
    },
  }
}

function makeJobRuns(db: SupabaseClient): JobRunRepository {
  return {
    async begin(tenantId, msg: JobMessage) {
      // Insert idempotent : conflit sur idempotency_key -> job déjà vu.
      const { data, error } = await db
        .from('job_runs')
        .insert({
          tenant_id: tenantId,
          type: msg.type,
          status: 'running',
          idempotency_key: msg.idempotency_key,
        })
        .select('id')
        .single()
      if (error) {
        if (error.code === '23505') return { jobRunId: '', fresh: false } // unique_violation
        throw new Error(`[jobRuns.begin] ${error.message}`)
      }
      return { jobRunId: (data as { id: string }).id, fresh: true }
    },
    async finish(jobRunId, status, errorMsg) {
      const { error } = await db
        .from('job_runs')
        .update({ status, error: errorMsg ?? null, finished_at: new Date().toISOString() })
        .eq('id', jobRunId)
      if (error) throw new Error(`[jobRuns.finish] ${error.message}`)
    },
  }
}

function makeCredits(db: SupabaseClient): CreditsRepository {
  return {
    async record(entry) {
      const { error } = await db.from('credits_ledger').insert({
        tenant_id: entry.tenantId,
        job_run_id: entry.jobRunId,
        action_category: entry.actionCategory,
        weight: entry.weight,
        langfuse_trace_id: entry.langfuseTraceId ?? null,
      })
      if (error) throw new Error(`[credits.record] ${error.message}`)
    },
    async recordCost(entry) {
      const { error } = await db.from('cost_traces').insert({
        tenant_id: entry.tenantId,
        job_run_id: entry.jobRunId,
        role: entry.role,
        model: entry.model,
        provider: entry.provider,
        tokens_in: entry.tokensIn,
        tokens_out: entry.tokensOut,
        usd_cost: entry.usdCost,
        langfuse_trace_id: entry.langfuseTraceId ?? null,
      })
      if (error) throw new Error(`[credits.recordCost] ${error.message}`)
    },
    async consumedThisPeriod(tenantId) {
      const { data, error } = await db.rpc('morax_credits_consumed', {
        p_tenant_id: tenantId,
      })
      if (error) throw new Error(`[credits.consumed] ${error.message}`)
      return Number(data ?? 0)
    },
  }
}

function makePendingActions(db: SupabaseClient): PendingActionRepository {
  return {
    async enqueue(action) {
      // Gate HIGH : on n'exécute JAMAIS ici. On écrit une action en attente.
      const { data, error } = await db
        .from('pending_actions')
        .insert({
          tenant_id: action.tenantId,
          action_type: action.actionType,
          risk: 'HIGH',
          payload: action.payload,
          status: 'pending',
        })
        .select('id')
        .single()
      if (error) throw new Error(`[pendingActions.enqueue] ${error.message}`)
      return { pendingActionId: (data as { id: string }).id }
    },
  }
}

function makeNotifier(config: WorkerConfig, db: SupabaseClient): Notifier {
  async function chatIdFor(tenantId: string): Promise<string | null> {
    const { data } = await db
      .from('channel_identities')
      .select('external_id')
      .eq('tenant_id', tenantId)
      .eq('channel', 'telegram')
      .eq('verified', true)
      .maybeSingle()
    return data ? (data as { external_id: string }).external_id : null
  }

  async function sendTelegram(tenantId: string, text: string): Promise<void> {
    const chatId = await chatIdFor(tenantId)
    if (!chatId) return
    await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
  }

  return {
    ack: (tenantId, text) => sendTelegram(tenantId, text),
    proposeApproval: (tenantId, pendingActionId, summary) =>
      sendTelegram(tenantId, `Action a approuver (${pendingActionId}) : ${summary}`),
    proposeReminderValidation: (tenantId, documentId, summary) =>
      sendTelegram(tenantId, `${summary} (doc ${documentId})`),
  }
}

let activeLangfuse: Langfuse | null = null

function makeTracer(config: WorkerConfig): Tracer {
  const client = new Langfuse({
    publicKey: config.langfuse.publicKey,
    secretKey: config.langfuse.secretKey,
    baseUrl: config.langfuse.host,
  })
  activeLangfuse = client

  return {
    async trace(name, tags, fn) {
      const trace = client.trace({ name, tags: Object.values(tags), metadata: tags })
      try {
        const result = await fn(trace.id)
        trace.update({ output: 'done' })
        return result
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erreur inconnue'
        trace.update({ output: { error: message } })
        throw error
      }
    },
  }
}

/** Vide la file d'évènements Langfuse. À appeler avant la sortie du process (Cloud Run scale-to-zero). */
export async function flushTracing(): Promise<void> {
  if (activeLangfuse) await activeLangfuse.flushAsync()
}

export function createPorts(config: WorkerConfig): Ports {
  const db = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  })
  return {
    queue: makeQueue(db),
    tenants: makeTenants(db),
    documents: makeDocuments(db),
    media: makeMedia(config),
    jobRuns: makeJobRuns(db),
    credits: makeCredits(db),
    pendingActions: makePendingActions(db),
    notifier: makeNotifier(config, db),
    tracer: makeTracer(config),
  }
}
