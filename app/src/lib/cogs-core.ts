/**
 * Morax - detail COGS (cout reel USD, lecture seule, ZERO appel IA).
 * Source : cost_traces (model, provider, tokens, usd_cost), jamais
 * credits_ledger (credits abstraits uniquement, aucun cout/modele).
 */

export interface CostTraceRow {
  model: string
  provider: string
  tokens_in: number
  tokens_out: number
  usd_cost: number
  job_run_id: string | null
}

export interface CogsTotals {
  usdCost: number
  tokensIn: number
  tokensOut: number
  jobCount: number
  traceCount: number
}

export interface CogsModelBreakdown {
  model: string
  provider: string
  usdCost: number
  tokensIn: number
  tokensOut: number
  jobCount: number
  sharePct: number
}

export interface CogsProviderBreakdown {
  provider: string
  usdCost: number
  sharePct: number
}

export interface CogsSummary {
  totals: CogsTotals
  byModel: CogsModelBreakdown[]
  byProvider: CogsProviderBreakdown[]
}

interface ModelAccumulator {
  provider: string
  usdCost: number
  tokensIn: number
  tokensOut: number
  jobIds: Set<string>
}

interface ProviderAccumulator {
  usdCost: number
}

export function buildCogsSummary(rows: readonly CostTraceRow[]): CogsSummary {
  const totals: CogsTotals = {
    usdCost: 0,
    tokensIn: 0,
    tokensOut: 0,
    jobCount: 0,
    traceCount: rows.length,
  }
  const allJobIds = new Set<string>()
  const byModelMap = new Map<string, ModelAccumulator>()
  const byProviderMap = new Map<string, ProviderAccumulator>()

  for (const row of rows) {
    totals.usdCost += row.usd_cost
    totals.tokensIn += row.tokens_in
    totals.tokensOut += row.tokens_out
    if (row.job_run_id) allJobIds.add(row.job_run_id)

    const modelAcc = byModelMap.get(row.model) ?? {
      provider: row.provider,
      usdCost: 0,
      tokensIn: 0,
      tokensOut: 0,
      jobIds: new Set<string>(),
    }
    modelAcc.usdCost += row.usd_cost
    modelAcc.tokensIn += row.tokens_in
    modelAcc.tokensOut += row.tokens_out
    if (row.job_run_id) modelAcc.jobIds.add(row.job_run_id)
    byModelMap.set(row.model, modelAcc)

    const providerAcc = byProviderMap.get(row.provider) ?? { usdCost: 0 }
    providerAcc.usdCost += row.usd_cost
    byProviderMap.set(row.provider, providerAcc)
  }
  totals.jobCount = allJobIds.size

  const byModel = [...byModelMap.entries()]
    .map(([model, acc]) => ({
      model,
      provider: acc.provider,
      usdCost: acc.usdCost,
      tokensIn: acc.tokensIn,
      tokensOut: acc.tokensOut,
      jobCount: acc.jobIds.size,
      sharePct: totals.usdCost > 0 ? (acc.usdCost / totals.usdCost) * 100 : 0,
    }))
    .sort((a, b) => b.usdCost - a.usdCost)

  const byProvider = [...byProviderMap.entries()]
    .map(([provider, acc]) => ({
      provider,
      usdCost: acc.usdCost,
      sharePct: totals.usdCost > 0 ? (acc.usdCost / totals.usdCost) * 100 : 0,
    }))
    .sort((a, b) => b.usdCost - a.usdCost)

  return { totals, byModel, byProvider }
}
