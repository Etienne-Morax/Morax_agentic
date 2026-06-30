/**
 * Morax - webhook inbound Postmark (email -> alias tenant).
 * Valide, authentifie l'alias, acquitte vite, empile. JAMAIS d'IA ici.
 */

import type { JobMessage } from '@morax/model-core'
import {
  findTenantByEmailAlias,
  makeWebhookDeps,
  serviceClient,
} from '../../../../lib/supabase-server.js'

export const runtime = 'nodejs'

interface PostmarkInbound {
  MessageID: string
  OriginalRecipient?: string
  ToFull?: Array<{ Email: string }>
  Subject?: string
}

export async function POST(request: Request): Promise<Response> {
  const secret = request.headers.get('x-morax-inbound-secret')
  if (!secret || secret !== process.env.POSTMARK_INBOUND_SECRET) {
    return new Response('forbidden', { status: 403 })
  }

  let payload: PostmarkInbound
  try {
    payload = (await request.json()) as PostmarkInbound
  } catch {
    return new Response('bad request', { status: 400 })
  }

  try {
    const db = serviceClient()
    const alias = payload.OriginalRecipient ?? payload.ToFull?.[0]?.Email ?? ''
    const tenantId = alias ? await findTenantByEmailAlias(db, alias) : null
    if (tenantId) {
      const deps = makeWebhookDeps(db)
      // TODO Phase 2 : extraire les pieces jointes et les deposer en R2.
      const mediaKey = `postmark:${payload.MessageID}`
      const { documentId } = await deps.createDocument({
        tenantId,
        source: 'email',
        mediaKey,
      })
      const job: JobMessage = {
        schema_version: 1,
        type: 'capture_document',
        tenant_id: tenantId,
        source: 'email',
        media_key: mediaKey,
        document_id: documentId,
        idempotency_key: `pm:${payload.MessageID}`,
        enqueued_at: new Date().toISOString(),
      }
      await deps.enqueue(job)
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown'
    console.error(`[postmark] ${message}`)
  }
  return new Response('ok', { status: 200 })
}
