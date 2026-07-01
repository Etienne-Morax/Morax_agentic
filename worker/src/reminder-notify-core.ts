/**
 * Morax worker - formatage du message de rappel d'echeance (pur, zero dependance).
 * Le job reminder_notify ne fait ni LLM, ni credits/COGS, ni ack : ce n'est pas
 * un job IA, juste un relai texte vers Telegram.
 */

import type { ReminderNotifyPayload } from '@morax/model-core'

const DAYS_BY_MILESTONE: Record<ReminderNotifyPayload['milestone'], number> = {
  j7: 7,
  j3: 3,
  j1: 1,
}

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY', manipulation de chaine (pas de Date, pas de piege TZ). */
function toDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

function formatAmount(amount: number | undefined, currency: string | undefined): string {
  if (amount == null) return ''
  const suffix = currency ? ` ${currency}` : ''
  return ` — ${amount}${suffix}`
}

/** Construit le texte Telegram pour un rappel du. Leve si le payload est absent/invalide. */
export function formatReminderMessage(reminder: ReminderNotifyPayload | undefined): string {
  if (!reminder) {
    throw new Error('[reminder-notify] job reminder_notify sans payload reminder')
  }

  const days = DAYS_BY_MILESTONE[reminder.milestone]
  const displayDate = toDisplayDate(reminder.due_date)
  const amountPart = formatAmount(reminder.amount, reminder.currency)

  return `Rappel : echeance dans ${days} jour${days > 1 ? 's' : ''} (${displayDate})${amountPart}.`
}
