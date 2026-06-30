/**
 * Morax - Types du tenant.
 * Reflet typé de config/tenant.schema.yaml (devenu src/tenant.schema.yaml).
 * La source de vérité du schéma reste le YAML ; ce fichier en est la projection TypeScript.
 */

export type Offre = 'base' | 'intermediaire' | 'premium'

export type ModelPolicy = 'latest' | 'pinned'

export type QuotaExceededBehavior = 'queue' | 'reject'

export type Pack =
  | 'base'
  | 'recus_depenses'
  | 'devis_facture'
  | 'voix'
  | 'tier_premium'

export interface TenantConfig {
  tenant_id: string
  display_name?: string
  email?: string
  created_at?: string
  locale?: string
  currency?: string

  offre: Offre
  model_policy?: ModelPolicy
  /** Autorise la montée d'un palier lors d'un fallback. */
  fallback_quota: boolean

  action_quota_monthly: number
  alert_threshold_pct: number
  quota_exceeded_behavior: QuotaExceededBehavior

  packs_actifs: Pack[]

  data_region?: string
  gdpr_dpa_signed?: boolean
  personal_data_consent?: boolean
}
