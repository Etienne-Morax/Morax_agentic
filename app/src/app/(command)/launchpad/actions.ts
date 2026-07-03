'use server'

/**
 * Launchpad - declenchement d'un raccourci. Touche le client Supabase serveur
 * (RPC vers pending_actions) : doit etre une Server Action, pas un import direct
 * depuis un composant client.
 */

import { resolveShortcut } from '@/lib/command-center/shortcuts'
import { enqueueAction } from '@/lib/command-center/enqueue-action'
import type { TriggerResult } from '@/lib/command-center/types'

export async function triggerShortcut(id: string): Promise<TriggerResult> {
  const resolved = resolveShortcut(id)
  if (!resolved) {
    return { ok: false, message: 'Raccourci indisponible.' }
  }

  try {
    const { pendingActionId } = await enqueueAction({
      risk: 'HIGH',
      actionType: resolved.actionType,
      payload: resolved.payload,
    })
    return {
      ok: true,
      queuedActionId: pendingActionId,
      message: 'Envoye pour approbation.',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue.'
    return { ok: false, message: `Proposition impossible : ${message}` }
  }
}
