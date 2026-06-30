/**
 * Morax - Model Resolver.
 * Lit le registre central et renvoie le modèle + endpoint pour un rôle donné.
 * Le routeur applicatif appelle cette fonction ; il ne connaît jamais un modèle en dur.
 *
 * Garde-fous appliqués ici :
 *  - finance-critique -> TOUJOURS Opus 4.8 (premium.cerveau), quel que soit le palier.
 *  - planificateur -> TOUJOURS Sonnet 4.6 (premium.workhorse), quel que soit le palier.
 *  - plafond de contexte 100k (MIN avec le registre) pour neutraliser la falaise MiniMax.
 *  - fallback borné : intra-tier -> tier-up plafonné -> rejet. Jamais de fallback libre.
 *  - finance-critique et planificateur ne se dégradent jamais : modèle épinglé ou rejet.
 */

import { guardrails, registry } from './registry.js'
import type { RegistryRole, RegistryRoleConfig } from './registry.js'
import type { Offre, TenantConfig } from './tenant.types.js'

export type ModelRole = RegistryRole

export interface ModelConfig {
  model: string
  openrouterModel?: string
  provider: string
  endpoint: string
  maxContextTokens: number
  priceInUsdPerM: number
  priceOutUsdPerM: number
  contextPriceBreakTokens?: number
  rgpdNote?: string
  /** Vrai si la résolution a été forcée vers le cerveau finance (Opus). */
  financePinned: boolean
  /** Vrai si la résolution a été forcée vers le workhorse planificateur (Sonnet). */
  plannerPinned: boolean
}

export interface ResolveModelParams {
  tenantConfig: TenantConfig
  role: ModelRole
  /** Override explicite : force le routage finance-critique (Opus). */
  financeCritical?: boolean
  /**
   * Nom d'action sémantique (ex. 'deadline_extraction'). Comparé à
   * guardrails.finance_critical_roles. S'il correspond, route vers Opus.
   */
  actionRole?: string
}

const MAX_CONTEXT_TOKENS = guardrails.max_context_tokens_per_call
const FINANCE_CRITICAL_ROLES = new Set(guardrails.finance_critical_roles)
const FINANCE_PIN = guardrails.finance_critical_pin
const PLANNER_ROLES = new Set(guardrails.planner_roles)
const PLANNER_PIN = guardrails.planner_pin

// ─── Resolver principal ───────────────────────────────────────────────────────

export function isFinanceCritical(params: ResolveModelParams): boolean {
  if (params.financeCritical) return true
  if (params.actionRole && FINANCE_CRITICAL_ROLES.has(params.actionRole)) return true
  return false
}

export function isPlannerCritical(params: ResolveModelParams): boolean {
  if (params.actionRole && PLANNER_ROLES.has(params.actionRole)) return true
  return false
}

function toModelConfig(
  roleConfig: RegistryRoleConfig,
  financePinned: boolean,
  plannerPinned: boolean,
): ModelConfig {
  return {
    model: roleConfig.model,
    openrouterModel: roleConfig.openrouter_model,
    provider: roleConfig.provider,
    endpoint: roleConfig.endpoint,
    maxContextTokens: Math.min(roleConfig.max_context_tokens, MAX_CONTEXT_TOKENS),
    priceInUsdPerM: roleConfig.price_in_usd_per_m,
    priceOutUsdPerM: roleConfig.price_out_usd_per_m,
    contextPriceBreakTokens: roleConfig.context_price_break_tokens,
    rgpdNote: roleConfig.rgpd_note,
    financePinned,
    plannerPinned,
  }
}

function readRoleConfig(tier: string, role: RegistryRole): RegistryRoleConfig {
  const tierConfig = registry.tiers[tier]
  if (!tierConfig) {
    throw new Error(`[resolver] Palier inconnu dans le registre : ${tier}`)
  }
  const roleConfig = tierConfig[role]
  if (!roleConfig) {
    throw new Error(`[resolver] Rôle "${role}" introuvable pour le palier "${tier}"`)
  }
  return roleConfig
}

export function resolveModel(params: ResolveModelParams): ModelConfig {
  // 1. Finance-critique : épinglage dur sur le cerveau finance (Opus), tout palier confondu.
  if (isFinanceCritical(params)) {
    const pinned = readRoleConfig(FINANCE_PIN.tier, FINANCE_PIN.role)
    return toModelConfig(pinned, true, false)
  }

  // 2. Planificateur : épinglage dur sur le workhorse planificateur (Sonnet), tout palier confondu.
  if (isPlannerCritical(params)) {
    const pinned = readRoleConfig(PLANNER_PIN.tier, PLANNER_PIN.role)
    return toModelConfig(pinned, false, true)
  }

  // 3. Routage normal par palier du tenant.
  const tier = mapOffreToTier(params.tenantConfig.offre)
  const roleConfig = readRoleConfig(tier, params.role)
  return toModelConfig(roleConfig, false, false)
}

// ─── Fallback borné ───────────────────────────────────────────────────────────

/**
 * Tentative avec fallback selon la politique du registre.
 * 1. Modèle primaire.
 * 2. Fallback intra-tier (cerveau -> workhorse -> micro).
 * 3. Tier-upgrade si fallback_quota=true.
 * 4. Sinon : rejet (jamais de fallback gratuit non borné).
 *
 * La finance-critique NE se dégrade JAMAIS : Opus ou rejet.
 */
export function resolveModelWithFallback(
  params: ResolveModelParams & { estimatedInputTokens?: number },
): ModelConfig {
  const { tenantConfig, estimatedInputTokens = 0 } = params

  if (estimatedInputTokens > MAX_CONTEXT_TOKENS) {
    console.warn(
      `[resolver] Contexte estimé (${estimatedInputTokens}) > plafond (${MAX_CONTEXT_TOKENS}). ` +
        `Déclencher retrieval avant appel LLM.`,
    )
  }

  // Finance-critique : pas de dégradation. Opus ou erreur.
  if (isFinanceCritical(params)) {
    return resolveModel(params)
  }

  // Planificateur : pas de dégradation. Sonnet ou erreur.
  if (isPlannerCritical(params)) {
    return resolveModel(params)
  }

  try {
    return resolveModel(params)
  } catch {
    const fallbackRole = getFallbackRole(params.role)
    if (fallbackRole) {
      console.warn(`[resolver] Fallback intra-tier : ${params.role} → ${fallbackRole}`)
      return resolveModel({ ...params, role: fallbackRole })
    }

    if (tenantConfig.fallback_quota) {
      const upgradedTier = getUpgradedTier(tenantConfig.offre)
      if (upgradedTier) {
        console.warn(
          `[resolver] Fallback tier-upgrade : ${tenantConfig.offre} → ${upgradedTier}`,
        )
        return resolveModel({
          ...params,
          tenantConfig: { ...tenantConfig, offre: upgradedTier },
        })
      }
    }

    throw new Error(
      `[resolver] Aucun modèle disponible pour le tenant ${tenantConfig.tenant_id}. ` +
        `Fallback épuisé. Requête rejetée.`,
    )
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function mapOffreToTier(offre: Offre): string {
  switch (offre) {
    case 'premium':
      return 'premium'
    case 'intermediaire':
      return 'intermediaire'
    case 'base':
    default:
      return 'economique'
  }
}

export function getFallbackRole(role: ModelRole): ModelRole | null {
  if (role === 'cerveau') return 'workhorse'
  if (role === 'workhorse') return 'micro'
  return null
}

export function getUpgradedTier(offre: Offre): Offre | null {
  if (offre === 'base') return 'intermediaire'
  if (offre === 'intermediaire') return 'premium'
  return null
}

// ─── Vérification RGPD ────────────────────────────────────────────────────────

const CHINESE_PROVIDERS = new Set(['minimax', 'deepseek', 'glm', 'qwen'])
const WESTERN_ENDPOINTS = ['azure.com', 'openrouter.ai', 'alibabacloud.com/en']

/**
 * Lève une erreur si on tente de router des données personnelles vers
 * un endpoint non-Western-managed pour un modèle d'origine chinoise.
 */
export function assertRgpdCompliance(
  modelConfig: ModelConfig,
  hasPersonalData: boolean,
): void {
  const isChineseProvider = CHINESE_PROVIDERS.has(modelConfig.provider.toLowerCase())
  if (!isChineseProvider || !hasPersonalData) return

  const isWesternManaged = WESTERN_ENDPOINTS.some((e) =>
    modelConfig.endpoint.includes(e),
  )
  if (!isWesternManaged) {
    throw new Error(
      `[rgpd] Données personnelles refusées sur endpoint chinois direct (${modelConfig.provider}). ` +
        `Utiliser un endpoint Western-managed ou un modèle occidental.`,
    )
  }
}
