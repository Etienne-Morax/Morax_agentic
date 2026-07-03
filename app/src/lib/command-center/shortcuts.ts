/**
 * Centre de Commandement - registre des raccourcis Launchpad.
 * Capacites definies par l'app (pas des donnees tenant) : module TS versionne,
 * pas de table catalogue. Le statut affiche par defaut est neutre ('ready'/'off') ;
 * le vrai statut ('attention'/'running') vient de pending_actions, voir queries.ts.
 */

import type { EntityKind } from '@/lib/entity-kind'

export interface ShortcutDef {
  id: string
  title: string
  icon: string
  kind: EntityKind
  description?: string
  enabled: boolean
}

export const SHORTCUTS: ShortcutDef[] = [
  {
    id: 'scan-document',
    title: 'Scanner un document',
    icon: 'scan',
    kind: 'document',
    description: 'OCR et classement immediat.',
    enabled: true,
  },
  {
    id: 'chase-unpaid',
    title: 'Relancer les impayes',
    icon: 'bell-ring',
    kind: 'reminder',
    enabled: true,
  },
  {
    id: 'generate-quote',
    title: 'Generer un devis',
    icon: 'file-signature',
    kind: 'draft',
    enabled: true,
  },
  {
    id: 'check-deadlines',
    title: 'Verifier les echeances',
    icon: 'calendar-check',
    kind: 'reminder',
    enabled: true,
  },
  {
    id: 'daily-summary',
    title: 'Resume du jour',
    icon: 'sparkles',
    kind: 'job_run',
    enabled: true,
  },
  {
    id: 'sort-inbox',
    title: "Classer l'inbox",
    icon: 'inbox',
    kind: 'document',
    enabled: false,
  },
]

export interface ResolvedShortcutAction {
  actionType: 'agent_task'
  payload: {
    shortcut_id: string
    title: string
    kind: EntityKind
  }
}

/** Resout un raccourci vers l'action HIGH a proposer au gate. Null si inconnu ou desactive. */
export function resolveShortcut(id: string): ResolvedShortcutAction | null {
  const def = SHORTCUTS.find((s) => s.id === id)
  if (!def || !def.enabled) return null
  return {
    actionType: 'agent_task',
    payload: { shortcut_id: def.id, title: def.title, kind: def.kind },
  }
}
