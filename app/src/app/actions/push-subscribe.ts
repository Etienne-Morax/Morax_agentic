'use server'

/**
 * Morax - Chantier C : Server Actions pour les abonnements push web (PWA).
 * RLS scope l'insert au tenant courant (tenant_id defaut current_tenant_id()
 * a l'insert, meme pattern que document_drafts / manage-draft.ts).
 */

import { createClient } from '@/lib/supabase/server'
import { validatePushSubscription } from '@/lib/push-subscribe-core'

export interface PushActionResult {
  success: boolean
  message?: string
}

export async function subscribePushAction(subscriptionJson: unknown): Promise<PushActionResult> {
  const validation = validatePushSubscription(subscriptionJson)
  if (!validation.success) {
    return { success: false, message: validation.errors.subscription }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: validation.data.endpoint,
      p256dh: validation.data.p256dh,
      auth: validation.data.auth,
    },
    { onConflict: 'endpoint' },
  )

  if (error) {
    return { success: false, message: `Abonnement impossible : ${error.message}` }
  }
  return { success: true }
}

export async function unsubscribePushAction(endpoint: string): Promise<PushActionResult> {
  if (!endpoint) {
    return { success: false, message: 'Endpoint manquant.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)

  if (error) {
    return { success: false, message: `Desabonnement impossible : ${error.message}` }
  }
  return { success: true }
}
