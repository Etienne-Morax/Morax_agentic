/**
 * Morax - Chantier C : validation d'un abonnement push web (PushSubscription.toJSON()).
 * Fonction pure, testable sans mock, zero appel Supabase.
 */

import { z } from 'zod'

export interface PushSubscriptionFields {
  endpoint: string
  p256dh: string
  auth: string
}

export interface ValidationSuccess {
  success: true
  data: PushSubscriptionFields
}

export interface ValidationFailure {
  success: false
  errors: Record<string, string>
}

export type PushSubscriptionValidationResult = ValidationSuccess | ValidationFailure

const subscriptionSchema = z.object({
  endpoint: z.string().url('Endpoint push invalide.'),
  keys: z.object({
    p256dh: z.string().min(1, 'Cle p256dh manquante.'),
    auth: z.string().min(1, 'Cle auth manquante.'),
  }),
})

/** Valide le payload brut envoye par le navigateur (PushSubscription.toJSON()). */
export function validatePushSubscription(input: unknown): PushSubscriptionValidationResult {
  const result = subscriptionSchema.safeParse(input)
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'Abonnement push invalide.'
    return { success: false, errors: { subscription: message } }
  }
  return {
    success: true,
    data: {
      endpoint: result.data.endpoint,
      p256dh: result.data.keys.p256dh,
      auth: result.data.keys.auth,
    },
  }
}
