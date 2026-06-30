/**
 * Morax - contrats partagés entre le webhook (app) et le worker.
 * Le contrat de message de la file est versionné.
 */

export type JobSource = 'telegram' | 'email' | 'upload'

export type JobType =
  | 'capture_document'
  | 'capture_audio'
  | 'draft_quote'
  | 'draft_invoice'

export interface JobMessage {
  schema_version: 1
  type: JobType
  tenant_id: string
  source: JobSource
  media_key?: string
  document_id?: string
  text?: string
  idempotency_key: string
  enqueued_at: string
}
