/**
 * Morax worker - ports (interfaces) pour découpler la logique des fournisseurs.
 * Les adaptateurs concrets (Supabase, Langfuse, LLM) implémentent ces ports.
 */

import type { TenantConfig } from '@morax/model-core'
import type { ExtractedFields, JobMessage, QueueEnvelope } from './types.js'

/** Chargement de la configuration tenant (offre, quotas, packs). */
export interface TenantRepository {
  load(tenantId: string): Promise<TenantConfig>
}

/** File pgmq. */
export interface QueueClient {
  read(batchSize: number, visibilityTimeoutSec: number): Promise<QueueEnvelope[]>
  delete(msgId: number): Promise<void>
  archive(msgId: number): Promise<void>
}

/** Accès aux données tenant-scoped. Le worker filtre TOUJOURS par tenant_id. */
export interface DocumentRepository {
  setStatus(tenantId: string, documentId: string, status: string): Promise<void>
  saveExtracted(
    tenantId: string,
    documentId: string,
    fields: ExtractedFields,
    needsHumanValidation: boolean,
  ): Promise<void>
}

/** Journal d'exécution et idempotence. */
export interface JobRunRepository {
  /** Retourne false si idempotency_key déjà traité (skip). */
  begin(tenantId: string, msg: JobMessage): Promise<{ jobRunId: string; fresh: boolean }>
  finish(jobRunId: string, status: 'done' | 'error', error?: string): Promise<void>
}

/** Comptabilisation ferme des crédits + coût réel (COGS). */
export interface CreditsRepository {
  record(entry: {
    tenantId: string
    jobRunId: string
    actionCategory: string
    weight: number
    langfuseTraceId?: string
  }): Promise<void>
  recordCost(entry: {
    tenantId: string
    jobRunId: string
    role: string
    model: string
    provider: string
    tokensIn: number
    tokensOut: number
    usdCost: number
    langfuseTraceId?: string
  }): Promise<void>
  /** Crédits consommés sur la période courante. */
  consumedThisPeriod(tenantId: string): Promise<number>
}

/** Gate HIGH : écrit une action en attente d'approbation humaine. */
export interface PendingActionRepository {
  enqueue(action: {
    tenantId: string
    actionType: 'send_email' | 'expense' | 'third_party_write'
    payload: Record<string, unknown>
  }): Promise<{ pendingActionId: string }>
}

/** Notifications sortantes (Telegram au MVP). */
export interface Notifier {
  ack(tenantId: string, text: string): Promise<void>
  proposeApproval(
    tenantId: string,
    pendingActionId: string,
    summary: string,
  ): Promise<void>
  proposeReminderValidation(
    tenantId: string,
    documentId: string,
    summary: string,
  ): Promise<void>
}

/** Tracing Langfuse. */
export interface Tracer {
  trace<T>(
    name: string,
    tags: Record<string, string>,
    fn: (traceId: string) => Promise<T>,
  ): Promise<T>
}

export interface Ports {
  queue: QueueClient
  tenants: TenantRepository
  documents: DocumentRepository
  jobRuns: JobRunRepository
  credits: CreditsRepository
  pendingActions: PendingActionRepository
  notifier: Notifier
  tracer: Tracer
}
