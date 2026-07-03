/**
 * Centre de Commandement - couche donnees.
 * Iteration mock : chaque fonction a deja la forme (async, retour type) de sa
 * contrepartie Supabase, pour que le branchement reel ne touche aucun composant.
 * Bascule prevue :
 *   getLaunchpadShortcuts -> config statique ou table shortcuts (a definir)
 *   getOperationsFeed     -> select job_runs order by started_at desc limit N
 *   getChatMessages       -> table historique conversation agent (a definir)
 *   triggerShortcut       -> enqueueAction(risk) -> insert pending_actions,
 *                            jamais d'execution directe cote UI (gate Telegram).
 */

import { CHAT_MESSAGES, LAUNCHPAD_SHORTCUTS, OPERATIONS_FEED } from './mocks'
import type { ChatMessage, LaunchpadShortcut, OpsFeedEntry, TriggerResult } from './types'

const MOCK_TRIGGER_DELAY_MS = 400

export async function getLaunchpadShortcuts(): Promise<LaunchpadShortcut[]> {
  return LAUNCHPAD_SHORTCUTS
}

export async function getOperationsFeed(limit = 20): Promise<OpsFeedEntry[]> {
  return OPERATIONS_FEED.slice(0, limit)
}

export async function getChatMessages(): Promise<ChatMessage[]> {
  return CHAT_MESSAGES
}

export async function triggerShortcut(id: string): Promise<TriggerResult> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_TRIGGER_DELAY_MS))
  return { ok: true, message: `Raccourci "${id}" declenche (mock).` }
}
