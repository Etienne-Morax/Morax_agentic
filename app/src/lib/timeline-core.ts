/**
 * Morax - construction de la timeline (lecture seule, ZERO appel IA).
 * Fusionne 4 sources Supabase (deja filtrees par RLS) en une liste triee.
 * Fonction pure : aucune dependance reseau, testable sans mock.
 */

export type TimelineKind = 'document' | 'job_run' | 'reminder' | 'pending_action'

/** Miroir du CHECK constraint `documents.status` (supabase/migrations/0001_init.sql). */
export type DocumentStatus =
  | 'received'
  | 'processing'
  | 'extracted'
  | 'incomplete'
  | 'validated'
  | 'archived'

export interface TimelineItem {
  id: string
  kind: TimelineKind
  title: string
  status: string
  timestamp: string
  meta?: Record<string, unknown>
}

export interface DocumentRow {
  id: string
  source: 'telegram' | 'email' | 'upload'
  status: DocumentStatus
  needs_human_validation: boolean
  created_at: string
}

export interface JobRunRow {
  id: string
  type: string
  status: 'running' | 'done' | 'error'
  error: string | null
  started_at: string
}

export interface ReminderRow {
  id: string
  document_id: string | null
  due_date: string
  amount: number | null
  currency: string
  status: 'pending' | 'paid' | 'dismissed'
}

export interface PendingActionRow {
  id: string
  action_type: 'send_email' | 'expense' | 'third_party_write'
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'expired'
  requested_at: string
}

export interface TimelineSourceRows {
  documents: readonly DocumentRow[]
  jobRuns: readonly JobRunRow[]
  reminders: readonly ReminderRow[]
  pendingActions: readonly PendingActionRow[]
}

const SOURCE_LABEL: Record<DocumentRow['source'], string> = {
  telegram: 'Telegram',
  email: 'Email',
  upload: 'Import',
}

const JOB_TYPE_LABEL: Record<string, string> = {
  capture_document: 'Extraction de document',
  capture_audio: 'Transcription audio',
  draft_quote: 'Brouillon de devis',
  draft_invoice: 'Brouillon de facture',
}

const ACTION_TYPE_LABEL: Record<PendingActionRow['action_type'], string> = {
  send_email: 'Envoi email',
  expense: 'Depense',
  third_party_write: 'Ecriture tierce',
}

function documentToItem(row: DocumentRow): TimelineItem {
  return {
    id: row.id,
    kind: 'document',
    title: `Document recu (${SOURCE_LABEL[row.source]})`,
    status: row.status,
    timestamp: row.created_at,
    meta: { needsHumanValidation: row.needs_human_validation },
  }
}

function jobRunToItem(row: JobRunRow): TimelineItem {
  return {
    id: row.id,
    kind: 'job_run',
    title: JOB_TYPE_LABEL[row.type] ?? row.type,
    status: row.status,
    timestamp: row.started_at,
    meta: row.error ? { error: row.error } : undefined,
  }
}

function reminderToItem(row: ReminderRow): TimelineItem {
  const amountLabel = row.amount != null ? `${row.amount} ${row.currency}` : row.currency
  return {
    id: row.id,
    kind: 'reminder',
    title: `Echeance ${amountLabel}`,
    status: row.status,
    timestamp: row.due_date,
    meta: { documentId: row.document_id },
  }
}

function pendingActionToItem(row: PendingActionRow): TimelineItem {
  return {
    id: row.id,
    kind: 'pending_action',
    title: `A approuver : ${ACTION_TYPE_LABEL[row.action_type]}`,
    status: row.status,
    timestamp: row.requested_at,
  }
}

/** Fusionne et trie les 4 sources par timestamp decroissant (plus recent/imminent d'abord). */
export function buildTimeline(rows: TimelineSourceRows): TimelineItem[] {
  const items: TimelineItem[] = [
    ...rows.documents.map(documentToItem),
    ...rows.jobRuns.map(jobRunToItem),
    ...rows.reminders.map(reminderToItem),
    ...rows.pendingActions.map(pendingActionToItem),
  ]

  return [...items].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}
