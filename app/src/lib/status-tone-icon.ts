/**
 * Morax - icone associee a chaque StatusTone, pour renforcer les pilules de statut.
 * Module separe de status-tone.ts (qui reste pur/textuel) : ne mappe que vers des references d'icones.
 */

import { CheckCircle2, CircleDot, Clock, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { StatusTone } from './status-tone'

const TONE_ICON: Record<StatusTone, LucideIcon> = {
  success: CheckCircle2,
  warning: Clock,
  danger: TriangleAlert,
  info: Info,
  neutral: CircleDot,
}

export function toneIcon(tone: StatusTone): LucideIcon {
  return TONE_ICON[tone]
}
