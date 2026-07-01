/**
 * Morax worker - orchestration pure (testable avec des fakes).
 * Garde-fous : idempotence, Max Loops par job, ack non bloquant,
 * comptabilisation des crédits et du coût réel.
 */

import type { LlmClient } from './llm.js'
import type { PendingActionRow, Ports } from './ports.js'
import {
  draftDocument,
  ocrDocument,
  outcomeCredits,
  planTasks,
  type PipelineContext,
  type StageOutcome,
} from './pipeline.js'
import { formatReminderMessage } from './reminder-notify-core.js'
import {
  formatActionResult,
  formatApprovalSummary,
  formatDocumentEmail,
  parseSendEmailPayload,
} from './action-gate-core.js'
import type { JobMessage, QueueEnvelope } from './types.js'

export interface RunConfig {
  maxLoopsPerJob: number
  queueBatchSize: number
  visibilityTimeoutSec: number
}

export interface ProcessResult {
  status: 'done' | 'skipped_idempotent' | 'max_loops' | 'error'
  msgId: number
}

export async function processEnvelope(
  envelope: QueueEnvelope,
  ports: Ports,
  llm: LlmClient,
  config: RunConfig,
): Promise<ProcessResult> {
  const msg = envelope.message

  // Garde-fou Max Loops : un message relu trop de fois part en DLQ (archive).
  if (envelope.read_ct > config.maxLoopsPerJob) {
    await ports.queue.archive(envelope.msg_id)
    return { status: 'max_loops', msgId: envelope.msg_id }
  }

  // reminder_notify : voie dediee, ce n'est pas un job IA (ni LLM, ni credits/COGS, ni ack).
  if (msg.type === 'reminder_notify') {
    return processReminderNotify(envelope, msg, ports, config)
  }

  // action_propose/action_execute : gate HIGH, ce n'est pas un job IA non plus.
  if (msg.type === 'action_propose' || msg.type === 'action_execute') {
    return processActionGate(envelope, msg, ports, config)
  }

  // Idempotence : un même évènement source ne produit qu'un job.
  const begin = await ports.jobRuns.begin(msg.tenant_id, msg)
  if (!begin.fresh) {
    await ports.queue.delete(envelope.msg_id)
    return { status: 'skipped_idempotent', msgId: envelope.msg_id }
  }

  try {
    const result = await ports.tracer.trace(
      `job:${msg.type}`,
      { tenant: msg.tenant_id, type: msg.type, source: msg.source },
      async (traceId) => {
        const tenant = await ports.tenants.load(msg.tenant_id)
        // Ack non bloquant immédiat (UX TDAH : "je m'en occupe").
        await ports.notifier.ack(msg.tenant_id, 'Je m’en occupe.')

        const ctx: PipelineContext = {
          tenant,
          ports,
          llm,
          jobRunId: begin.jobRunId,
          traceId,
        }

        let outcome: StageOutcome
        switch (msg.type) {
          case 'capture_document':
            outcome = await ocrDocument(ctx, msg, requireDocId(msg.document_id))
            break
          case 'capture_audio':
            outcome = await planTasks(ctx, msg)
            break
          case 'draft_quote':
            outcome = await draftDocument(ctx, msg, 'brouillon_devis')
            break
          case 'draft_invoice':
            outcome = await draftDocument(ctx, msg, 'brouillon_facture')
            break
          default:
            throw new Error(`[run] Type de job inconnu : ${String(msg.type)}`)
        }

        // Comptabilisation ferme : crédits + coût réel (COGS).
        await ports.credits.record({
          tenantId: msg.tenant_id,
          jobRunId: begin.jobRunId,
          actionCategory: outcome.category,
          weight: outcomeCredits(outcome),
          langfuseTraceId: traceId,
        })
        await ports.credits.recordCost({
          tenantId: msg.tenant_id,
          jobRunId: begin.jobRunId,
          role: outcome.modelConfig.financePinned ? 'cerveau:finance' : 'pipeline',
          model: outcome.modelConfig.model,
          provider: outcome.modelConfig.provider,
          tokensIn: outcome.tokensIn,
          tokensOut: outcome.tokensOut,
          usdCost: outcome.usdCost,
          langfuseTraceId: traceId,
        })
        return outcome
      },
    )

    void result
    await ports.jobRuns.finish(begin.jobRunId, 'done')
    await ports.queue.delete(envelope.msg_id)
    return { status: 'done', msgId: envelope.msg_id }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    await ports.jobRuns.finish(begin.jobRunId, 'error', message)
    // Si on a épuisé les tentatives, archive (DLQ) ; sinon laisse le message
    // redevenir visible pour un retry borné.
    if (envelope.read_ct + 1 > config.maxLoopsPerJob) {
      await ports.queue.archive(envelope.msg_id)
    }
    return { status: 'error', msgId: envelope.msg_id }
  }
}

/**
 * reminder_notify : relai texte vers Telegram, sans pipeline IA. Idempotence propre
 * (job_runs) car la voie precoce court-circuite le begin() partage plus bas.
 */
async function processReminderNotify(
  envelope: QueueEnvelope,
  msg: JobMessage,
  ports: Ports,
  config: RunConfig,
): Promise<ProcessResult> {
  const begin = await ports.jobRuns.begin(msg.tenant_id, msg)
  if (!begin.fresh) {
    await ports.queue.delete(envelope.msg_id)
    return { status: 'skipped_idempotent', msgId: envelope.msg_id }
  }

  try {
    await ports.notifier.notifyReminderDue(msg.tenant_id, formatReminderMessage(msg.reminder))
    await ports.jobRuns.finish(begin.jobRunId, 'done')
    await ports.queue.delete(envelope.msg_id)
    return { status: 'done', msgId: envelope.msg_id }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    await ports.jobRuns.finish(begin.jobRunId, 'error', message)
    if (envelope.read_ct + 1 > config.maxLoopsPerJob) {
      await ports.queue.archive(envelope.msg_id)
    }
    return { status: 'error', msgId: envelope.msg_id }
  }
}

/**
 * action_propose/action_execute : relai du gate HIGH (envoi devis/facture), sans
 * pipeline IA. Idempotence propre (job_runs), meme voie precoce que reminder_notify.
 */
async function processActionGate(
  envelope: QueueEnvelope,
  msg: JobMessage,
  ports: Ports,
  config: RunConfig,
): Promise<ProcessResult> {
  const begin = await ports.jobRuns.begin(msg.tenant_id, msg)
  if (!begin.fresh) {
    await ports.queue.delete(envelope.msg_id)
    return { status: 'skipped_idempotent', msgId: envelope.msg_id }
  }

  try {
    const pendingActionId = requirePendingActionId(msg.action?.pending_action_id)
    const action = await ports.pendingActions.load(msg.tenant_id, pendingActionId)
    if (!action) {
      throw new Error(`[run] pending_action introuvable : ${pendingActionId}`)
    }

    if (msg.type === 'action_propose') {
      await processActionPropose(msg.tenant_id, action, ports)
    } else {
      await processActionExecute(msg.tenant_id, action, ports)
    }

    await ports.jobRuns.finish(begin.jobRunId, 'done')
    await ports.queue.delete(envelope.msg_id)
    return { status: 'done', msgId: envelope.msg_id }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    await ports.jobRuns.finish(begin.jobRunId, 'error', message)
    if (envelope.read_ct + 1 > config.maxLoopsPerJob) {
      await ports.queue.archive(envelope.msg_id)
    }
    return { status: 'error', msgId: envelope.msg_id }
  }
}

async function processActionPropose(
  tenantId: string,
  action: PendingActionRow,
  ports: Ports,
): Promise<void> {
  // Deja decidee (approuvee/rejetee/executee) entre l'enqueue et le traitement : rien a proposer.
  if (action.status !== 'pending') return
  const payload = parseSendEmailPayload(action.payload)
  await ports.notifier.proposeApproval(tenantId, action.id, formatApprovalSummary(payload))
}

async function processActionExecute(
  tenantId: string,
  action: PendingActionRow,
  ports: Ports,
): Promise<void> {
  // Deja envoyee : idempotence, pas de double email.
  if (action.status === 'executed') return

  const payload = parseSendEmailPayload(action.payload)

  if (action.status === 'rejected') {
    await ports.notifier.notifyActionResult(tenantId, formatActionResult('rejected', payload))
    return
  }

  if (action.status !== 'approved') {
    throw new Error(`[run] action_execute sur pending_action au statut inattendu : ${action.status}`)
  }

  const { bytes } = await ports.media.getObject(payload.pdf_key)
  const email = formatDocumentEmail(payload)
  await ports.mailer.sendDocumentEmail({
    to: payload.client_email,
    subject: email.subject,
    textBody: email.textBody,
    attachment: {
      filename: email.filename,
      contentBase64: Buffer.from(bytes).toString('base64'),
      contentType: 'application/pdf',
    },
  })
  await ports.pendingActions.markExecuted(tenantId, action.id)
  await ports.drafts.markSent(tenantId, payload.draft_id)
  await ports.notifier.notifyActionResult(tenantId, formatActionResult('executed', payload))
}

/** Un passage : lit un lot et traite chaque message. Retourne le nombre traité. */
export async function runOnce(
  ports: Ports,
  llm: LlmClient,
  config: RunConfig,
): Promise<ProcessResult[]> {
  const batch = await ports.queue.read(config.queueBatchSize, config.visibilityTimeoutSec)
  const results: ProcessResult[] = []
  for (const envelope of batch) {
    results.push(await processEnvelope(envelope, ports, llm, config))
  }
  return results
}

function requireDocId(documentId: string | undefined): string {
  if (!documentId) {
    throw new Error('[run] capture_document sans document_id')
  }
  return documentId
}

function requirePendingActionId(pendingActionId: string | undefined): string {
  if (!pendingActionId) {
    throw new Error('[run] job action_propose/action_execute sans pending_action_id')
  }
  return pendingActionId
}
