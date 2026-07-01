/**
 * Morax - contrats partagés entre le webhook (app) et le worker.
 * Le contrat de message de la file est versionné.
 */

export type JobSource = 'telegram' | 'email' | 'upload' | 'cron'

export type JobType =
  | 'capture_document'
  | 'capture_audio'
  | 'draft_quote'
  | 'draft_invoice'
  | 'reminder_notify'

export interface ReminderNotifyPayload {
  id: string
  milestone: 'j7' | 'j3' | 'j1'
  due_date: string
  amount?: number
  currency?: string
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
  idempotency_key: string
  enqueued_at: string
}
