/**
 * Morax — Model Resolver
 * Lit le registre central et renvoie le modèle + endpoint pour un rôle donné.
 * Le routeur applicatif appelle cette fonction ; il ne connaît jamais un modèle en dur.
 *
 * Usage :
 *   const config = resolveModel({ tenantConfig, role: 'cerveau' })
 *   // { model: 'claude-opus-4-8', provider: 'anthropic', endpoint: '...', ... }
 */

import registry from './models.registry.yaml'  // chargé via yaml-loader ou fs+js-yaml
import type { TenantConfig } from './tenant.types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModelRole = 'cerveau' | 'workhorse' | 'micro'

export interface ModelConfig {
  model: string
  provider: string
  endpoint: string
  maxContextTokens: number
  priceInUsdPerM: number
  priceOutUsdPerM: number
  contextPriceBreakTokens?: number  // falaise de prix MiniMax M3
  rgpdNote?: string
}

export interface ResolveModelParams {
  tenantConfig: TenantConfig
  role: ModelRole
  /**
   * Certains rôles sont "finance_critical" et utilisent TOUJOURS le cerveau,
   * quel que soit le paramètre `role` fourni.
   */
  financeCritical?: boolean
}

// ─── Garde-fous globaux depuis le registre ────────────────────────────────────

const GUARDRAILS = registry.guardrails
const MAX_CONTEXT_TOKENS = GUARDRAILS.max_context_tokens_per_call
const FINANCE_CRITICAL_ROLES = new Set(GUARDRAILS.finance_critical_roles)

// ─── Resolver principal ───────────────────────────────────────────────────────

export function resolveModel({
  tenantConfig,
  role,
  financeCritical = false,
}: ResolveModelParams): ModelConfig {
  // 1. Si le rôle est finance_critical, forcer le cerveau quelle que soit la demande
  const effectiveRole: ModelRole =
    financeCritical || FINANCE_CRITICAL_ROLES.has(role) ? 'cerveau' : role

  // 2. Lire le palier du tenant
  const tier = tenantConfig.offre  // 'base' → économique, 'intermediaire', 'premium'
  const registryTier = mapOffreToTier(tier)

  // 3. Lire la config du rôle dans le registre
  const tierConfig = registry.tiers[registryTier]
  if (!tierConfig) {
    throw new Error(`[resolver] Palier inconnu dans le registre : ${registryTier}`)
  }

  const roleConfig = tierConfig[effectiveRole]
  if (!roleConfig) {
    throw new Error(
      `[resolver] Rôle "${effectiveRole}" introuvable pour le palier "${registryTier}"`
    )
  }

  // 4. Vérifier la fenêtre de contexte (garde-fou falaise MiniMax)
  // Le caller doit passer le nombre de tokens estimés si pertinent.
  // Ici on expose juste la config ; la logique de retrieval est dans le caller.

  return {
    model: roleConfig.model,
    provider: roleConfig.provider,
    endpoint: roleConfig.endpoint,
    maxContextTokens: Math.min(
      roleConfig.max_context_tokens,
      MAX_CONTEXT_TOKENS
    ),
    priceInUsdPerM: roleConfig.price_in_usd_per_m,
    priceOutUsdPerM: roleConfig.price_out_usd_per_m,
    contextPriceBreakTokens: roleConfig.context_price_break_tokens,
    rgpdNote: roleConfig.rgpd_note,
  }
}

// ─── Fallback avec métering ───────────────────────────────────────────────────

/**
 * Tentative avec fallback selon la politique du registre.
 * 1. Tente le modèle primaire.
 * 2. Si échec : fallback intra-tier (workhorse → micro).
 * 3. Si toujours échec et fallback_quota=true : monte d'un palier.
 * 4. Sinon : lève une erreur (jamais de fallback gratuit non borné).
 */
export function resolveModelWithFallback(
  params: ResolveModelParams & { estimatedInputTokens?: number }
): ModelConfig {
  const { tenantConfig, estimatedInputTokens = 0 } = params

  // Vérification quota contexte
  if (estimatedInputTokens > MAX_CONTEXT_TOKENS) {
    console.warn(
      `[resolver] Contexte estimé (${estimatedInputTokens}) > plafond (${MAX_CONTEXT_TOKENS}). ` +
        `Déclencher retrieval avant appel LLM.`
    )
    // Le caller doit tronquer / chunker. On continue avec le plafond.
  }

  try {
    return resolveModel(params)
  } catch (primaryError) {
    // Fallback intra-tier : cerveau → workhorse, workhorse → micro
    const fallbackRole = getFallbackRole(params.role)
    if (fallbackRole) {
      console.warn(
        `[resolver] Fallback intra-tier : ${params.role} → ${fallbackRole}`
      )
      return resolveModel({ ...params, role: fallbackRole })
    }

    // Fallback tier-upgrade si autorisé
    if (tenantConfig.fallback_quota) {
      const upgradedTier = getUpgradedTier(tenantConfig.offre)
      if (upgradedTier) {
        console.warn(`[resolver] Fallback tier-upgrade : ${tenantConfig.offre} → ${upgradedTier}`)
        return resolveModel({
          ...params,
          tenantConfig: { ...tenantConfig, offre: upgradedTier },
        })
      }
    }

    // Reject
    throw new Error(
      `[resolver] Aucun modèle disponible pour le tenant ${tenantConfig.tenant_id}. ` +
        `Fallback épuisé. Requête rejetée.`
    )
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapOffreToTier(offre: string): string {
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

function getFallbackRole(role: ModelRole): ModelRole | null {
  if (role === 'cerveau') return 'workhorse'
  if (role === 'workhorse') return 'micro'
  return null  // micro n'a pas de fallback intra-tier
}

function getUpgradedTier(offre: string): string | null {
  if (offre === 'base') return 'intermediaire'
  if (offre === 'intermediaire') return 'premium'
  return null  // premium n'a pas de tier supérieur
}

// ─── Vérification RGPD ────────────────────────────────────────────────────────

/**
 * Lève une erreur si on tente de router des données personnelles vers
 * un endpoint non-Western-managed pour les modèles chinois.
 */
export function assertRgpdCompliance(
  modelConfig: ModelConfig,
  hasPersonalData: boolean
): void {
  const chineseProviders = ['minimax', 'deepseek', 'glm', 'qwen']
  const isChineseProvider = chineseProviders.includes(modelConfig.provider.toLowerCase())

  if (isChineseProvider && hasPersonalData) {
    // Vérifier que l'endpoint est Western-managed
    const westernEndpoints = [
      'azure.com',
      'openrouter.ai',
      'alibabacloud.com/en',  // Alibaba Singapore
    ]
    const isWesternManaged = westernEndpoints.some((e) =>
      modelConfig.endpoint.includes(e)
    )

    if (!isWesternManaged) {
      throw new Error(
        `[rgpd] Données personnelles refusées sur endpoint chinois direct (${modelConfig.provider}). ` +
          `Utiliser un endpoint Western-managed ou un modèle occidental.`
      )
    }
  }
}
