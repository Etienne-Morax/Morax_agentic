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
  /** Auto-enfilage (ex. action_propose depuis un job chase_unpaid). */
  send(message: JobMessage): Promise<void>
  delete(msgId: number): Promise<void>
  archive(msgId: number): Promise<void>
}

export interface UnclassifiedDocumentRow {
  id: string
  mime: string | null
  extracted: ExtractedFields | null
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
  /** Documents sans categorie (sort_inbox). */
  listUnclassified(tenantId: string): Promise<UnclassifiedDocumentRow[]>
  setCategory(tenantId: string, documentId: string, category: string): Promise<void>
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
  actionType: GateActionType
  status: PendingActionStatus
  payload: Record<string, unknown>
  /** Non-null si un bounce a deja ete traite pour cette action (garde d'idempotence). */
  bouncedAt?: string | null
}

export type GateActionType = 'send_email' | 'expense' | 'third_party_write' | 'chase_reminder'

/** Gate HIGH : écrit/lit une action en attente d'approbation humaine. */
export interface PendingActionRepository {
  enqueue(action: {
    tenantId: string
    actionType: GateActionType
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

export interface OverdueInvoiceRow {
  draftId: string
  docNumber: string
  clientEmail: string
  cc?: string
  total: number
  currency: string
  dueDate: string
}

/** Statut + lecture des brouillons devis/facture (document_drafts). */
export interface DraftStatusRepository {
  /** Passe le draft en statut 'sent' apres envoi reussi. */
  markSent(tenantId: string, draftId: string): Promise<void>
  /** Factures (kind='invoice') finalisees/envoyees, echeance depassee, jamais marquees payees. */
  listOverdueInvoices(tenantId: string): Promise<OverdueInvoiceRow[]>
}

/** Envoi d'email sortant (Postmark). Piece jointe optionnelle (relance texte seul). */
export interface Mailer {
  sendDocumentEmail(input: {
    to: string
    cc?: string
    subject: string
    textBody: string
    htmlBody?: string
    attachment?: { filename: string; contentBase64: string; contentType: string }
  }): Promise<{ messageId: string }>
}

export interface ReminderSummaryRow {
  id: string
  dueDate: string
  amount: number | null
  currency: string
}

/** Lecture des echeances (reminders) -- mes factures fournisseurs a payer. */
export interface ReminderQueryRepository {
  listOverdue(tenantId: string): Promise<ReminderSummaryRow[]>
  listUpcoming(tenantId: string, withinDays: number): Promise<ReminderSummaryRow[]>
}

export interface DaySummaryRow {
  documentsReceived: number
  documentsNeedingValidation: number
  remindersDueNext7Days: number
  overdueReminders: number
  draftsPendingSend: number
  jobsRunToday: number
  jobsErroredToday: number
}

/** Agregats de la journee pour le Resume du jour (LOW, LLM cerveau non-finance). */
export interface DashboardQueryRepository {
  summarizeDay(tenantId: string): Promise<DaySummaryRow>
}

/** Lecture des médias bruts (Cloudflare R2). */
export interface MediaRepository {
  getObject(key: string): Promise<{ bytes: Uint8Array; contentType: string }>
}

export interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushPayload {
  title: string
  body: string
  /** Chemin relatif ouvert au tap (ex. /launchpad). */
  url: string
}

export interface PushSendResult {
  delivered: boolean
  /** true si l'endpoint est expire/invalide (404/410) : l'appelant doit purger l'abonnement. */
  expired: boolean
}

/** Envoi push web VAPID (PWA). No-op silencieux si VAPID non configure. */
export interface PushSender {
  send(subscription: PushSubscriptionRow, payload: PushPayload): Promise<PushSendResult>
}

/** Abonnements push tenant-scoped (table push_subscriptions). */
export interface PushSubscriptionRepository {
  listForTenant(tenantId: string): Promise<PushSubscriptionRow[]>
  removeByEndpoint(tenantId: string, endpoint: string): Promise<void>
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
  reminders: ReminderQueryRepository
  dashboard: DashboardQueryRepository
  media: MediaRepository
  mailer: Mailer
  jobRuns: JobRunRepository
  credits: CreditsRepository
  pendingActions: PendingActionRepository
  pushSubscriptions: PushSubscriptionRepository
  webPush: PushSender
  notifier: Notifier
  tracer: Tracer
}
