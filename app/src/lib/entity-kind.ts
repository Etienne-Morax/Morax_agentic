/**
 * Morax - pivot unique icone/couleur par type d'entite (timeline + devis/factures).
 * Fonction pure : aucune dependance reseau, aucun JSX (composants passes par reference).
 */

import type { LucideIcon } from 'lucide-react'
import { Bot, BellRing, FileSignature, FileText, Mail, Send, Stamp, Upload } from 'lucide-react'
import type { DocumentRow, TimelineKind } from './timeline-core'

export type EntityKind = TimelineKind | 'draft'

export interface EntityKindSpec {
  icon: LucideIcon
  label: string
  /** Couleur texte/icone, contraste AA sur soft et sur blanc. */
  ink: string
  /** Couleur de fond pour badges/chips. */
  soft: string
  /** Couleur saturee pour graphiques/points/rails. */
  vivid: string
}

const ENTITY_KIND_SPEC: Record<EntityKind, EntityKindSpec> = {
  document: {
    icon: FileText,
    label: 'Document',
    ink: 'var(--kind-document)',
    soft: 'var(--kind-document-soft)',
    vivid: 'var(--kind-document-vivid)',
  },
  job_run: {
    icon: Bot,
    label: 'Traitement',
    ink: 'var(--kind-job)',
    soft: 'var(--kind-job-soft)',
    vivid: 'var(--kind-job-vivid)',
  },
  reminder: {
    icon: BellRing,
    label: 'Echeance',
    ink: 'var(--kind-reminder)',
    soft: 'var(--kind-reminder-soft)',
    vivid: 'var(--kind-reminder-vivid)',
  },
  pending_action: {
    icon: Stamp,
    label: 'A approuver',
    ink: 'var(--kind-action)',
    soft: 'var(--kind-action-soft)',
    vivid: 'var(--kind-action-vivid)',
  },
  draft: {
    icon: FileSignature,
    label: 'Devis & factures',
    ink: 'var(--kind-draft)',
    soft: 'var(--kind-draft-soft)',
    vivid: 'var(--kind-draft-vivid)',
  },
}

export function entityKindSpec(kind: EntityKind): EntityKindSpec {
  return ENTITY_KIND_SPEC[kind]
}

export const SOURCE_ICON: Record<DocumentRow['source'], LucideIcon> = {
  telegram: Send,
  email: Mail,
  upload: Upload,
}
