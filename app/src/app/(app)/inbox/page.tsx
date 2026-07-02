/**
 * Inbox (chemin de lecture). Documents a traiter + rappels en attente.
 * ZERO appel IA. Lit Supabase seul, scope au tenant courant via RLS.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { BellRing, CalendarCheck, ChevronRight, CircleCheck, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { buildInbox, type DocumentRow, type InboxRows, type ReminderRow } from '@/lib/inbox-core'
import { dueTone } from '@/lib/dashboard-core'
import { statusTone } from '@/lib/status-tone'
import { toneIcon } from '@/lib/status-tone-icon'
import { SOURCE_ICON } from '@/lib/entity-kind'
import { StatusPill } from '@/components/status-pill'
import { SectionCard } from '@/components/section-card'
import { KindIcon } from '@/components/kind-icon'
import { EmptyState } from '@/components/empty-state'
import { ReminderActions } from '../calendar/reminder-actions'
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

/** Heure de Londres : coherent avec le calendrier (echeances en retard justes cote UK). */
function todayInLondon(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())
}

const DUE_DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function dueLabel(dueDate: string): string {
  return DUE_DATE_FORMATTER.format(new Date(`${dueDate}T00:00:00Z`))
}

export default async function InboxPage() {
  const supabase = await createClient()
  const rows = await loadInboxRows(supabase)
  const view = buildInbox(rows)
  const today = todayInLondon()

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Inbox</h1>

      <div className={styles.grid}>
        <SectionCard title="A traiter" icon={<FileText strokeWidth={2} />} count={view.documents.length}>
          {view.documents.length === 0 ? (
            <EmptyState icon={<CircleCheck strokeWidth={2} />} title="Rien a traiter. Bien joue." />
          ) : (
            <ul className={styles.list}>
              {view.documents.map((document) => {
                const tone = statusTone('document', document.status)
                const ToneIcon = toneIcon(tone)
                const SourceIcon = SOURCE_ICON[document.source]
                return (
                  <li key={document.id} className={styles.item}>
                    <Link className={`${styles.itemLink} pressable`} href={`/inbox/${document.id}`}>
                      <KindIcon kind="document" size="sm" />
                      <span className={styles.itemBody}>
                        <SourceIcon className={styles.sourceIcon} strokeWidth={2} aria-hidden="true" />
                        <StatusPill label={document.status} tone={tone} icon={<ToneIcon strokeWidth={2} />} />
                      </span>
                      <ChevronRight className={styles.chevron} strokeWidth={2} aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Echeances a venir" icon={<BellRing strokeWidth={2} />} count={view.reminders.length}>
          {view.reminders.length === 0 ? (
            <EmptyState icon={<CalendarCheck strokeWidth={2} />} title="Aucune echeance en attente." />
          ) : (
            <ul className={styles.list}>
              {view.reminders.map((reminder) => (
                <li key={reminder.id} className={styles.reminderItem}>
                  <div className={styles.reminderRow}>
                    <span className={styles.amount}>
                      {reminder.amount != null ? `${reminder.amount} ${reminder.currency}` : reminder.currency}
                    </span>
                    <StatusPill label={dueLabel(reminder.due_date)} tone={dueTone(reminder.due_date, today)} />
                  </div>
                  <ReminderActions reminderId={reminder.id} status={reminder.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </section>
  )
}
