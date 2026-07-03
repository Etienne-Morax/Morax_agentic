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
  /**
   * Ouvre (ou rouvre) une exécution pour cette idempotency_key.
   * `fresh:false` UNIQUEMENT si une exécution est déjà 'done' (vrai doublon → skip).
   * Une tentative précédente 'running'/'error' est rouverte → `fresh:true` (retry),
   * bornée par read_ct/maxLoopsPerJob côté run.ts.
   */
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

export type PendingActionStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'expired'

export interface PendingActionRow {
  id: string
  status: PendingActionStatus
  payload: Record<string, unknown>
  /** Non-null si un bounce a deja ete traite pour cette action (garde d'idempotence). */
  bouncedAt?: string | null
}

/** Gate HIGH : écrit/lit une action en attente d'approbation humaine. */
export interface PendingActionRepository {
  enqueue(action: {
    tenantId: string
    actionType: 'send_email' | 'expense' | 'third_party_write'
    payload: Record<string, unknown>
  }): Promise<{ pendingActionId: string }>
  /** Charge une action pending_actions tenant-scopee, ou null si introuvable. */
  load(tenantId: string, pendingActionId: string): Promise<PendingActionRow | null>
  /** Marque l'action comme executee (email envoye), persiste le MessageID Postmark. */
  markExecuted(tenantId: string, pendingActionId: string, postmarkMessageId?: string): Promise<void>
  /**
   * Marque le bounce comme traite (garde d'idempotence contre les retries
   * webhook Postmark). Retourne false si deja marque (rien a rembourser).
   */
  markBounced(
    tenantId: string,
    pendingActionId: string,
    bounceKind: 'hard' | 'soft' | 'spam_complaint',
  ): Promise<boolean>
}

/** Statut des brouillons devis/facture (document_drafts). */
export interface DraftStatusRepository {
  /** Passe le draft en statut 'sent' apres envoi reussi. */
  markSent(tenantId: string, draftId: string): Promise<void>
}

/** Envoi d'email sortant avec piece jointe (Postmark). */
export interface Mailer {
  sendDocumentEmail(input: {
    to: string
    cc?: string
    subject: string
    textBody: string
    htmlBody?: string
    attachment: { filename: string; contentBase64: string; contentType: string }
  }): Promise<{ messageId: string }>
}

/** Lecture des médias bruts (Cloudflare R2). */
export interface MediaRepository {
  getObject(key: string): Promise<{ bytes: Uint8Array; contentType: string }>
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
  notifyReminderDue(tenantId: string, text: string): Promise<void>
  /** Notifie le resultat d'une action HIGH decidee (envoye / annule). */
  notifyActionResult(tenantId: string, text: string): Promise<void>
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
  drafts: DraftStatusRepository
  media: MediaRepository
  mailer: Mailer
  jobRuns: JobRunRepository
  credits: CreditsRepository
  pendingActions: PendingActionRepository
  notifier: Notifier
  tracer: Tracer
}
