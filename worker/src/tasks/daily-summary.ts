/**
 * Morax worker - "Resume du jour" (bouton Launchpad daily-summary).
 * Agrege ports.dashboard.summarizeDay() puis redige un resume (LLM, cerveau
 * non-finance, categorie resume_financier) envoye en self-notify.
 */

import type { TaskContext } from './types.js'

export async function dailySummary(_ctx: TaskContext): Promise<void> {
  throw new Error('[tasks/daily-summary] pas encore implemente')
}
