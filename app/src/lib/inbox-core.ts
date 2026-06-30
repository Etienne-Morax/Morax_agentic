/**
 * Morax - vue inbox (lecture seule, ZERO appel IA).
 * Filtre les documents qui attendent une action humaine et les rappels en attente.
 * Fonction pure, testable sans mock.
 */

import type { DocumentRow, DocumentStatus, ReminderRow } from './timeline-core'

export type { DocumentRow, ReminderRow }

const ACTIONABLE_DOCUMENT_STATUSES: readonly DocumentStatus[] = [
  'received',
  'processing',
  'extracted',
  'incomplete',
]

export interface InboxRows {
  documents: readonly DocumentRow[]
  reminders: readonly ReminderRow[]
}

export interface InboxView {
  documents: DocumentRow[]
  reminders: ReminderRow[]
}

function needsAttention(document: DocumentRow): boolean {
  return (
    ACTIONABLE_DOCUMENT_STATUSES.includes(document.status) || document.needs_human_validation
  )
}

/** Documents les plus recents d'abord, rappels les plus proches d'echeance d'abord. */
export function buildInbox(rows: InboxRows): InboxView {
  const documents = [...rows.documents]
    .filter(needsAttention)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  const reminders = [...rows.reminders]
    .filter((reminder) => reminder.status === 'pending')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))

  return { documents, reminders }
}
