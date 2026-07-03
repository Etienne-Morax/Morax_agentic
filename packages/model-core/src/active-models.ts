/**
 * Morax - Liste des modèles actifs dérivée du registre.
 * Zéro nom de modèle en dur : tout provient de `registry.tiers` + `guardrails`.
 * Consommé par l'UI (vue admin/client) pour afficher "quel modèle sert quelle tâche".
 */

import { getFallbackRole, getUpgradedTier, mapOffreToTier } from './model-resolver.js'
import type { Registry, RegistryRole, RegistryTier } from './registry.js'
import type { Offre } from './tenant.types.js'

export type ActiveModelStatus = 'active' | 'fallback' | 'deprecated'

export interface ActiveModelEntry {
  /** Identifiant stable "tier/role" (ex. "premium/cerveau"). */
  id: string
  tier: string
  role: RegistryRole
  model: string
  provider: string
  /** Label lisible produit : "Palier premium — cerveau (claude-opus-4-8)". */
  label: string
  status: ActiveModelStatus
  /** Vrai si épinglé en dur par un garde-fou (finance ou planificateur), quel que soit le palier tenant. */
  pinned: boolean
  notes?: string
  rgpdNote?: string
}

const ALL_OFFRES: readonly Offre[] = ['base', 'intermediaire', 'premium']
const ALL_ROLES: readonly RegistryRole[] = ['cerveau', 'workhorse', 'micro']

/** tier/role atteint directement en primaire pour au moins un palier tenant. */
function primaryReachableKeys(): Set<string> {
  const keys = new Set<string>()
  for (const offre of ALL_OFFRES) {
    const tier = mapOffreToTier(offre)
    for (const role of ALL_ROLES) {
      keys.add(`${tier}/${role}`)
    }
  }
  return keys
}

/** tier/role atteignable via fallback intra-tier (cerveau→workhorse→micro) ou tier-upgrade. */
function fallbackReachableKeys(primaryKeys: ReadonlySet<string>): Set<string> {
  const keys = new Set<string>()

  for (const offre of ALL_OFFRES) {
    const tier = mapOffreToTier(offre)
    for (const role of ALL_ROLES) {
      const fallbackRole = getFallbackRole(role)
      if (fallbackRole) {
        keys.add(`${tier}/${fallbackRole}`)
      }
    }

    const upgradedOffre = getUpgradedTier(offre)
    if (upgradedOffre) {
      const upgradedTier = mapOffreToTier(upgradedOffre)
      for (const role of ALL_ROLES) {
        if (!primaryKeys.has(`${upgradedTier}/${role}`)) continue
        keys.add(`${upgradedTier}/${role}`)
      }
    }
  }

  return keys
}

function pinnedKeys(registry: Registry): Set<string> {
  const { finance_critical_pin, planner_pin } = registry.guardrails
  return new Set([
    `${finance_critical_pin.tier}/${finance_critical_pin.role}`,
    `${planner_pin.tier}/${planner_pin.role}`,
  ])
}

function buildLabel(tier: string, role: RegistryRole, model: string): string {
  return `Palier ${tier} — ${role} (${model})`
}

function statusFor(
  key: string,
  primaryKeys: ReadonlySet<string>,
  fallbackKeys: ReadonlySet<string>,
  pinned: boolean,
): ActiveModelStatus {
  if (pinned) return 'active'
  if (primaryKeys.has(key)) return 'active'
  if (fallbackKeys.has(key)) return 'fallback'
  return 'deprecated'
}

/**
 * Dérive la liste lisible des modèles configurés dans le registre, avec leur statut :
 * - `active` : épinglé par un garde-fou, ou primaire pour au moins un palier tenant.
 * - `fallback` : atteignable seulement via fallback intra-tier ou tier-upgrade.
 * - `deprecated` : présent dans le registre mais non atteignable par le routage actuel.
 */
export function listActiveModels(registry: Registry): ActiveModelEntry[] {
  const primaryKeys = primaryReachableKeys()
  const fallbackKeys = fallbackReachableKeys(primaryKeys)
  const pinned = pinnedKeys(registry)

  const entries: ActiveModelEntry[] = []
  for (const [tierName, tierConfig] of Object.entries(registry.tiers)) {
    for (const role of ALL_ROLES) {
      const roleConfig = (tierConfig as RegistryTier)[role]
      if (!roleConfig) continue

      const key = `${tierName}/${role}`
      const isPinned = pinned.has(key)

      entries.push({
        id: key,
        tier: tierName,
        role,
        model: roleConfig.model,
        provider: roleConfig.provider,
        label: buildLabel(tierName, role, roleConfig.model),
        status: statusFor(key, primaryKeys, fallbackKeys, isPinned),
        pinned: isPinned,
        notes: roleConfig.notes,
        rgpdNote: roleConfig.rgpd_note,
      })
    }
  }

  return entries
}
