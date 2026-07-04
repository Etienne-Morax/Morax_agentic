'use server'

/**
 * Centre de Commandement - envoi d'un message de chat. Touche le client Supabase
 * serveur (insert command_messages) : doit etre une Server Action, jamais un
 * insert direct depuis un composant client. tenant_id n'est jamais fourni par
 * l'appelant -- la colonne a pour default current_tenant_id() et la policy RLS
 * 'with check' rejette toute valeur differente (voir migration
 * 0010_command_messages.sql). Un message utilisateur n'est pas une action
 * HIGH-risk (donnee applicative normale du tenant, comme un document ou un
 * reminder) : pas de gate d'approbation ici, contrairement a triggerShortcut.
 *
 * Apres l'insert, on enfile un job command_reply (worker/src/tasks/command-reply.ts)
 * qui redige et insere la reponse de l'agent (role='agent'). Sans ca, le
 * message utilisateur restait stocke sans jamais declencher de reponse -- le
 * chat n'affichait donc jamais rien.
 */

import { createClient } from '@/lib/supabase/server'
import { enqueueJob, serviceClient } from '@/lib/supabase-server'
import { mapCommandMessageRow, type CommandMessageRow } from '@/lib/command-center/chat-message-core'
import type { ChatMessage } from '@/lib/command-center/types'

export interface SendCommandMessageResult {
  ok: boolean
  message?: ChatMessage
  error?: string
}

export async function sendCommandMessage(content: string): Promise<SendCommandMessageResult> {
  const trimmed = content.trim()
  if (!trimmed) {
    return { ok: false, error: 'Message vide.' }
  }

  const supabase = await createClient()
  const { data: tenantId, error: tenantError } = await supabase.rpc('current_tenant_id')
  if (tenantError || !tenantId) {
    return { ok: false, error: 'Session tenant introuvable.' }
  }

  const { data, error } = await supabase
    .from('command_messages')
    .insert({ role: 'user', body: trimmed })
    .select('id, role, body, created_at')
    .single()

  if (error) {
    return { ok: false, error: `[sendCommandMessage] ${error.message}` }
  }

  const row = data as CommandMessageRow
  await enqueueJob(serviceClient(), {
    schema_version: 1,
    type: 'command_reply',
    tenant_id: tenantId as string,
    source: 'app',
    idempotency_key: `command-reply:${row.id}`,
    enqueued_at: new Date().toISOString(),
  })

  return {
    ok: true,
    message: mapCommandMessageRow(row),
  }
}
