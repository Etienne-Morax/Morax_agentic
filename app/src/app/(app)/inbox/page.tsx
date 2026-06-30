/**
 * Inbox (chemin de lecture). Documents a traiter + rappels en attente.
 * ZERO appel IA. Lit Supabase seul, scope au tenant courant via RLS.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buildInbox, type DocumentRow, type InboxRows, type ReminderRow } from '@/lib/inbox-core'
import { statusTone } from '@/lib/status-tone'
import { StatusPill } from '@/components/status-pill'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'

const ROW_LIMIT = 50

async function loadInboxRows(supabase: SupabaseClient): Promise<InboxRows> {
  const [documents, reminders] = await Promise.all([
    supabase
      .from('documents')
      .select('id, source, status, needs_human_validation, created_at')
      .order('created_at', { ascending: false })
      .limit(ROW_LIMIT),
    supabase
      .from('reminders')
      .select('id, document_id, due_date, amount, currency, status')
      .order('due_date', { ascending: true })
      .limit(ROW_LIMIT),
  ])

  if (documents.error) throw new Error(`[inbox] documents: ${documents.error.message}`)
  if (reminders.error) throw new Error(`[inbox] reminders: ${reminders.error.message}`)

  return {
    documents: (documents.data ?? []) as DocumentRow[],
    reminders: (reminders.data ?? []) as ReminderRow[],
  }
}

export default async function InboxPage() {
  const supabase = await createClient()
  const rows = await loadInboxRows(supabase)
  const view = buildInbox(rows)

  return (
    <section>
      <h1 className={styles.title}>Inbox</h1>

      <h2 className={styles.sectionTitle}>Documents a traiter</h2>
      {view.documents.length === 0 ? (
        <p className={styles.empty}>Rien a traiter. Bien joue.</p>
      ) : (
        <ul className={styles.list}>
          {view.documents.map((document) => (
            <li key={document.id} className={styles.item}>
              <Link className={styles.itemLink} href={`/inbox/${document.id}`}>
                <span className={styles.itemTitle}>Document ({document.source})</span>
                <StatusPill label={document.status} tone={statusTone('document', document.status)} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className={styles.sectionTitle}>Echeances a venir</h2>
      {view.reminders.length === 0 ? (
        <p className={styles.empty}>Aucune echeance en attente.</p>
      ) : (
        <ul className={styles.list}>
          {view.reminders.map((reminder) => (
            <li key={reminder.id} className={styles.item}>
              <div className={styles.itemRow}>
                <span className={styles.itemTitle}>
                  {reminder.amount != null ? `${reminder.amount} ${reminder.currency}` : reminder.currency}
                </span>
                <StatusPill label={reminder.status} tone={statusTone('reminder', reminder.status)} />
              </div>
              <time className={styles.timestamp} dateTime={reminder.due_date}>
                Echeance : {new Date(reminder.due_date).toLocaleDateString('en-GB')}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
