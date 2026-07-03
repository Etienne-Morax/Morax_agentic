/**
 * Centre de Commandement - types partages entre les pages Launchpad/Operations/Commande.
 * Ces formes miment volontairement les tables Supabase visees (job_runs, pending_actions)
 * pour que le passage du mock au reel ne change aucun composant consommateur.
 */

import type { EntityKind } from '@/lib/entity-kind'

export type ShortcutStatus = 'ready' | 'running' | 'attention' | 'off'

export interface LaunchpadShortcut {
  id: string
  title: string
  /** Cle resolue vers un LucideIcon cote client (une fonction ne traverse pas server->client). */
  icon: string
  kind: EntityKind
  status: ShortcutStatus
  description?: string
}

export type OpsStatus = 'running' | 'done' | 'error' | 'queued'

export interface OpsFeedEntry {
  id: string
  /** ISO 8601, miroir de job_runs.started_at. */
  occurredAt: string
  agent: string
  action: string
  status: OpsStatus
  kind: EntityKind
  detail?: string
}

export type ChatRole = 'user' | 'agent'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: string
}

/** Forme du futur retour d'enqueueAction : jamais d'execution directe pour un raccourci HIGH-risk. */
export interface TriggerResult {
  ok: boolean
  queuedActionId?: string
  message: string
}
