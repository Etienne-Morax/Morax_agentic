/**
 * Morax - webhook inbound Postmark (email -> alias tenant).
 * Valide, authentifie l'alias, acquitte vite, empile. JAMAIS d'IA ici.
 */

import {
  findTenantByEmailAlias,
  makeWebhookDeps,
  serviceClient,
} from '../../../../lib/supabase-server'
import { putObject } from '../../../../lib/r2'
import { handlePostmarkInbound, type PostmarkDeps, type PostmarkInbound } from '../../../../lib/webhook-core'

export const runtime = 'nodejs'

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
    const webhookDeps = makeWebhookDeps(db)
    const deps: PostmarkDeps = {
      findTenantByEmailAlias: (alias) => findTenantByEmailAlias(db, alias),
      createDocument: webhookDeps.createDocument,
      enqueue: webhookDeps.enqueue,
      uploadAttachment: putObject,
    }
    await handlePostmarkInbound(payload, deps, new Date().toISOString())
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown'
    console.error(`[postmark] ${message}`)
  }
  return new Response('ok', { status: 200 })
}
