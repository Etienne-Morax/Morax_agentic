/**
 * Morax - agrégation "Modèles actifs + Quota de crédits" (lecture seule, ZERO appel IA).
 * Combine le registre model-core (modèles) + credits-core (quota mixte d'actions).
 * Une seule forme de sortie ; la vue admin ajoute les sections globales/par-tenant/COGS,
 * la vue client se limite à son propre tenant (voir `toClientView`).
 */

import {
  listActiveModels,
  type ActiveModelEntry,
  type Registry,
} from '@morax/model-core'
import { summarizeCredits, type CreditLedgerRow, type CreditsSummary } from './credits-core'
import { buildCogsSummary, type CogsSummary, type CostTraceRow } from './cogs-core'

export interface TenantCreditsView {
  tenantId: string
  displayName: string | null
  credits: CreditsSummary
}

export interface DailyCredit {
  /** Jour UTC au format YYYY-MM-DD. */
  day: string
  /** Crédits consommés ce jour-là (somme des poids, tous tenants confondus). */
  weight: number
}

/**
 * État indicatif des garde-fous budget infra (quota Max/Codex, etc.).
 * Distinct des crédits produit. Aucune source branchée côté web app aujourd'hui
 * (openclaw/codex sont exposés via MCP hors Next.js) -> `connected: false` par défaut.
 */
export interface BudgetGuardsInfo {
  connected: boolean
  note: string
}

const DISCONNECTED_BUDGET_GUARDS: BudgetGuardsInfo = {
  connected: false,
  note: 'Aucune source infra branchée côté web (openclaw/codex sont exposés via MCP). Indicatif uniquement.',
}

export interface ModelsQuotaAdminView {
  detail: 'admin'
  models: ActiveModelEntry[]
  /** Crédits agrégés tous tenants confondus (somme brute, pas une moyenne). */
  globalCredits: {
    consumed: number
    quota: number
  }
  byTenant: TenantCreditsView[]
  /** Tendance de consommation crédits par jour (mois courant, tous tenants). */
  trend: DailyCredit[]
  /** Tendance de coût réel (cost_traces), séparée des crédits produit. */
  cogs: CogsSummary
  /** Garde-fous budget infra, en lecture seule et clairement séparés des crédits produit. */
  budgetGuards: BudgetGuardsInfo
}

export interface ModelsQuotaClientView {
  detail: 'client'
  /** Labels produit uniquement (pas de provider/endpoint technique) des modèles utilisés par ce tenant. */
  models: ClientModelLabel[]
  credits: CreditsSummary
}

export interface ClientModelLabel {
  role: ActiveModelEntry['role']
  /** Label produit lisible, sans détail infra (pas de provider/version technique). */
  label: string
}

const ROLE_PRODUCT_LABEL: Record<ActiveModelEntry['role'], string> = {
  cerveau: 'Analyse et rédaction avancées',
  workhorse: 'Traitement et extraction',
  micro: 'Résumés et classification rapides',
}

/**
 * Regroupe des lignes de crédits par jour UTC (mois courant), triées par jour croissant.
 * Pur : n'accède à aucune horloge, ne lit que le `created_at` fourni. Ignore les lignes
 * sans `created_at` exploitable.
 */
export function bucketDailyTrend(
  rows: readonly { created_at: string; weight: number }[],
): DailyCredit[] {
  const byDay = new Map<string, number>()
  for (const row of rows) {
    const day = row.created_at.slice(0, 10) // YYYY-MM-DD (ISO 8601, UTC)
    if (day.length !== 10) continue
    byDay.set(day, (byDay.get(day) ?? 0) + row.weight)
  }
  return [...byDay.entries()]
    .map(([day, weight]) => ({ day, weight }))
    .sort((a, b) => a.day.localeCompare(b.day))
}

/**
 * Vue admin : modèles actifs (tous paliers) + crédits global/par-tenant + tendance
 * conso/jour + tendance COGS + garde-fous budget infra (indicatif).
 * `tenants` doit déjà être scope-libre côté appelant (service_role, jamais depuis le client).
 */
export function buildAdminView(params: {
  registry: Registry
  tenants: readonly {
    tenantId: string
    displayName: string | null
    actionQuotaMonthly: number
    alertThresholdPct: number
    ledgerRows: readonly CreditLedgerRow[]
  }[]
  costTraceRows: readonly CostTraceRow[]
  /** Lignes datées (tous tenants) pour la tendance conso/jour. Optionnel. */
  trendRows?: readonly { created_at: string; weight: number }[]
  /** État des garde-fous budget infra. Par défaut : non connecté. */
  budgetGuards?: BudgetGuardsInfo
}): ModelsQuotaAdminView {
  const models = listActiveModels(params.registry)

  const byTenant = params.tenants.map((tenant) => ({
    tenantId: tenant.tenantId,
    displayName: tenant.displayName,
    credits: summarizeCredits(tenant.ledgerRows, {
      actionQuotaMonthly: tenant.actionQuotaMonthly,
      alertThresholdPct: tenant.alertThresholdPct,
    }),
  }))

  const globalCredits = byTenant.reduce(
    (acc, tenant) => ({
      consumed: acc.consumed + tenant.credits.consumed,
      quota: acc.quota + tenant.credits.quota,
    }),
    { consumed: 0, quota: 0 },
  )

  return {
    detail: 'admin',
    models,
    globalCredits,
    byTenant,
    trend: bucketDailyTrend(params.trendRows ?? []),
    cogs: buildCogsSummary(params.costTraceRows),
    budgetGuards: params.budgetGuards ?? DISCONNECTED_BUDGET_GUARDS,
  }
}

/**
 * Vue client : modèles utilisés en label produit (aucun détail infra/provider) + crédits
 * du tenant courant uniquement. `ledgerRows` doit provenir d'une requête RLS-filtrée.
 */
export function buildClientView(params: {
  registry: Registry
  tenant: { actionQuotaMonthly: number; alertThresholdPct: number }
  ledgerRows: readonly CreditLedgerRow[]
}): ModelsQuotaClientView {
  const allModels = listActiveModels(params.registry)
  const activeRoles = [...new Set(allModels.filter((m) => m.status !== 'deprecated').map((m) => m.role))]

  const models: ClientModelLabel[] = activeRoles.map((role) => ({
    role,
    label: ROLE_PRODUCT_LABEL[role],
  }))

  const credits = summarizeCredits(params.ledgerRows, params.tenant)

  return { detail: 'client', models, credits }
}
