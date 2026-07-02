/**
 * Timeline (chemin de lecture). Contrainte dure : ZERO appel IA en lecture.
 * Lit Supabase seul, scope au tenant courant via la session Auth + RLS.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { Inbox as InboxIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  buildTimeline,
  type DocumentRow,
  type JobRunRow,
  type PendingActionRow,
  type ReminderRow,
  type TimelineItem,
  type TimelineSourceRows,
} from '@/lib/timeline-core'
import { activityByDay, buildCockpitStats, groupItemsByDay } from '@/lib/dashboard-core'
import { statusTone } from '@/lib/status-tone'
import { toneIcon } from '@/lib/status-tone-icon'
import { entityKindSpec } from '@/lib/entity-kind'
import { StatusPill } from '@/components/status-pill'
import { StatCard } from '@/components/stat-card'
import { KindIcon } from '@/components/kind-icon'
import { EmptyState } from '@/components/empty-state'
import { Sparkline } from '@/components/charts/sparkline'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'

const ROW_LIMIT = 30
const ACTIVITY_WINDOW_DAYS = 14

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

/** Heure de Londres : coherent avec le calendrier (aujourd'hui/hier doivent rester justes cote UK). */
function todayInLondon(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())
}

const TODAY_LABEL_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/London',
})
const TIME_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/London',
})
const DUE_DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function itemTime(timestamp: string): string {
  return TIME_FORMATTER.format(new Date(timestamp))
}

/** Le kind est deja porte par l'icone + la pilule : on retire la redite dans le libelle texte. */
function displayTitle(item: TimelineItem): string {
  if (item.kind === 'document') {
    const match = item.title.match(/\(([^)]+)\)$/)
    return match?.[1] ?? item.title
  }
  if (item.kind === 'pending_action') {
    return item.title.replace(/^A approuver\s*:\s*/, '')
  }
  return item.title
}

export default async function TimelinePage() {
  const supabase = await createClient()
  const rows = await loadTimelineRows(supabase)
  const items = buildTimeline(rows)
  const today = todayInLondon()

  const stats = buildCockpitStats(rows)
  const histogram = activityByDay(items, ACTIVITY_WINDOW_DAYS, today)
  const activityTotal = histogram.reduce((sum, value) => sum + value, 0)
  const dayGroups = groupItemsByDay(items, today)

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Timeline</h1>
        <span className={styles.today}>{TODAY_LABEL_FORMATTER.format(new Date())}</span>
      </div>

      <div className={styles.statGrid}>
        <StatCard label="A traiter" value={String(stats.docsToProcess)} kind="document" href="/inbox" />
        <StatCard
          label="Echeances"
          value={String(stats.pendingReminders)}
          kind="reminder"
          href="/calendar"
          hint={
            stats.nextDueDate
              ? `prochaine le ${DUE_DATE_FORMATTER.format(new Date(`${stats.nextDueDate}T00:00:00Z`))}`
              : undefined
          }
        />
        <StatCard
          label="Jobs en cours"
          value={String(stats.runningJobs)}
          kind="job_run"
          hint={stats.erroredJobs > 0 ? `${stats.erroredJobs} erreur${stats.erroredJobs > 1 ? 's' : ''}` : undefined}
          hintTone="danger"
        />
        <StatCard label="A approuver" value={String(stats.pendingActions)} kind="pending_action" />
      </div>

      <div className={styles.activityCard}>
        <div className={styles.activityHeader}>
          <span className={styles.activityLabel}>Activite - 14 derniers jours</span>
          <span className={styles.activityTotal}>{activityTotal}</span>
        </div>
        <Sparkline
          points={histogram}
          height={48}
          ariaLabel={`${activityTotal} evenements sur les 14 derniers jours`}
        />
      </div>

      {dayGroups.length === 0 ? (
        <EmptyState
          icon={<InboxIcon strokeWidth={2} />}
          title="Rien pour le moment."
          hint="Envoyez une facture sur Telegram."
        />
      ) : (
        <div className={styles.feed}>
          {dayGroups.map((group) => (
            <div key={group.date} className={styles.dayGroup}>
              <h2 className={styles.dayLabel}>{group.label}</h2>
              <ul className={styles.list}>
                {group.items.map((item) => {
                  const tone = statusTone(item.kind, item.status)
                  const ToneIcon = toneIcon(tone)
                  const spec = entityKindSpec(item.kind)
                  return (
                    <li
                      key={`${item.kind}-${item.id}`}
                      className={styles.item}
                      style={{ borderLeftColor: spec.vivid }}
                    >
                      <KindIcon kind={item.kind} size="sm" />
                      <span className={styles.itemTitle}>{displayTitle(item)}</span>
                      <StatusPill label={item.status} tone={tone} icon={<ToneIcon strokeWidth={2} />} />
                      <time className={styles.timestamp} dateTime={item.timestamp}>
                        {itemTime(item.timestamp)}
                      </time>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
