/**
 * Timeline (chemin de lecture). Contrainte dure : ZERO appel IA en lecture.
 * Lit Supabase seul, scope au tenant courant via la session Auth + RLS.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
  buildTimeline,
  type DocumentRow,
  type JobRunRow,
  type PendingActionRow,
  type ReminderRow,
  type TimelineSourceRows,
} from '@/lib/timeline-core'
import { statusTone } from '@/lib/status-tone'
import { StatusPill } from '@/components/status-pill'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'

const ROW_LIMIT = 30

async function loadTimelineRows(supabase: SupabaseClient): Promise<TimelineSourceRows> {
  const [documents, jobRuns, reminders, pendingActions] = await Promise.all([
    supabase
      .from('documents')
      .select('id, source, status, needs_human_validation, created_at')
      .order('created_at', { ascending: false })
      .limit(ROW_LIMIT),
    supabase
      .from('job_runs')
      .select('id, type, status, error, started_at')
      .order('started_at', { ascending: false })
      .limit(ROW_LIMIT),
    supabase
      .from('reminders')
      .select('id, document_id, due_date, amount, currency, status')
      .order('due_date', { ascending: true })
      .limit(ROW_LIMIT),
    supabase
      .from('pending_actions')
      .select('id, action_type, status, requested_at')
      .order('requested_at', { ascending: false })
      .limit(ROW_LIMIT),
  ])

  if (documents.error) throw new Error(`[timeline] documents: ${documents.error.message}`)
  if (jobRuns.error) throw new Error(`[timeline] job_runs: ${jobRuns.error.message}`)
  if (reminders.error) throw new Error(`[timeline] reminders: ${reminders.error.message}`)
  if (pendingActions.error) {
    throw new Error(`[timeline] pending_actions: ${pendingActions.error.message}`)
  }

  return {
    documents: (documents.data ?? []) as DocumentRow[],
    jobRuns: (jobRuns.data ?? []) as JobRunRow[],
    reminders: (reminders.data ?? []) as ReminderRow[],
    pendingActions: (pendingActions.data ?? []) as PendingActionRow[],
  }
}

export default async function TimelinePage() {
  const supabase = await createClient()
  const rows = await loadTimelineRows(supabase)
  const items = buildTimeline(rows)

  return (
    <section>
      <h1 className={styles.title}>Timeline</h1>
      {items.length === 0 ? (
        <p className={styles.empty}>Rien pour le moment. Envoyez une facture sur Telegram.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className={styles.item}>
              <div className={styles.itemHeader}>
                <span className={styles.itemTitle}>{item.title}</span>
                <StatusPill label={item.status} tone={statusTone(item.kind, item.status)} />
              </div>
              <time className={styles.timestamp} dateTime={item.timestamp}>
                {new Date(item.timestamp).toLocaleString('en-GB')}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
