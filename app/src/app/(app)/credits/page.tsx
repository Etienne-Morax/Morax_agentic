/**
 * Dashboard credits (chemin de lecture). ZERO appel IA.
 * Somme credits_ledger du mois courant cote RLS (morax_credits_consumed est
 * reserve service_role, voir supabase/migrations/0002_tighten_function_grants.sql).
 */

import { createClient } from '@/lib/supabase/server'
import { summarizeCredits, type CreditLedgerRow } from '@/lib/credits-core'
import { buildCogsSummary, type CostTraceRow } from '@/lib/cogs-core'
import { UsageBar } from '@/components/usage-bar'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'

const USD_FORMATTER = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})
const TOKEN_FORMATTER = new Intl.NumberFormat('en-GB')

function formatUsd(value: number): string {
  return USD_FORMATTER.format(value)
}

function formatTokens(value: number): string {
  return TOKEN_FORMATTER.format(value)
}

function startOfCurrentMonthIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

export default async function CreditsPage() {
  const supabase = await createClient()

  const [tenantResult, ledgerResult, costTracesResult] = await Promise.all([
    supabase.from('tenants').select('action_quota_monthly, alert_threshold_pct').maybeSingle(),
    supabase
      .from('credits_ledger')
      .select('action_category, weight')
      .gte('created_at', startOfCurrentMonthIso()),
    supabase
      .from('cost_traces')
      .select('model, provider, tokens_in, tokens_out, usd_cost, job_run_id')
      .gte('created_at', startOfCurrentMonthIso()),
  ])

  if (tenantResult.error) throw new Error(`[credits] tenants: ${tenantResult.error.message}`)
  if (ledgerResult.error) throw new Error(`[credits] credits_ledger: ${ledgerResult.error.message}`)
  if (costTracesResult.error) throw new Error(`[credits] cost_traces: ${costTracesResult.error.message}`)

  const tenant = tenantResult.data as { action_quota_monthly: number; alert_threshold_pct: number } | null
  const rows = (ledgerResult.data ?? []) as CreditLedgerRow[]
  const costTraceRows = (costTracesResult.data ?? []) as CostTraceRow[]

  const summary = summarizeCredits(rows, {
    actionQuotaMonthly: tenant?.action_quota_monthly ?? 60,
    alertThresholdPct: tenant?.alert_threshold_pct ?? 80,
  })
  const cogs = buildCogsSummary(costTraceRows)

  return (
    <section>
      <h1 className={styles.title}>Credits</h1>

      <div className={styles.usageCard}>
        <div className={styles.usageHeader}>
          <span className={styles.usageLabel}>
            {summary.consumed} / {summary.quota} credits utilises ce mois-ci
          </span>
          <span className={styles.usagePct}>{Math.round(summary.pct)}%</span>
        </div>
        <UsageBar pct={summary.pct} zone={summary.zone} />
        {summary.alert && (
          <p className={styles.alert} role="status">
            Vous approchez de votre quota mensuel.
          </p>
        )}
      </div>

      <h2 className={styles.sectionTitle}>Repartition par categorie</h2>
      {summary.byCategory.length === 0 ? (
        <p className={styles.empty}>Aucune consommation ce mois-ci.</p>
      ) : (
        <ul className={styles.list}>
          {summary.byCategory.map((entry) => (
            <li key={entry.category} className={styles.item}>
              <span className={styles.itemLabel}>{entry.category}</span>
              <span className={styles.itemWeight}>{entry.weight}</span>
            </li>
          ))}
        </ul>
      )}

      <h2 className={styles.sectionTitle}>Details COGS - cout reel ce mois-ci</h2>
      {cogs.totals.traceCount === 0 ? (
        <p className={styles.empty}>Aucun cout enregistre ce mois-ci.</p>
      ) : (
        <>
          <div className={styles.cogsTotals}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Cout total</span>
              <span className={styles.statValue}>{formatUsd(cogs.totals.usdCost)}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Jobs</span>
              <span className={styles.statValue}>{cogs.totals.jobCount}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Tokens</span>
              <span className={styles.statValue}>
                {formatTokens(cogs.totals.tokensIn)} in / {formatTokens(cogs.totals.tokensOut)} out
              </span>
            </div>
          </div>

          <ul className={styles.list}>
            {cogs.byModel.map((entry) => (
              <li key={entry.model} className={styles.item}>
                <div className={styles.cogsModelInfo}>
                  <div className={styles.cogsModelHeader}>
                    <span className={styles.itemLabel}>{entry.model}</span>
                    <span className={styles.providerTag}>{entry.provider}</span>
                  </div>
                  <div className={styles.shareBar}>
                    <div className={styles.shareFill} style={{ width: `${entry.sharePct}%` }} />
                  </div>
                  <span className={styles.cogsModelMeta}>
                    {entry.jobCount} job{entry.jobCount === 1 ? '' : 's'} -{' '}
                    {formatTokens(entry.tokensIn)} in / {formatTokens(entry.tokensOut)} out
                  </span>
                </div>
                <span className={styles.itemWeight}>{formatUsd(entry.usdCost)}</span>
              </li>
            ))}
          </ul>

          <ul className={styles.providerList}>
            {cogs.byProvider.map((entry) => (
              <li key={entry.provider} className={styles.providerItem}>
                <span className={styles.providerTag}>{entry.provider}</span>
                <span className={styles.itemWeight}>
                  {formatUsd(entry.usdCost)} ({Math.round(entry.sharePct)}%)
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
