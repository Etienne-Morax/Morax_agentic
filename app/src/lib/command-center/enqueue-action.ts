/**
 * Centre de Commandement - point d'entree unique vers le gate HIGH pour les
 * raccourcis Launchpad. Jamais d'execution directe : insere via le RPC
 * `enqueue_pending_action` (client authentifie, RLS + current_tenant_id()
 * cote Postgres), qui alimente pending_actions pour approbation Telegram.
 *
 * Le RPC est fige a action_type='agent_task' cote Postgres (cf. migration
 * 0008) : send_email/expense/third_party_write restent inseres uniquement
 * par du code serveur qui valide l'etat metier (voir finalizeDraftAction
 * dans manage-draft.ts), jamais via une payload arbitraire cote client.
 */

import { createClient } from '@/lib/supabase/server'

export interface EnqueueActionInput {
  actionType: 'agent_task'
  payload: Record<string, unknown>
  risk: 'HIGH'
}

export interface EnqueueActionResult {
  pendingActionId: string
}

export async function enqueueAction(input: EnqueueActionInput): Promise<EnqueueActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('enqueue_pending_action', {
    p_payload: input.payload,
  })

  if (error) {
    throw new Error(`[enqueueAction] ${error.message}`)
  }

  return { pendingActionId: data as string }
}
