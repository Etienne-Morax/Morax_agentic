/**
 * Morax - derivations pour le cockpit Timeline (lecture seule, ZERO appel IA).
 * Fonctions pures calculees a partir des lignes deja chargees par page.tsx.
 * `today` est toujours injecte par l'appelant pour rester deterministe et testable.
 */

import type { DocumentStatus, TimelineItem, TimelineSourceRows } from './timeline-core'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const WARNING_WINDOW_DAYS = 7

const ACTIONABLE_DOCUMENT_STATUSES: readonly DocumentStatus[] = [
  'received',
  'processing',
  'extracted',
  'incomplete',
]

export interface CockpitStats {
  docsToProcess: number
  pendingReminders: number
  nextDueDate: string | null
  runningJobs: number
  erroredJobs: number
  pendingActions: number
}

/** Chiffres-cles de la rangee de StatCards du cockpit. */
export function buildCockpitStats(rows: TimelineSourceRows): CockpitStats {
  const docsToProcess = rows.documents.filter(
    (document) => ACTIONABLE_DOCUMENT_STATUSES.includes(document.status) || document.needs_human_validation,
  ).length

  const pending = rows.reminders.filter((reminder) => reminder.status === 'pending')
  const nextDueDate = pending.reduce<string | null>(
    (earliest, reminder) => (earliest === null || reminder.due_date < earliest ? reminder.due_date : earliest),
    null,
  )

  const runningJobs = rows.jobRuns.filter((jobRun) => jobRun.status === 'running').length
  const erroredJobs = rows.jobRuns.filter((jobRun) => jobRun.status === 'error').length
  const pendingActions = rows.pendingActions.filter((action) => action.status === 'pending').length

  return {
    docsToProcess,
    pendingReminders: pending.length,
    nextDueDate,
    runningJobs,
    erroredJobs,
    pendingActions,
  }
}

/** Histogramme des `days` derniers jours (le plus ancien en premier), pour la sparkline d'activite. */
export function activityByDay(items: readonly TimelineItem[], days: number, today: string): number[] {
  const todayMs = Date.parse(`${today}T00:00:00Z`)
  const countsByOffset = new Map<number, number>()

  for (const item of items) {
    const itemDate = item.timestamp.slice(0, 10)
    const itemMs = Date.parse(`${itemDate}T00:00:00Z`)
    const offset = Math.round((todayMs - itemMs) / MS_PER_DAY)
    if (offset >= 0 && offset < days) {
      countsByOffset.set(offset, (countsByOffset.get(offset) ?? 0) + 1)
    }
  }

  return Array.from({ length: days }, (_, index) => countsByOffset.get(days - 1 - index) ?? 0)
}

function addDaysIso(date: string, delta: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + delta * MS_PER_DAY
  return new Date(ms).toISOString().slice(0, 10)
}

const WEEKDAY_MONTH_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

function dayLabel(date: string, today: string): string {
  if (date === today) return "Aujourd'hui"
  if (date === addDaysIso(today, -1)) return 'Hier'
  return WEEKDAY_MONTH_FORMATTER.format(new Date(`${date}T00:00:00Z`))
}

export interface DayGroup {
  date: string
  label: string
  items: TimelineItem[]
}

/** Regroupe les items par jour calendaire (le plus recent en premier), avec un libelle relatif. */
export function groupItemsByDay(items: readonly TimelineItem[], today: string): DayGroup[] {
  const groups = new Map<string, TimelineItem[]>()
  for (const item of items) {
    const date = item.timestamp.slice(0, 10)
    const bucket = groups.get(date) ?? []
    groups.set(date, [...bucket, item])
  }

  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, dayItems]) => ({ date, label: dayLabel(date, today), items: dayItems }))
}

export type DueTone = 'danger' | 'warning' | 'neutral'

/** Classe une echeance : passee (danger), proche (warning, <= 7 jours), ou lointaine (neutral). */
export function dueTone(dueDate: string, today: string): DueTone {
  if (dueDate < today) return 'danger'
  const diffDays = Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / MS_PER_DAY,
  )
  return diffDays <= WARNING_WINDOW_DAYS ? 'warning' : 'neutral'
}
