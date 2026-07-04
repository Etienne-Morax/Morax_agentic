/**
 * Morax worker - "Verifier les echeances" (bouton Launchpad check-deadlines).
 * Lecture seule + formatage deterministe (comme reminder-notify-core.ts) :
 * pas de LLM, pas de credits/COGS. Digest des echeances a venir/en retard,
 * envoye en self-notify (Telegram + push).
 */

import { formatDeadlinesDigest } from './check-deadlines-core.js'
import type { TaskContext } from './types.js'

const UPCOMING_WINDOW_DAYS = 7

export async function checkDeadlines(ctx: TaskContext): Promise<void> {
  const overdue = await ctx.ports.reminders.listOverdue(ctx.tenant.tenant_id)
  const upcoming = await ctx.ports.reminders.listUpcoming(ctx.tenant.tenant_id, UPCOMING_WINDOW_DAYS)

  const text = formatDeadlinesDigest(overdue, upcoming)

  await ctx.ports.notifier.notifyReminderDue(ctx.tenant.tenant_id, text)
}
