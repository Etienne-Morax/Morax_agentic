/**
 * Morax - couche serveur "Modèles actifs + Quota de crédits".
 * Lecture seule, ZERO appel IA. Importe @morax/model-core (readFileSync sur le YAML
 * au chargement du module) -> tout appelant doit declarer `export const runtime = 'nodejs'`
 * (voir app/src/app/(app)/documents/[id]/pdf/route.tsx pour le meme motif).
 *
 * Vue client : Supabase scope a la session (RLS, `current_tenant_id()`) -> un tenant ne
 * peut structurellement pas lire les lignes d'un autre tenant.
 * Vue admin : Supabase service_role (bypass RLS) + verification explicite `users.role`.
 * Ne JAMAIS construire la vue admin a partir d'un client RLS avec un tenant_id fourni par
 * l'appelant (voir supabase/migrations/0002_tighten_function_grants.sql : la fonction
 * morax_credits_consumed(tenant_id) a ete verrouillee au service_role pour cette raison).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { registry } from '@morax/model-core'
import {
  buildAdminView,
  buildClientView,
  type ModelsQuotaAdminView,
  type ModelsQuotaClientView,
} from './models-quota-core'
import type { CreditLedgerRow } from './credits-core'
import type { CostTraceRow } from './cogs-core'

const DEFAULT_QUOTA = 60
const DEFAULT_ALERT_THRESHOLD_PCT = 80

function startOfCurrentMonthIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

export class ForbiddenAdminAccessError extends Error {
  constructor() {
    super('[models-quota] acces admin refuse : role insuffisant')
    this.name = 'ForbiddenAdminAccessError'
  }
}

/**
 * Vue client : requêtes RLS-filtrées par la session de l'appelant.
 * `db` doit être le client `authenticated` (app/src/lib/supabase/server.ts), jamais service_role.
 */
export async function loadClientModelsQuota(db: SupabaseClient): Promise<ModelsQuotaClientView> {
  const [tenantResult, ledgerResult] = await Promise.all([
    db.from('tenants').select('action_quota_monthly, alert_threshold_pct').maybeSingle(),
    db
      .from('credits_ledger')
      .select('action_category, weight')
      .gte('created_at', startOfCurrentMonthIso()),
  ])

  if (tenantResult.error) throw new Error(`[models-quota] tenants: ${tenantResult.error.message}`)
  if (ledgerResult.error) throw new Error(`[models-quota] credits_ledger: ${ledgerResult.error.message}`)

  const tenant = tenantResult.data as { action_quota_monthly: number; alert_threshold_pct: number } | null
  const ledgerRows = (ledgerResult.data ?? []) as CreditLedgerRow[]

  return buildClientView({
    registry,
    tenant: {
      actionQuotaMonthly: tenant?.action_quota_monthly ?? DEFAULT_QUOTA,
      alertThresholdPct: tenant?.alert_threshold_pct ?? DEFAULT_ALERT_THRESHOLD_PCT,
    },
    ledgerRows,
  })
}

/**
 * Vue admin : nécessite un client service_role (bypass RLS, jamais côté navigateur) ET
 * un appelant déjà vérifié `role = 'admin'` (voir `assertAdminRole`). Agrège tous les tenants.
 */
export async function loadAdminModelsQuota(serviceDb: SupabaseClient): Promise<ModelsQuotaAdminView> {
  const [tenantsResult, ledgerResult, costTracesResult] = await Promise.all([
    serviceDb.from('tenants').select('tenant_id, display_name, action_quota_monthly, alert_threshold_pct'),
    serviceDb
      .from('credits_ledger')
      .select('tenant_id, action_category, weight')
      .gte('created_at', startOfCurrentMonthIso()),
    serviceDb
      .from('cost_traces')
      .select('model, provider, tokens_in, tokens_out, usd_cost, job_run_id')
      .gte('created_at', startOfCurrentMonthIso()),
  ])

  if (tenantsResult.error) throw new Error(`[models-quota] tenants: ${tenantsResult.error.message}`)
  if (ledgerResult.error) throw new Error(`[models-quota] credits_ledger: ${ledgerResult.error.message}`)
  if (costTracesResult.error) throw new Error(`[models-quota] cost_traces: ${costTracesResult.error.message}`)

  type TenantRow = {
    tenant_id: string
    display_name: string | null
    action_quota_monthly: number
    alert_threshold_pct: number
  }
  type LedgerRow = CreditLedgerRow & { tenant_id: string }

  const tenantRows = (tenantsResult.data ?? []) as TenantRow[]
  const ledgerRows = (ledgerResult.data ?? []) as LedgerRow[]
  const costTraceRows = (costTracesResult.data ?? []) as CostTraceRow[]

  const ledgerByTenant = new Map<string, CreditLedgerRow[]>()
  for (const row of ledgerRows) {
    const bucket = ledgerByTenant.get(row.tenant_id) ?? []
    bucket.push({ action_category: row.action_category, weight: row.weight })
    ledgerByTenant.set(row.tenant_id, bucket)
  }

  const tenants = tenantRows.map((tenant) => ({
    tenantId: tenant.tenant_id,
    displayName: tenant.display_name,
    actionQuotaMonthly: tenant.action_quota_monthly,
    alertThresholdPct: tenant.alert_threshold_pct,
    ledgerRows: ledgerByTenant.get(tenant.tenant_id) ?? [],
  }))

  return buildAdminView({ registry, tenants, costTraceRows })
}

/**
 * Vérifie que l'utilisateur authentifié a le rôle `admin` avant de construire la vue admin.
 * Lève `ForbiddenAdminAccessError` sinon. `db` = client RLS de la session (pas service_role) :
 * la policy `users_self` limite la lecture à la propre ligne de l'appelant, donc cette requête
 * ne peut jamais révéler le rôle d'un autre utilisateur.
 */
export async function assertAdminRole(db: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await db.from('users').select('role').eq('id', userId).maybeSingle()
  if (error) throw new Error(`[models-quota] users: ${error.message}`)
  const role = (data as { role: string } | null)?.role
  if (role !== 'admin') throw new ForbiddenAdminAccessError()
}
