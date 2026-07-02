/**
 * Dashboard credits (chemin de lecture). ZERO appel IA.
 * Somme credits_ledger du mois courant cote RLS (morax_credits_consumed est
 * reserve service_role, voir supabase/migrations/0002_tighten_function_grants.sql).
 */

import { ArrowLeftRight, BarChart3, Coins, Layers, PieChart, PlayCircle, TriangleAlert, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { summarizeCredits, type CreditLedgerRow } from '@/lib/credits-core'
import { buildCogsSummary, type CostTraceRow } from '@/lib/cogs-core'
import { StatCard } from '@/components/stat-card'
import { SectionCard } from '@/components/section-card'
import { EmptyState } from '@/components/empty-state'
import { Gauge } from '@/components/charts/gauge'
import { Donut } from '@/components/charts/donut'
import { Bars, StackedBar } from '@/components/charts/bars'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'

const USD_FORMATTER = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})
const TOKEN_COMPACT_FORMATTER = new Intl.NumberFormat('en-GB', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length] ?? 'var(--chart-1)'
}

function formatUsd(value: number): string {
  return USD_FORMATTER.format(value)
}

function formatTokensCompact(value: number): string {
  return TOKEN_COMPACT_FORMATTER.format(value)
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

  const donutSegments = summary.byCategory.map((entry, index) => ({
    value: entry.weight,
    label: entry.category,
    colorVar: chartColor(index),
  }))

  const modelBarItems = cogs.byModel.map((entry, index) => ({
    label: (
      <span className={styles.modelLabel}>
        {entry.model}
        <span className={styles.providerTag}>{entry.provider}</span>
      </span>
    ),
    value: entry.usdCost,
    display: formatUsd(entry.usdCost),
    colorVar: chartColor(index),
  }))

  const providerSegments = cogs.byProvider.map((entry, index) => ({
    value: entry.usdCost,
    colorVar: chartColor(index),
    label: entry.provider,
  }))

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Credits</h1>

      <div className={styles.statGrid}>
        <StatCard label="Credits" value={`${summary.consumed}/${summary.quota}`} icon={Coins} tone="accent" />
        <StatCard label="Cout reel" value={formatUsd(cogs.totals.usdCost)} icon={Wallet} tone="info" />
        <StatCard label="Jobs" value={String(cogs.totals.jobCount)} icon={PlayCircle} tone="success" />
        <StatCard
          label="Tokens"
          value={`${formatTokensCompact(cogs.totals.tokensIn)} / ${formatTokensCompact(cogs.totals.tokensOut)}`}
          hint="entrant / sortant"
          icon={ArrowLeftRight}
          tone="warning"
        />
      </div>

      <div className={styles.quotaCard}>
        <Gauge
          pct={summary.pct}
          zone={summary.zone}
          centerValue={`${Math.round(summary.pct)}%`}
          centerLabel="utilise"
          size={168}
        />
        <div className={styles.quotaInfo}>
          <p className={styles.quotaLabel}>Quota mensuel</p>
          <p className={styles.quotaValue}>
            {summary.consumed} / {summary.quota} credits
          </p>
          {summary.alert && (
            <p className={styles.alert} role="status">
              <TriangleAlert className={styles.alertIcon} strokeWidth={2} aria-hidden="true" />
              Vous approchez de votre quota mensuel.
            </p>
          )}
        </div>
      </div>

      <SectionCard title="Repartition par categorie" icon={<PieChart strokeWidth={2} />}>
        {summary.byCategory.length === 0 ? (
          <EmptyState icon={<Coins strokeWidth={2} />} title="Aucune consommation ce mois-ci." />
        ) : (
          <div className={styles.donutRow}>
            <Donut
              segments={donutSegments}
              centerValue={String(summary.consumed)}
              centerLabel="credits"
              ariaLabel="Repartition des credits consommes par categorie"
            />
            <ul className={styles.legend}>
              {summary.byCategory.map((entry, index) => (
                <li key={entry.category} className={styles.legendItem}>
                  <span className={styles.legendSwatch} style={{ background: chartColor(index) }} />
                  <span className={styles.legendLabel}>{entry.category}</span>
                  <span className={styles.legendValue}>{entry.weight}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Cout par modele" icon={<BarChart3 strokeWidth={2} />}>
        {cogs.totals.traceCount === 0 ? (
          <EmptyState icon={<Wallet strokeWidth={2} />} title="Aucun cout enregistre ce mois-ci." />
        ) : (
          <Bars items={modelBarItems} ariaLabel="Cout par modele ce mois-ci" />
        )}
      </SectionCard>

      {cogs.totals.traceCount > 0 && (
        <SectionCard title="Par fournisseur" icon={<Layers strokeWidth={2} />}>
          <StackedBar segments={providerSegments} ariaLabel="Repartition du cout par fournisseur" />
          <ul className={styles.providerLegend}>
            {cogs.byProvider.map((entry, index) => (
              <li key={entry.provider} className={styles.legendItem}>
                <span className={styles.legendSwatch} style={{ background: chartColor(index) }} />
                <span className={styles.legendLabel}>{entry.provider}</span>
                <span className={styles.legendValue}>
                  {formatUsd(entry.usdCost)} ({Math.round(entry.sharePct)}%)
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </section>
  )
}
