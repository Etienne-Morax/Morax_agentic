/**
 * Morax - contrats partagés entre le webhook (app) et le worker.
 * Le contrat de message de la file est versionné.
 */

export type JobSource = 'telegram' | 'email' | 'upload' | 'cron' | 'app'

export type JobType =
  | 'capture_document'
  | 'capture_audio'
  | 'draft_quote'
  | 'draft_invoice'
  | 'reminder_notify'
  | 'action_propose'
  | 'action_execute'
  | 'action_bounce'

export interface ReminderNotifyPayload {
  id: string
  milestone: 'j7' | 'j3' | 'j1'
  due_date: string
  amount?: number
  currency?: string
}

/** Payload de `pending_actions.payload` pour action_type='send_email' (devis/facture). */
export interface SendEmailActionPayload {
  draft_id: string
  kind: 'quote' | 'invoice'
  doc_number: string
  client_email: string
  cc?: string
  pdf_key: string
  total: number
  currency: string
}

export type BounceKind = 'hard' | 'soft' | 'spam_complaint'

export interface ActionJobPayload {
  pending_action_id: string
  /** Present uniquement pour type='action_bounce' : classification du bounce Postmark. */
  bounce_kind?: BounceKind
}

export interface JobMessage {
  schema_version: 1
  type: JobType
  tenant_id: string
  source: JobSource
  media_key?: string
  document_id?: string
  text?: string
  reminder?: ReminderNotifyPayload
  action?: ActionJobPayload
  idempotency_key: string
  enqueued_at: string
}
