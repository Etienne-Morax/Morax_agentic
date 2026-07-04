/**
 * Morax worker - "Relancer les impayes" (bouton Launchpad chase-unpaid).
 * Lit les factures document_drafts (kind='invoice', status='sent', due_date
 * depassee), redige une relance (LLM, categorie relance_client) puis propose
 * l'envoi via le gate HIGH (pending_actions action_type='chase_reminder' +
 * job action_propose auto-enfile). AUCUN envoi direct ici.
 */

import type { TaskContext } from './types.js'

export async function chaseUnpaid(_ctx: TaskContext): Promise<void> {
  throw new Error('[tasks/chase-unpaid] pas encore implemente')
}
