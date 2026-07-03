/**
 * Morax - panneau partage "Modeles actifs + Quota de credits".
 * Une seule prop `detail` conditionne les sections : `admin` (Etienne, tous tenants,
 * detail infra en lecture seule) vs `client` (tenant courant uniquement, aucun detail
 * infra/provider). Zero valeur en dur : tout vient de `ModelsQuotaAdminView` /
 * `ModelsQuotaClientView` (app/src/lib/models-quota-core.ts), elles-memes derivees du
 * registre model-core + Supabase (deja filtre RLS ou service_role selon le loader appele).
 */

import type { ActiveModelStatus } from '@morax/model-core'
import { BadgeCheck, Bot, Coins, GitBranch, Layers, TriangleAlert } from 'lucide-react'
import { SectionCard } from './section-card'
import { StatusPill } from './status-pill'
import { EmptyState } from './empty-state'
import { Gauge } from './charts/gauge'
import { UsageBar } from './usage-bar'
import type { StatusTone } from '@/lib/status-tone'
import type { ModelsQuotaAdminView, ModelsQuotaClientView } from '@/lib/models-quota-core'
import styles from './models-quota-panel.module.css'

const STATUS_LABEL: Record<ActiveModelStatus, string> = {
  active: 'Actif',
  fallback: 'Fallback',
  deprecated: 'Deprecie',
}

const STATUS_TONE: Record<ActiveModelStatus, StatusTone> = {
  active: 'success',
  fallback: 'warning',
  deprecated: 'neutral',
}

interface ModelsQuotaPanelProps {
  detail: 'admin' | 'client'
  view: ModelsQuotaAdminView | ModelsQuotaClientView
}

/** Point d'entree : dispatch vers la vue admin ou client selon `detail`. */
export function ModelsQuotaPanel({ detail, view }: ModelsQuotaPanelProps) {
  if (detail === 'admin' && view.detail === 'admin') {
    return <AdminModelsQuotaPanel view={view} />
  }
  if (detail === 'client' && view.detail === 'client') {
    return <ClientModelsQuotaPanel view={view} />
  }
  throw new Error(`[models-quota-panel] detail="${detail}" ne correspond pas a view.detail="${view.detail}"`)
}

function AdminModelsQuotaPanel({ view }: { view: ModelsQuotaAdminView }) {
  return (
    <div className={styles.panel}>
      <SectionCard title="Modeles actifs" icon={<Bot strokeWidth={2} />} count={view.models.length}>
        <ul className={styles.modelList}>
          {view.models.map((model) => (
            <li key={model.id} className={styles.modelRow}>
              <div className={styles.modelInfo}>
                <span className={styles.modelLabel}>{model.label}</span>
                <span className={styles.modelMeta}>
                  {model.provider}
                  {model.pinned && ' · epingle'}
                </span>
              </div>
              <StatusPill label={STATUS_LABEL[model.status]} tone={STATUS_TONE[model.status]} />
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Credits — global" icon={<Coins strokeWidth={2} />}>
        <div className={styles.quotaCard}>
          <Gauge
            pct={view.globalCredits.quota > 0 ? (view.globalCredits.consumed / view.globalCredits.quota) * 100 : 0}
            zone="green"
            centerValue={`${view.globalCredits.consumed}`}
            centerLabel={`/ ${view.globalCredits.quota}`}
            size={140}
          />
          <p className={styles.quotaHint}>
            Somme de tous les tenants actifs ce mois-ci. Vue interne uniquement.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Credits — par tenant" icon={<Layers strokeWidth={2} />} count={view.byTenant.length}>
        {view.byTenant.length === 0 ? (
          <EmptyState icon={<Layers strokeWidth={2} />} title="Aucun tenant avec consommation ce mois-ci." />
        ) : (
          <ul className={styles.tenantList}>
            {view.byTenant.map((tenant) => (
              <li key={tenant.tenantId} className={styles.tenantRow}>
                <div className={styles.tenantInfo}>
                  <span className={styles.tenantName}>{tenant.displayName ?? tenant.tenantId}</span>
                  <span className={styles.tenantValue}>
                    {tenant.credits.consumed} / {tenant.credits.quota} credits
                  </span>
                </div>
                <UsageBar pct={tenant.credits.pct} zone={tenant.credits.zone} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Tendance cout reel (COGS)" icon={<GitBranch strokeWidth={2} />}>
        {view.cogs.totals.traceCount === 0 ? (
          <EmptyState icon={<Coins strokeWidth={2} />} title="Aucun cout enregistre ce mois-ci." />
        ) : (
          <ul className={styles.cogsList}>
            {view.cogs.byModel.map((entry) => (
              <li key={entry.model} className={styles.cogsRow}>
                <span className={styles.modelLabel}>{entry.model}</span>
                <span className={styles.modelMeta}>{entry.provider}</span>
                <span className={styles.tenantValue}>${entry.usdCost.toFixed(4)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.quotaHint}>
          Cout d&apos;infrastructure reel (USD), indicatif, distinct des credits produit ci-dessus.
        </p>
      </SectionCard>
    </div>
  )
}

function ClientModelsQuotaPanel({ view }: { view: ModelsQuotaClientView }) {
  return (
    <div className={styles.panel}>
      <SectionCard title="Modeles utilises pour vos actions" icon={<BadgeCheck strokeWidth={2} />}>
        <ul className={styles.modelList}>
          {view.models.map((model) => (
            <li key={model.role} className={styles.modelRow}>
              <span className={styles.modelLabel}>{model.label}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Vos credits" icon={<Coins strokeWidth={2} />}>
        <div className={styles.quotaCard}>
          <Gauge
            pct={view.credits.pct}
            zone={view.credits.zone}
            centerValue={`${Math.round(view.credits.pct)}%`}
            centerLabel="utilise"
            size={160}
          />
          <div className={styles.quotaInfo}>
            <p className={styles.quotaValue}>
              {view.credits.consumed} / {view.credits.quota} credits
            </p>
            {view.credits.alert && (
              <p className={styles.alert} role="status">
                <TriangleAlert className={styles.alertIcon} strokeWidth={2} aria-hidden="true" />
                Vous approchez de votre quota mensuel.
              </p>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
