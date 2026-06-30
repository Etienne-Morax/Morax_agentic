/**
 * Morax - Chargement et typage du registre de modèles.
 * Le YAML (src/models.registry.yaml) est la source de vérité unique.
 * Aucun identifiant de modèle n'est codé en dur ailleurs.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

export interface RegistryRoleConfig {
  model: string
  openrouter_model?: string
  provider: string
  endpoint: string
  max_context_tokens: number
  price_in_usd_per_m: number
  price_out_usd_per_m: number
  context_price_break_tokens?: number
  quota_monthly_tokens?: number
  rgpd_note?: string
  notes?: string
}

export type RegistryRole = 'cerveau' | 'workhorse' | 'micro'

export type RegistryTier = Record<RegistryRole, RegistryRoleConfig>

export interface FinanceCriticalPin {
  tier: string
  role: RegistryRole
}

export interface PromotionPolicy {
  require_eval_gate: boolean
  auto_promotion: boolean
  canary_traffic_pct: number
  eval_gate_description?: string
}

export interface Guardrails {
  max_context_tokens_per_call: number
  finance_critical_roles: string[]
  finance_critical_pin: FinanceCriticalPin
  planner_roles: string[]
  planner_pin: FinanceCriticalPin
  fallback_order: Record<string, string>
  promotion_policy: PromotionPolicy
}

export interface Registry {
  version: string
  last_reviewed: string
  next_review: string
  tiers: Record<string, RegistryTier>
  guardrails: Guardrails
}

const REGISTRY_FILENAME = 'models.registry.yaml'

function locateRegistryFile(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, REGISTRY_FILENAME), // src (vitest/tsx) ou dist si copié
    join(here, '..', 'src', REGISTRY_FILENAME), // dist -> src
  ]
  const found = candidates.find((p) => existsSync(p))
  if (!found) {
    throw new Error(
      `[registry] Fichier introuvable. Cherché : ${candidates.join(', ')}`,
    )
  }
  return found
}

function validateRegistry(raw: unknown): Registry {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('[registry] Contenu YAML invalide (objet attendu).')
  }
  const r = raw as Partial<Registry>
  if (!r.tiers || typeof r.tiers !== 'object') {
    throw new Error('[registry] Clé `tiers` manquante.')
  }
  if (!r.guardrails || typeof r.guardrails !== 'object') {
    throw new Error('[registry] Clé `guardrails` manquante.')
  }
  const g = r.guardrails
  if (typeof g.max_context_tokens_per_call !== 'number') {
    throw new Error('[registry] guardrails.max_context_tokens_per_call manquant.')
  }
  if (!Array.isArray(g.finance_critical_roles)) {
    throw new Error('[registry] guardrails.finance_critical_roles manquant.')
  }
  if (!g.finance_critical_pin || typeof g.finance_critical_pin !== 'object') {
    throw new Error('[registry] guardrails.finance_critical_pin manquant.')
  }
  if (!Array.isArray(g.planner_roles)) {
    throw new Error('[registry] guardrails.planner_roles manquant.')
  }
  if (!g.planner_pin || typeof g.planner_pin !== 'object') {
    throw new Error('[registry] guardrails.planner_pin manquant.')
  }
  return raw as Registry
}

function loadRegistry(): Registry {
  const path = locateRegistryFile()
  const text = readFileSync(path, 'utf8')
  return validateRegistry(yaml.load(text))
}

/** Registre chargé une seule fois au premier import (immuable côté lecture). */
export const registry: Registry = loadRegistry()
export const guardrails: Guardrails = registry.guardrails
