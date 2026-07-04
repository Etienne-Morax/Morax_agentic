/**
 * Centre de Commandement - registre des raccourcis Launchpad.
 * Capacites definies par l'app (pas des donnees tenant) : module TS versionne,
 * pas de table catalogue. Chaque raccourci porte son propre comportement --
 * plus de detour par un agent_task HIGH generique jamais consomme (cf. 0013) :
 *  - 'navigate'          : navigation client pure vers un ecran existant/a venir.
 *  - 'create-quote-draft': cree un document_drafts vide (kind='quote') puis navigue.
 *  - 'job'                : enfile un JobType concret que le worker execute reellement.
 */

import type { JobType } from '@morax/model-core'
import type { EntityKind } from '@/lib/entity-kind'

export type ShortcutBehavior =
  | { type: 'navigate'; href: string }
  | { type: 'create-quote-draft' }
  | { type: 'job'; jobType: JobType }

export interface ShortcutDef {
  id: string
  title: string
  icon: string
  kind: EntityKind
  description?: string
  enabled: boolean
  behavior: ShortcutBehavior
}

export const SHORTCUTS: ShortcutDef[] = [
  {
    id: 'scan-document',
    title: 'Scanner un document',
    icon: 'scan',
    kind: 'document',
    description: 'OCR et classement immediat.',
    enabled: true,
    behavior: { type: 'navigate', href: '/scan' },
  },
  {
    id: 'chase-unpaid',
    title: 'Relancer les impayes',
    icon: 'bell-ring',
    kind: 'reminder',
    enabled: true,
    behavior: { type: 'job', jobType: 'chase_unpaid' },
  },
  {
    id: 'generate-quote',
    title: 'Generer un devis',
    icon: 'file-signature',
    kind: 'draft',
    enabled: true,
    behavior: { type: 'create-quote-draft' },
  },
  {
    id: 'check-deadlines',
    title: 'Verifier les echeances',
    icon: 'calendar-check',
    kind: 'reminder',
    enabled: true,
    behavior: { type: 'job', jobType: 'check_deadlines' },
  },
  {
    id: 'daily-summary',
    title: 'Resume du jour',
    icon: 'sparkles',
    kind: 'job_run',
    enabled: true,
    behavior: { type: 'job', jobType: 'daily_summary' },
  },
  {
    id: 'sort-inbox',
    title: "Classer l'inbox",
    icon: 'inbox',
    kind: 'document',
    enabled: true,
    behavior: { type: 'job', jobType: 'sort_inbox' },
  },
]

export function findShortcut(id: string): ShortcutDef | undefined {
  return SHORTCUTS.find((s) => s.id === id)
}
