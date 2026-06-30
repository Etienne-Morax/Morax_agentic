/**
 * Dashboard credits (chemin de lecture). ZERO appel IA.
 * Somme credits_ledger du mois courant cote RLS (morax_credits_consumed est
 * reserve service_role, voir supabase/migrations/0002_tighten_function_grants.sql).
 */

import { createClient } from '@/lib/supabase/server'
import { summarizeCredits, type CreditLedgerRow } from '@/lib/credits-core'
import { UsageBar } from '@/components/usage-bar'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'

function startOfCurrentMonthIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

export default async function CreditsPage() {
  const supabase = await createClient()

  const [tenantResult, ledgerResult] = await Promise.all([
    supabase.from('tenants').select('action_quota_monthly, alert_threshold_pct').maybeSingle(),
    supabase
      .from('credits_ledger')
      .select('action_category, weight')
      .gte('created_at', startOfCurrentMonthIso()),
  ])

  if (tenantResult.error) throw new Error(`[credits] tenants: ${tenantResult.error.message}`)
  if (ledgerResult.error) throw new Error(`[credits] credits_ledger: ${ledgerResult.error.message}`)

  const tenant = tenantResult.data as { action_quota_monthly: number; alert_threshold_pct: number } | null
  const rows = (ledgerResult.data ?? []) as CreditLedgerRow[]

  const summary = summarizeCredits(rows, {
    actionQuotaMonthly: tenant?.action_quota_monthly ?? 60,
    alertThresholdPct: tenant?.alert_threshold_pct ?? 80,
  })

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
    </section>
  )
}
