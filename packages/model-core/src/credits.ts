/**
 * Morax - Moteur de crédits.
 * Source de vérité des poids : grille-actions-poids.md.
 * Le webhook ne facture jamais ; le comptage ferme se fait à la complétion (worker).
 */

import type { Pack } from './tenant.types.js'

export type ActionCategory =
  | 'rappel_automatique'
  | 'classification'
  | 'scan_document'
  | 'analyse_email'
  | 'export_compta'
  | 'resume_financier'
  | 'brouillon_facture'
  | 'relance_client'
  | 'brouillon_devis'
  | 'devis_complexe'

/** Poids en crédits par catégorie d'action (grille-actions-poids.md). */
export const ACTION_WEIGHTS: Readonly<Record<ActionCategory, number>> = {
  rappel_automatique: 0.5,
  classification: 0.5,
  scan_document: 1,
  analyse_email: 1,
  export_compta: 1,
  resume_financier: 1.5,
  brouillon_facture: 2,
  relance_client: 2,
  brouillon_devis: 3,
  devis_complexe: 5,
}

/** Crédits ajoutés par pack. Le pack `base` fixe le socle. */
export const PACK_CREDITS: Readonly<Record<Pack, number>> = {
  base: 60,
  recus_depenses: 40,
  devis_facture: 40,
  voix: 20,
  tier_premium: 0, // bascule le cerveau vers Opus, n'ajoute pas de crédits
}

export function creditCost(category: ActionCategory): number {
  return ACTION_WEIGHTS[category]
}

/** Quota mensuel total = somme des crédits des packs actifs (base toujours présent). */
export function computeMonthlyQuota(packs: readonly Pack[]): number {
  const withBase: Pack[] = packs.includes('base') ? [...packs] : ['base', ...packs]
  return withBase.reduce((sum, pack) => sum + PACK_CREDITS[pack], 0)
}

export type UsageZone = 'green' | 'orange' | 'red'

export interface UsageStatus {
  consumed: number
  quota: number
  pct: number
  zone: UsageZone
  /** Seuil d'alerte upgrade atteint (alert_threshold_pct). */
  alert: boolean
  /** Quota atteint ou dépassé : nouveaux jobs en file ou rejetés. */
  blocked: boolean
}

/**
 * Calcule l'état d'usage. Ne facture rien : décrit l'état pour l'UI et le worker.
 * @param alertThresholdPct seuil d'alerte (ex. 80).
 */
export function usageStatus(
  consumed: number,
  quota: number,
  alertThresholdPct: number,
): UsageStatus {
  const pct = quota > 0 ? (consumed / quota) * 100 : 100
  const alert = pct >= alertThresholdPct
  const blocked = consumed >= quota
  let zone: UsageZone = 'green'
  if (pct >= 90) zone = 'red'
  else if (pct >= alertThresholdPct) zone = 'orange'
  return { consumed, quota, pct, zone, alert, blocked }
}

/** Mappe la catégorie dominante consommée vers le pack d'upgrade pertinent. */
export function suggestUpgradePack(dominant: ActionCategory): Pack | null {
  switch (dominant) {
    case 'scan_document':
    case 'export_compta':
      return 'recus_depenses'
    case 'brouillon_facture':
    case 'brouillon_devis':
    case 'devis_complexe':
    case 'relance_client':
      return 'devis_facture'
    case 'classification':
    case 'rappel_automatique':
      return 'voix'
    default:
      return null
  }
}
