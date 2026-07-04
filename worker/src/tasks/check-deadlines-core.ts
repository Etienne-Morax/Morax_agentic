/**
 * Morax worker - formatage du digest d'echeances (pur, zero dependance).
 * Comme reminder-notify-core.ts : ni LLM, ni credits/COGS, juste un relai
 * texte vers Telegram. Le filtrage "aujourd'hui" est deja fait par les ports
 * (listOverdue/listUpcoming) : ce module ne fait que mettre en forme.
 */

import type { ReminderSummaryRow } from '../ports.js'

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY', manipulation de chaine (pas de Date, pas de piege TZ). */
function toDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

function formatAmount(amount: number | null, currency: string): string {
  if (amount == null) return ''
  return ` — ${amount} ${currency}`
}

function formatLine(reminder: ReminderSummaryRow): string {
  return `- ${toDisplayDate(reminder.dueDate)}${formatAmount(reminder.amount, reminder.currency)}`
}

function formatSection(title: string, rows: readonly ReminderSummaryRow[]): string {
  return [`${title} :`, ...rows.map(formatLine)].join('\n')
}

/** Construit le texte Telegram du digest d'echeances. Court : message sur telephone. */
export function formatDeadlinesDigest(
  overdue: readonly ReminderSummaryRow[],
  upcoming: readonly ReminderSummaryRow[],
): string {
  if (overdue.length === 0 && upcoming.length === 0) {
    return 'Aucune echeance en retard ni a venir sous 7 jours.'
  }

  const sections: string[] = []
  if (overdue.length > 0) {
    sections.push(formatSection('EN RETARD', overdue))
  }
  if (upcoming.length > 0) {
    sections.push(formatSection('A VENIR (7 jours)', upcoming))
  }

  return sections.join('\n\n')
}
