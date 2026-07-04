/**
 * Morax worker - "Classer l'inbox" (bouton Launchpad sort-inbox).
 * Classe les documents sans categorie (ports.documents.listUnclassified) via
 * LLM (categorie classification) puis persiste (ports.documents.setCategory).
 */

import type { TaskContext } from './types.js'

export async function sortInbox(_ctx: TaskContext): Promise<void> {
  throw new Error('[tasks/sort-inbox] pas encore implemente')
}
