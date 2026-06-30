/**
 * Morax - resume credits/usage (lecture seule, ZERO appel IA).
 * Reutilise usageStatus() de @morax/model-core (meme logique que le worker) :
 * la fonction SQL morax_credits_consumed() est reservee service_role, le web
 * app somme credits_ledger directement (deja filtre par periode + RLS).
 */

import { usageStatus, type UsageStatus } from '@morax/model-core'

export interface CreditLedgerRow {
  action_category: string
  weight: number
}

export interface CreditsCategoryBreakdown {
  category: string
  weight: number
}

export interface CreditsTenant {
  actionQuotaMonthly: number
  alertThresholdPct: number
}

export interface CreditsSummary extends UsageStatus {
  byCategory: CreditsCategoryBreakdown[]
}

export function summarizeCredits(
  rows: readonly CreditLedgerRow[],
  tenant: CreditsTenant,
): CreditsSummary {
  const consumed = rows.reduce((sum, row) => sum + row.weight, 0)
  const status = usageStatus(consumed, tenant.actionQuotaMonthly, tenant.alertThresholdPct)

  const byCategoryMap = new Map<string, number>()
  for (const row of rows) {
    byCategoryMap.set(row.action_category, (byCategoryMap.get(row.action_category) ?? 0) + row.weight)
  }
  const byCategory = [...byCategoryMap.entries()]
    .map(([category, weight]) => ({ category, weight }))
    .sort((a, b) => b.weight - a.weight)

  return { ...status, byCategory }
}
