/**
 * Centre de Commandement - donnees de demonstration.
 * Timestamps figes (pas de Date.now()) pour un rendu deterministe entre les runs.
 */

import type { ChatMessage, LaunchpadShortcut, OpsFeedEntry } from './types'

export const LAUNCHPAD_SHORTCUTS: LaunchpadShortcut[] = [
  {
    id: 'scan-document',
    title: 'Scanner un document',
    icon: 'scan',
    kind: 'document',
    status: 'ready',
    description: 'OCR et classement immediat.',
  },
  {
    id: 'chase-unpaid',
    title: 'Relancer les impayes',
    icon: 'bell-ring',
    kind: 'reminder',
    status: 'attention',
    description: '3 echeances en retard.',
  },
  {
    id: 'generate-quote',
    title: 'Generer un devis',
    icon: 'file-signature',
    kind: 'draft',
    status: 'ready',
  },
  {
    id: 'check-deadlines',
    title: 'Verifier les echeances',
    icon: 'calendar-check',
    kind: 'reminder',
    status: 'ready',
  },
  {
    id: 'daily-summary',
    title: 'Resume du jour',
    icon: 'sparkles',
    kind: 'job_run',
    status: 'running',
    description: 'Compilation en cours.',
  },
  {
    id: 'sort-inbox',
    title: "Classer l'inbox",
    icon: 'inbox',
    kind: 'document',
    status: 'off',
  },
]

export const OPERATIONS_FEED: OpsFeedEntry[] = [
  {
    id: 'op-1',
    occurredAt: '2026-07-03T09:14:02Z',
    agent: 'Archiviste',
    action: 'Classement facture EDF (12,40 EUR)',
    status: 'done',
    kind: 'document',
  },
  {
    id: 'op-2',
    occurredAt: '2026-07-03T09:16:41Z',
    agent: 'Comptable',
    action: 'Rapprochement releve bancaire juin',
    status: 'running',
    kind: 'job_run',
  },
  {
    id: 'op-3',
    occurredAt: '2026-07-03T09:18:09Z',
    agent: 'Relanceur',
    action: 'Relance client Dupont (facture #2024-118)',
    status: 'queued',
    kind: 'reminder',
  },
  {
    id: 'op-4',
    occurredAt: '2026-07-03T09:21:55Z',
    agent: 'Redacteur',
    action: 'Brouillon devis "Refonte site"',
    status: 'done',
    kind: 'draft',
  },
  {
    id: 'op-5',
    occurredAt: '2026-07-03T09:24:30Z',
    agent: 'Archiviste',
    action: 'OCR bon de commande fournisseur',
    status: 'error',
    kind: 'document',
    detail: 'Scan illisible, page 2/3.',
  },
  {
    id: 'op-6',
    occurredAt: '2026-07-03T09:27:12Z',
    agent: 'Comptable',
    action: 'Calcul TVA T2 2026',
    status: 'running',
    kind: 'job_run',
  },
  {
    id: 'op-7',
    occurredAt: '2026-07-03T09:30:47Z',
    agent: 'Relanceur',
    action: 'Rappel echeance loyer local',
    status: 'done',
    kind: 'reminder',
  },
  {
    id: 'op-8',
    occurredAt: '2026-07-03T09:33:20Z',
    agent: 'Archiviste',
    action: 'Import 4 recus Telegram',
    status: 'done',
    kind: 'document',
  },
  {
    id: 'op-9',
    occurredAt: '2026-07-03T09:36:05Z',
    agent: 'Redacteur',
    action: 'Envoi devis "Maintenance annuelle" en attente approbation',
    status: 'queued',
    kind: 'draft',
  },
  {
    id: 'op-10',
    occurredAt: '2026-07-03T09:38:52Z',
    agent: 'Comptable',
    action: 'Verification credits restants',
    status: 'done',
    kind: 'job_run',
  },
]

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
