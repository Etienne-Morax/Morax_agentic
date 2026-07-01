/**
 * Calendrier des rappels (chemin de lecture). ZERO appel IA.
 * Lit `reminders` seul, scope au tenant courant via RLS. Le mois affiche est
 * porte par l'URL (`?month=YYYY-MM`), pas par un etat client.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buildCalendarMonth, type CalendarReminder } from '@/lib/calendar-core'
import type { ReminderRow } from '@/lib/timeline-core'
import { statusTone } from '@/lib/status-tone'
import { StatusPill } from '@/components/status-pill'
import { ReminderActions } from './reminder-actions'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'

const ROW_LIMIT = 200
const MONTH_PARAM_REGEX = /^\d{4}-\d{2}$/
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

interface CalendarPageProps {
  searchParams: Promise<{ month?: string }>
}

async function loadReminders(supabase: SupabaseClient): Promise<ReminderRow[]> {
  const { data, error } = await supabase
    .from('reminders')
    .select('id, document_id, due_date, amount, currency, status')
    .order('due_date', { ascending: true })
    .limit(ROW_LIMIT)

  if (error) throw new Error(`[calendar] reminders: ${error.message}`)
  return (data ?? []) as ReminderRow[]
}

/** Heure de Londres : "aujourd'hui" et "en retard" doivent rester justes cote UK. */
function todayInLondon(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())
}

function resolveMonth(requested: string | undefined, today: string): string {
  if (requested && MONTH_PARAM_REGEX.test(requested)) return requested
  return today.slice(0, 7)
}

function monthLabel(month: string): string {
  const [year, monthPart] = month.split('-')
  const date = new Date(Date.UTC(Number(year), Number(monthPart) - 1, 1))
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    date,
  )
}

function amountLabel(reminder: Pick<CalendarReminder, 'amount' | 'currency'>): string {
  return reminder.amount != null ? `${reminder.amount} ${reminder.currency}` : reminder.currency
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const params = await searchParams
  const supabase = await createClient()

  const today = todayInLondon()
  const month = resolveMonth(params.month, today)
  const reminders = await loadReminders(supabase)
  const calendar = buildCalendarMonth({ reminders, month, today })

  return (
    <section>
      <div className={styles.header}>
        <h1 className={styles.title}>Calendrier</h1>
        <nav className={styles.monthNav} aria-label="Navigation mois">
          <Link className={styles.monthLink} href={`/calendar?month=${calendar.prevMonth}`}>
            &larr; Precedent
          </Link>
          <span className={styles.monthLabel}>{monthLabel(month)}</span>
          <Link className={styles.monthLink} href={`/calendar?month=${calendar.nextMonth}`}>
            Suivant &rarr;
          </Link>
        </nav>
      </div>

      <div className={styles.overduePanel} data-empty={calendar.overdue.length === 0}>
        <h2 className={styles.overdueTitle}>
          {calendar.overdue.length === 0
            ? 'Aucune echeance en retard'
            : `${calendar.overdue.length} echeance${calendar.overdue.length > 1 ? 's' : ''} en retard`}
        </h2>
        {calendar.overdue.length === 0 ? (
          <p className={styles.empty}>Rien a rattraper. Bien joue.</p>
        ) : (
          <ul className={styles.overdueList}>
            {calendar.overdue.map((reminder) => (
              <li key={reminder.id} className={styles.overdueItem}>
                <div className={styles.overdueInfo}>
                  <span className={styles.itemTitle}>{amountLabel(reminder)}</span>
                  <time className={styles.timestamp} dateTime={reminder.due_date}>
                    Echeance : {new Date(reminder.due_date).toLocaleDateString('en-GB')}
                  </time>
                </div>
                <ReminderActions reminderId={reminder.id} status={reminder.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.grid}>
        <div className={styles.weekdays}>
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className={styles.weekdayLabel}>
              {label}
            </span>
          ))}
        </div>
        {calendar.weeks.map((week, weekIndex) => (
          <div key={weekIndex} className={styles.week}>
            {week.map((cell) => (
              <div
                key={cell.date}
                className={styles.day}
                data-in-month={cell.inMonth}
                data-today={cell.isToday}
              >
                <span className={styles.dayNumber}>{cell.day}</span>
                {cell.reminders.map((reminder) => (
                  <span key={reminder.id} className={styles.dayReminder}>
                    <StatusPill
                      label={amountLabel(reminder)}
                      tone={reminder.isOverdue ? 'danger' : statusTone('reminder', reminder.status)}
                    />
                  </span>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      <h2 className={styles.sectionTitle}>Rappels du mois</h2>
      {calendar.remindersOfMonth.length === 0 ? (
        <p className={styles.empty}>Aucun rappel ce mois-ci.</p>
      ) : (
        <ul className={styles.list}>
          {calendar.remindersOfMonth.map((reminder) => (
            <li key={reminder.id} className={styles.item}>
              <div className={styles.itemRow}>
                <span className={styles.itemTitle}>{amountLabel(reminder)}</span>
                <StatusPill
                  label={reminder.status}
                  tone={reminder.isOverdue ? 'danger' : statusTone('reminder', reminder.status)}
                />
              </div>
              <time className={styles.timestamp} dateTime={reminder.due_date}>
                Echeance : {new Date(reminder.due_date).toLocaleDateString('en-GB')}
              </time>
              <ReminderActions reminderId={reminder.id} status={reminder.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
