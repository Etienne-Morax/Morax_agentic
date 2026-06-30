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
      const { error } = await db.rpc('morax_queue_send', {
        p_queue: QUEUE_NAME,
        p_message: message,
      })
      if (error) throw new Error(`[enqueue] ${error.message}`)
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
