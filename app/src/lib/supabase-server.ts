/**
 * Morax - clients Supabase cote serveur + fabrique des deps de webhook.
 * La service role ne quitte JAMAIS le serveur. Aucune cle LLM ici.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { JobMessage } from '@morax/model-core'
import type { WebhookDeps } from './webhook-core'

const QUEUE_NAME = 'morax_jobs'

function requiredEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`[supabase] env manquante : ${name}`)
  return v
}

export function serviceClient(): SupabaseClient {
  return createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )
}

/** Empile un job pgmq via le RPC service_role. Partage par les webhooks et les server actions. */
export async function enqueueJob(db: SupabaseClient, message: JobMessage): Promise<void> {
  const { error } = await db.rpc('morax_queue_send', {
    p_queue: QUEUE_NAME,
    p_message: message,
  })
  if (error) throw new Error(`[enqueue] ${error.message}`)
}

export function makeWebhookDeps(db: SupabaseClient): WebhookDeps {
  return {
    async findTenantByTelegram(chatId) {
      const { data } = await db
        .from('channel_identities')
        .select('tenant_id')
        .eq('channel', 'telegram')
        .eq('external_id', chatId)
        .eq('verified', true)
        .maybeSingle()
      return data ? (data as { tenant_id: string }).tenant_id : null
    },
    async createDocument(input) {
      const { data, error } = await db
        .from('documents')
        .insert({
          tenant_id: input.tenantId,
          source: input.source,
          media_key: input.mediaKey,
          mime: input.mime ?? null,
          status: 'received',
        })
        .select('id')
        .single()
      if (error) throw new Error(`[createDocument] ${error.message}`)
      return { documentId: (data as { id: string }).id }
    },
    async enqueue(message: JobMessage) {
      await enqueueJob(db, message)
    },
    async decidePendingAction(tenantId, pendingActionId, decision, decidedBy) {
      const status = decision === 'approve' ? 'approved' : 'rejected'
      const { data, error } = await db
        .from('pending_actions')
        .update({ status, decided_at: new Date().toISOString(), decided_by: decidedBy })
        .eq('tenant_id', tenantId)
        .eq('id', pendingActionId)
        .eq('status', 'pending')
        .select('id')
      if (error) throw new Error(`[decidePendingAction] ${error.message}`)
      return (data ?? []).length > 0
    },
  }
}

export async function findTenantByEmailAlias(
  db: SupabaseClient,
  alias: string,
): Promise<string | null> {
  const { data } = await db
    .from('channel_identities')
    .select('tenant_id')
    .eq('channel', 'email')
    .eq('external_id', alias)
    .eq('verified', true)
    .maybeSingle()
  return data ? (data as { tenant_id: string }).tenant_id : null
}

/**
 * Correle un bounce Postmark a la pending_action d'origine via le MessageID
 * persiste au moment de l'envoi (action_execute cote worker). Ne fait jamais
 * confiance a un tenant_id fourni par le payload webhook lui-meme.
 */
export async function findPendingActionByPostmarkMessageId(
  db: SupabaseClient,
  messageId: string,
): Promise<{ tenantId: string; pendingActionId: string } | null> {
  const { data } = await db
    .from('pending_actions')
    .select('id, tenant_id')
    .eq('postmark_message_id', messageId)
    .maybeSingle()
  if (!data) return null
  const row = data as { id: string; tenant_id: string }
  return { tenantId: row.tenant_id, pendingActionId: row.id }
}
