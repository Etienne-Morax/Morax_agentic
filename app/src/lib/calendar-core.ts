/**
 * Morax - construction d'une grille calendrier mensuelle (lecture seule, ZERO appel IA).
 * Fonction pure : aucune dependance reseau, pas de new Date()/Date.now() implicite.
 * `today` est toujours injecte par l'appelant pour rester deterministe et testable.
 */

import type { ReminderRow } from './timeline-core'

const DAYS_PER_WEEK = 7
const WEEKS_IN_GRID = 6
const GRID_CELL_COUNT = WEEKS_IN_GRID * DAYS_PER_WEEK
const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface CalendarInput {
  reminders: readonly ReminderRow[]
  /** Mois affiche, format 'YYYY-MM'. */
  month: string
  /** Date du jour, format 'YYYY-MM-DD', injectee par l'appelant. */
  today: string
}

export interface CalendarReminder extends ReminderRow {
  isOverdue: boolean
}

export interface DayCell {
  date: string
  day: number
  inMonth: boolean
  isToday: boolean
  reminders: CalendarReminder[]
}

export interface CalendarSummary {
  overdueCount: number
  pendingInMonth: number
  paidInMonth: number
}

export interface CalendarMonth {
  month: string
  prevMonth: string
  nextMonth: string
  weeks: DayCell[][]
  overdue: CalendarReminder[]
  remindersOfMonth: CalendarReminder[]
  summary: CalendarSummary
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function parseYearMonth(month: string): { year: number; monthIndex: number } {
  const [yearPart, monthPart] = month.split('-')
  return { year: Number(yearPart), monthIndex: Number(monthPart) - 1 }
}

function formatISODate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`
}

/** 0 = lundi ... 6 = dimanche (JS getUTCDay est 0 = dimanche). */
function mondayFirstWeekday(year: number, monthIndex: number, day: number): number {
  return (new Date(Date.UTC(year, monthIndex, day)).getUTCDay() + 6) % 7
}

/** Decale un mois 'YYYY-MM' de `delta` mois, gere le passage d'annee. */
export function addMonths(month: string, delta: number): string {
  const { year, monthIndex } = parseYearMonth(month)
  const total = year * 12 + monthIndex + delta
  const newYear = Math.floor(total / 12)
  const newMonthIndex = ((total % 12) + 12) % 12
  return `${newYear}-${pad2(newMonthIndex + 1)}`
}

function isOverdue(reminder: ReminderRow, today: string): boolean {
  return reminder.status === 'pending' && reminder.due_date < today
}

function toCalendarReminder(reminder: ReminderRow, today: string): CalendarReminder {
  return { ...reminder, isOverdue: isOverdue(reminder, today) }
}

/** Construit la grille 6x7 (lundi en premier) couvrant `month`, avec debordement. */
export function buildCalendarMonth(input: CalendarInput): CalendarMonth {
  const { reminders, month, today } = input
  const { year, monthIndex } = parseYearMonth(month)

  const calendarReminders = reminders.map((reminder) => toCalendarReminder(reminder, today))
  const remindersByDate = new Map<string, CalendarReminder[]>()
  for (const reminder of calendarReminders) {
    const bucket = remindersByDate.get(reminder.due_date) ?? []
    bucket.push(reminder)
    remindersByDate.set(reminder.due_date, bucket)
  }

  const firstWeekday = mondayFirstWeekday(year, monthIndex, 1)
  const gridStartMs = Date.UTC(year, monthIndex, 1) - firstWeekday * MS_PER_DAY

  const cells: DayCell[] = []
  for (let i = 0; i < GRID_CELL_COUNT; i += 1) {
    const cellDate = new Date(gridStartMs + i * MS_PER_DAY)
    const cellYear = cellDate.getUTCFullYear()
    const cellMonthIndex = cellDate.getUTCMonth()
    const cellDay = cellDate.getUTCDate()
    const date = formatISODate(cellYear, cellMonthIndex, cellDay)

    cells.push({
      date,
      day: cellDay,
      inMonth: cellYear === year && cellMonthIndex === monthIndex,
      isToday: date === today,
      reminders: remindersByDate.get(date) ?? [],
    })
  }

  const weeks: DayCell[][] = []
  for (let w = 0; w < WEEKS_IN_GRID; w += 1) {
    weeks.push(cells.slice(w * DAYS_PER_WEEK, (w + 1) * DAYS_PER_WEEK))
  }

  const overdue = calendarReminders
    .filter((reminder) => reminder.isOverdue)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))

  const remindersInMonth = calendarReminders.filter((reminder) =>
    reminder.due_date.startsWith(month),
  )

  const remindersOfMonth = [...remindersInMonth].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1
    if (a.status !== 'pending' && b.status === 'pending') return 1
    return a.due_date.localeCompare(b.due_date)
  })

  return {
    month,
    prevMonth: addMonths(month, -1),
    nextMonth: addMonths(month, 1),
    weeks,
    overdue,
    remindersOfMonth,
    summary: {
      overdueCount: overdue.length,
      pendingInMonth: remindersInMonth.filter((reminder) => reminder.status === 'pending').length,
      paidInMonth: remindersInMonth.filter((reminder) => reminder.status === 'paid').length,
    },
  }
}
