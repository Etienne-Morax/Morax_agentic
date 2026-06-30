/**
 * Morax worker - types de domaine.
 * Le contrat de message de la file (JobMessage) est partagé via @morax/model-core.
 */

import type { JobMessage } from '@morax/model-core'

export type { JobMessage, JobType, JobSource } from '@morax/model-core'

/** Enveloppe pgmq : message + métadonnées de lecture. */
export interface QueueEnvelope {
  msg_id: number
  read_ct: number
  enqueued_at: string
  message: JobMessage
}

export type DocumentStatus =
  | 'received'
  | 'processing'
  | 'extracted'
  | 'incomplete'
  | 'validated'
  | 'archived'

export interface ExtractedFields {
  montant?: number
  devise?: string
  date_emission?: string
  date_echeance?: string
  emetteur?: string
  destinataire?: string
  numero_document?: string
}
