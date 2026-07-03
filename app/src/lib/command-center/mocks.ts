/**
 * Centre de Commandement - donnees de demonstration.
 * Timestamps figes (pas de Date.now()) pour un rendu deterministe entre les runs.
 * Seul CHAT_MESSAGES reste mock : aucune table historique de conversation
 * n'existe encore (voir CHAT_HISTORY_SOURCE dans queries.ts). Les raccourcis
 * Launchpad vivent desormais dans shortcuts.ts, les operations dans job_runs.
 */

import type { ChatMessage } from './types'

export const CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'chat-1',
    role: 'agent',
    content: 'Bonjour Etienne. 2 echeances arrivent cette semaine, je peux les relancer si tu veux.',
    createdAt: '2026-07-03T08:02:00Z',
  },
  {
    id: 'chat-2',
    role: 'user',
    content: 'Oui, vas-y pour les deux.',
    createdAt: '2026-07-03T08:03:10Z',
  },
  {
    id: 'chat-3',
    role: 'agent',
    content: 'Note : ce sont des relances client, donc je passe par le gate Telegram avant envoi.',
    createdAt: '2026-07-03T08:03:25Z',
  },
  {
    id: 'chat-4',
    role: 'user',
    content: "Parfait, tiens moi au courant quand c'est approuve.",
    createdAt: '2026-07-03T08:04:02Z',
  },
  {
    id: 'chat-5',
    role: 'agent',
    content: 'Recu. En parallele, 3 documents attendent verification dans Inbox.',
    createdAt: '2026-07-03T08:04:40Z',
  },
  {
    id: 'chat-6',
    role: 'user',
    content: 'Je regarde ca ce soir.',
    createdAt: '2026-07-03T08:05:01Z',
  },
  {
    id: 'chat-7',
    role: 'agent',
    content: "D'accord, je te fais un resume a 18h.",
    createdAt: '2026-07-03T08:05:18Z',
  },
  {
    id: 'chat-8',
    role: 'user',
    content: 'Merci.',
    createdAt: '2026-07-03T08:05:30Z',
  },
]
