/**
 * Morax - webhook Postmark (inbound email -> alias tenant, ET bounce/spam sur
 * les envois HIGH sortants). Valide, authentifie, acquitte vite, empile.
 * JAMAIS d'IA ici, JAMAIS d'ecriture credits_ledger ici (seul le worker ecrit
 * via ports.credits.record() ; un bounce empile un job action_bounce).
 *
 * Configurer l'URL du webhook Postmark (inbound ET bounce/delivery stream)
 * avec Basic Auth :
 * https://morax:<POSTMARK_INBOUND_SECRET>@host/api/webhooks/postmark
 * (voir verifyPostmarkBasicAuth dans webhook-core.ts)
 */

import {
  findPendingActionByPostmarkMessageId,
  findTenantByEmailAlias,
  makeWebhookDeps,
  serviceClient,
} from '../../../../lib/supabase-server'
import { putObject } from '../../../../lib/r2'
import {
  handlePostmarkWebhook,
  verifyPostmarkBasicAuth,
  type PostmarkDeps,
} from '../../../../lib/webhook-core'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  const authorized = verifyPostmarkBasicAuth(
    request.headers.get('authorization'),
    process.env.POSTMARK_INBOUND_SECRET,
  )
  if (!authorized) {
    return new Response('forbidden', { status: 403 })
  }

  let payload: Record<string, unknown>
  try {
    payload = (await request.json()) as Record<string, unknown>
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
      findPendingActionByPostmarkMessageId: (messageId) =>
        findPendingActionByPostmarkMessageId(db, messageId),
    }
    const result = await handlePostmarkWebhook(payload, deps, new Date().toISOString())
    return new Response('ok', { status: result.status })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown'
    console.error(`[postmark] ${message}`)
    // Echec non reconnu (DB, enqueue...) : 5xx pour que Postmark retente le
    // webhook au lieu de considerer a tort l'evenement (bounce, email) comme traite.
    return new Response('error', { status: 500 })
  }
}
