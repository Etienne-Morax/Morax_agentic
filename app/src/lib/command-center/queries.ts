/**
 * Centre de Commandement - couche donnees.
 * getLaunchpadShortcuts / getOperationsFeed / getChatMessages lisent Supabase
 * (RLS, client authentifie). triggerShortcut est une Server Action
 * ((command)/launchpad/actions.ts) : navigation, creation de brouillon, ou
 * enfilage d'un job reel (jamais plus d'agent_task HIGH mort-ne, cf. 0013).
 * Le statut affiche pour un raccourci 'job' vient de la derniere ligne
 * job_runs pour ce type -- pas de polling temps reel, router.refresh() apres
 * declenchement suffit (meme pattern que le reste du Launchpad).
 * L'envoi de message chat suit un principe voisin : sendCommandMessage
 * ((command)/command/actions.ts) est une Server Action qui insere dans
 * command_messages sans jamais laisser le client fournir tenant_id (default
 * current_tenant_id() + RLS 'with check', voir migration 0010).
 */

import type { JobType } from '@morax/model-core'
import { createClient } from '@/lib/supabase/server'
import type { EntityKind } from '@/lib/entity-kind'
import { mapCommandMessageRow, type CommandMessageRow } from './chat-message-core'
import { SHORTCUTS } from './shortcuts'
import type { ChatMessage, LaunchpadShortcut, OpsFeedEntry, OpsStatus, ShortcutStatus } from './types'

const JOB_TYPE_META: Record<JobType, { agent: string; action: string; kind: EntityKind }> = {
  capture_document: { agent: 'Archiviste', action: 'Capture document', kind: 'document' },
  capture_audio: { agent: 'Archiviste', action: 'Capture audio', kind: 'document' },
  draft_quote: { agent: 'Redacteur', action: 'Brouillon devis', kind: 'draft' },
  draft_invoice: { agent: 'Redacteur', action: 'Brouillon facture', kind: 'draft' },
  reminder_notify: { agent: 'Relanceur', action: 'Notification echeance', kind: 'reminder' },
  action_propose: { agent: 'Redacteur', action: "Proposition d'action (gate)", kind: 'pending_action' },
  action_execute: { agent: 'Executeur', action: 'Execution action approuvee', kind: 'pending_action' },
  action_bounce: { agent: 'Executeur', action: 'Bounce email (remboursement/notification)', kind: 'pending_action' },
  chase_unpaid: { agent: 'Relanceur', action: 'Relance impayes', kind: 'reminder' },
  check_deadlines: { agent: 'Archiviste', action: 'Verification echeances', kind: 'reminder' },
  daily_summary: { agent: 'Archiviste', action: 'Resume du jour', kind: 'job_run' },
  sort_inbox: { agent: 'Archiviste', action: 'Classement inbox', kind: 'document' },
}

/** JobType associe a chaque raccourci de type 'job' (voir shortcuts.ts). */
const JOB_TYPE_BY_SHORTCUT: Partial<Record<string, JobType>> = Object.fromEntries(
  SHORTCUTS.filter((s) => s.behavior.type === 'job').map((s) => [
    s.id,
    (s.behavior as { type: 'job'; jobType: JobType }).jobType,
  ]),
)

interface JobRunStatusRow {
  type: string
  status: string
  started_at: string
}

export async function getLaunchpadShortcuts(): Promise<LaunchpadShortcut[]> {
  const supabase = await createClient()
  const jobTypes = Object.values(JOB_TYPE_BY_SHORTCUT)
  const { data, error } = await supabase
    .from('job_runs')
    .select('type, status, started_at')
    .in('type', jobTypes)
    .order('started_at', { ascending: false })

  if (error) {
    throw new Error(`[getLaunchpadShortcuts] ${error.message}`)
  }

  const latestStatusByType = new Map<string, string>()
  for (const row of (data ?? []) as JobRunStatusRow[]) {
    if (!latestStatusByType.has(row.type)) latestStatusByType.set(row.type, row.status)
  }

  return SHORTCUTS.map((def) => {
    const jobType = JOB_TYPE_BY_SHORTCUT[def.id]
    const latestStatus = jobType ? latestStatusByType.get(jobType) : undefined
    return {
      id: def.id,
      title: def.title,
      icon: def.icon,
      kind: def.kind,
      status: mapShortcutStatus(def.enabled, latestStatus),
      description: def.description,
    }
  })
}

function mapShortcutStatus(enabled: boolean, latestStatus: string | undefined): ShortcutStatus {
  if (!enabled) return 'off'
  if (latestStatus === 'running') return 'running'
  if (latestStatus === 'error') return 'attention'
  return 'ready'
}

interface JobRunRow {
  id: string
  type: JobType
  status: OpsStatus
  started_at: string
  error: string | null
}

export async function getOperationsFeed(limit = 20): Promise<OpsFeedEntry[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('job_runs')
    .select('id, type, status, started_at, error')
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`[getOperationsFeed] ${error.message}`)
  }

  return ((data ?? []) as JobRunRow[]).map((row) => {
    const meta = JOB_TYPE_META[row.type]
    return {
      id: row.id,
      occurredAt: row.started_at,
      agent: meta.agent,
      action: meta.action,
      status: row.status,
      kind: meta.kind,
      detail: row.error ?? undefined,
    }
  })
}

export async function getChatMessages(limit = 50): Promise<ChatMessage[]> {
  const supabase = await createClient()
  // Les `limit` PLUS RECENTS (desc), puis reordonnes chronologiquement pour
  // l'affichage : un `order asc + limit` renverrait au contraire les plus
  // vieux messages pour tout tenant ayant depasse `limit` messages.
  const { data, error } = await supabase
    .from('command_messages')
    .select('id, role, body, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`[getChatMessages] ${error.message}`)
  }

  return ((data ?? []) as CommandMessageRow[]).reverse().map(mapCommandMessageRow)
}
