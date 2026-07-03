/**
 * Centre de Commandement - couche donnees.
 * getLaunchpadShortcuts / getOperationsFeed / getChatMessages lisent Supabase
 * (RLS, client authentifie). triggerShortcut a migre vers une Server Action
 * ((command)/launchpad/actions.ts) car il touche le client Supabase serveur -
 * jamais d'execution directe cote UI, toujours enqueueAction -> insert
 * pending_actions (gate Telegram). L'envoi de message chat suit le meme
 * principe : sendCommandMessage ((command)/command/actions.ts) est une Server
 * Action qui insere dans command_messages sans jamais laisser le client fournir
 * tenant_id (default current_tenant_id() + RLS 'with check', voir migration
 * 0010_command_messages.sql).
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
}

interface AgentTaskRow {
  payload: { shortcut_id?: string } | null
  status: string
  requested_at: string
}

export async function getLaunchpadShortcuts(): Promise<LaunchpadShortcut[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pending_actions')
    .select('payload, status, requested_at')
    .eq('action_type', 'agent_task')
    .in('status', ['pending', 'approved'])
    .order('requested_at', { ascending: false })

  if (error) {
    throw new Error(`[getLaunchpadShortcuts] ${error.message}`)
  }

  const rows = (data ?? []) as AgentTaskRow[]
  const latestStatusByShortcut = new Map<string, string>()
  for (const row of rows) {
    const shortcutId = row.payload?.shortcut_id
    if (!shortcutId || latestStatusByShortcut.has(shortcutId)) continue
    latestStatusByShortcut.set(shortcutId, row.status)
  }

  return SHORTCUTS.map((def) => {
    const status = mapShortcutStatus(latestStatusByShortcut.get(def.id), def.enabled)
    return {
      id: def.id,
      title: def.title,
      icon: def.icon,
      kind: def.kind,
      status,
      description: def.description,
    }
  })
}

function mapShortcutStatus(pendingStatus: string | undefined, enabled: boolean): ShortcutStatus {
  if (!enabled) return 'off'
  if (pendingStatus === 'pending') return 'attention'
  if (pendingStatus === 'approved') return 'running'
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
  const { data, error } = await supabase
    .from('command_messages')
    .select('id, role, body, created_at')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    throw new Error(`[getChatMessages] ${error.message}`)
  }

  return ((data ?? []) as CommandMessageRow[]).map(mapCommandMessageRow)
}
