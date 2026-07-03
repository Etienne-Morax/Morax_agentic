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

export interface ModelsQuotaAdminView {
  detail: 'admin'
  models: ActiveModelEntry[]
  /** Crédits agrégés tous tenants confondus (somme brute, pas une moyenne). */
  globalCredits: {
    consumed: number
    quota: number
  }
  byTenant: TenantCreditsView[]
  /** Tendance de coût réel (cost_traces), séparée des crédits produit. */
  cogs: CogsSummary
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
 * Vue admin : modèles actifs (tous paliers) + crédits global/par-tenant + tendance COGS.
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
    cogs: buildCogsSummary(params.costTraceRows),
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
