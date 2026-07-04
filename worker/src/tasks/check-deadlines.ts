/**
 * Morax worker - "Verifier les echeances" (bouton Launchpad check-deadlines).
 * Lecture seule + formatage deterministe (comme reminder-notify-core.ts) :
 * pas de LLM, pas de credits/COGS. Digest des echeances a venir/en retard,
 * envoye en self-notify (Telegram + push).
 */

import type { TaskContext } from './types.js'

export async function checkDeadlines(_ctx: TaskContext): Promise<void> {
  throw new Error('[tasks/check-deadlines] pas encore implemente')
}
