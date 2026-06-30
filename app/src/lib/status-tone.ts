/**
 * Morax - mappe (kind, status) vers une teinte semantique de design token.
 * Fonction pure, partagee entre timeline et inbox.
 */

import type { TimelineKind } from './timeline-core'

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const DOCUMENT_TONE: Record<string, StatusTone> = {
  received: 'info',
  processing: 'warning',
  extracted: 'info',
  incomplete: 'warning',
  validated: 'success',
  archived: 'neutral',
}

const JOB_RUN_TONE: Record<string, StatusTone> = {
  running: 'warning',
  done: 'success',
  error: 'danger',
}

const REMINDER_TONE: Record<string, StatusTone> = {
  pending: 'warning',
  paid: 'success',
  dismissed: 'neutral',
}

const PENDING_ACTION_TONE: Record<string, StatusTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  executed: 'success',
  expired: 'neutral',
}

const TONE_BY_KIND: Record<TimelineKind, Record<string, StatusTone>> = {
  document: DOCUMENT_TONE,
  job_run: JOB_RUN_TONE,
  reminder: REMINDER_TONE,
  pending_action: PENDING_ACTION_TONE,
}

export function statusTone(kind: TimelineKind, status: string): StatusTone {
  return TONE_BY_KIND[kind][status] ?? 'neutral'
}
