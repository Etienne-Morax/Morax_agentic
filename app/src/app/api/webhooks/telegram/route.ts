/**
 * Morax - webhook Telegram.
 * Contrainte dure : valide le secret, authentifie, acquitte < 1s, empile.
 * JAMAIS d'appel IA ici. Le worker fait le traitement en tache de fond.
 */

import { makeWebhookDeps, serviceClient } from '../../../../lib/supabase-server'
import {
  handleTelegramUpdate,
  type TelegramUpdate,
} from '../../../../lib/webhook-core'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  // 1. Verifie le secret du webhook (jamais de traitement non authentifie).
  const secret = request.headers.get('x-telegram-bot-api-secret-token')
  if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 })
  }

  let update: TelegramUpdate
  try {
    update = (await request.json()) as TelegramUpdate
  } catch {
    return new Response('bad request', { status: 400 })
  }

  try {
    const deps = makeWebhookDeps(serviceClient())
    await handleTelegramUpdate(update, deps, new Date().toISOString())
  } catch (error: unknown) {
    // On acquitte quand meme : Telegram re-livre sur non-2xx, l'idempotence protege.
    const message = error instanceof Error ? error.message : 'unknown'
    console.error(`[telegram] ${message}`)
  }
  // Acquittement rapide systematique.
  return new Response('ok', { status: 200 })
}
