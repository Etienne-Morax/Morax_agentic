import { describe, expect, it } from 'vitest'
import {
  assertRgpdCompliance,
  getFallbackRole,
  getUpgradedTier,
  isFinanceCritical,
  isPlannerCritical,
  mapOffreToTier,
  resolveModel,
  resolveModelWithFallback,
} from './model-resolver.js'
import type { ModelConfig } from './model-resolver.js'
import type { Offre, TenantConfig } from './tenant.types.js'

function tenant(offre: Offre, overrides: Partial<TenantConfig> = {}): TenantConfig {
  return {
    tenant_id: `morax-test-${offre}`,
    offre,
    fallback_quota: true,
    action_quota_monthly: 60,
    alert_threshold_pct: 80,
    quota_exceeded_behavior: 'queue',
    packs_actifs: ['base'],
    ...overrides,
  }
}

describe('resolveModel - épinglage finance (Opus toujours)', () => {
  it('route la finance-critique vers Opus 4.8 sur le palier base', () => {
    const m = resolveModel({
      tenantConfig: tenant('base'),
      role: 'micro',
      financeCritical: true,
    })
    expect(m.model).toBe('claude-opus-4-8')
    expect(m.provider).toBe('anthropic')
    expect(m.financePinned).toBe(true)
  })

  it('route la finance-critique vers Opus même si le rôle demandé est workhorse', () => {
    const m = resolveModel({
      tenantConfig: tenant('intermediaire'),
      role: 'workhorse',
      financeCritical: true,
    })
    expect(m.model).toBe('claude-opus-4-8')
  })

  it('détecte la finance-critique via actionRole sémantique', () => {
    const m = resolveModel({
      tenantConfig: tenant('base'),
      role: 'micro',
      actionRole: 'deadline_extraction',
    })
    expect(m.model).toBe('claude-opus-4-8')
    expect(m.financePinned).toBe(true)
  })
})

describe('resolveModel - routage par palier', () => {
  it('palier base (économique), cerveau non-finance = gemini-3.1-pro-preview via OpenRouter', () => {
    const m = resolveModel({ tenantConfig: tenant('base'), role: 'cerveau' })
    expect(m.model).toBe('gemini-3.1-pro-preview')
    expect(m.provider).toBe('google')
    expect(m.endpoint).toContain('openrouter.ai')
    expect(m.financePinned).toBe(false)
  })

  it('palier base, workhorse = minimax-m2.5 via OpenRouter', () => {
    const m = resolveModel({ tenantConfig: tenant('base'), role: 'workhorse' })
    expect(m.model).toBe('minimax-m2.5')
    expect(m.provider).toBe('minimax')
    expect(m.endpoint).toContain('openrouter.ai')
  })

  it('palier premium, micro = haiku', () => {
    const m = resolveModel({ tenantConfig: tenant('premium'), role: 'micro' })
    expect(m.model).toBe('claude-haiku-4-5-20251001')
    expect(m.provider).toBe('anthropic')
  })
})

describe('garde-fou plafond de contexte 100k', () => {
  it('plafonne maxContextTokens à 100000 (premium annonce 200000)', () => {
    const m = resolveModel({ tenantConfig: tenant('premium'), role: 'cerveau' })
    expect(m.maxContextTokens).toBe(100000)
  })

  it('plafonne la falaise MiniMax M3 (512000) à 100000', () => {
    const m = resolveModel({ tenantConfig: tenant('intermediaire'), role: 'workhorse' })
    expect(m.model).toBe('minimax-m3')
    expect(m.maxContextTokens).toBe(100000)
  })
})

describe('assertRgpdCompliance', () => {
  it('autorise minimax via OpenRouter avec données personnelles', () => {
    const m = resolveModel({ tenantConfig: tenant('base'), role: 'workhorse' })
    expect(() => assertRgpdCompliance(m, true)).not.toThrow()
  })

  it('refuse un provider chinois sur endpoint direct avec données personnelles', () => {
    const direct: ModelConfig = {
      model: 'minimax-m2.5',
      provider: 'minimax',
      endpoint: 'https://api.minimax.chat/v1',
      maxContextTokens: 100000,
      priceInUsdPerM: 0.3,
      priceOutUsdPerM: 1.2,
      financePinned: false,
      plannerPinned: false,
    }
    expect(() => assertRgpdCompliance(direct, true)).toThrow(/rgpd/)
  })

  it('autorise un provider occidental (anthropic) avec données personnelles', () => {
    const m = resolveModel({ tenantConfig: tenant('premium'), role: 'cerveau' })
    expect(() => assertRgpdCompliance(m, true)).not.toThrow()
  })

  it('autorise un provider chinois sur endpoint direct SANS données personnelles', () => {
    const direct: ModelConfig = {
      model: 'minimax-m2.5',
      provider: 'minimax',
      endpoint: 'https://api.minimax.chat/v1',
      maxContextTokens: 100000,
      priceInUsdPerM: 0.3,
      priceOutUsdPerM: 1.2,
      financePinned: false,
      plannerPinned: false,
    }
    expect(() => assertRgpdCompliance(direct, false)).not.toThrow()
  })
})

describe('fallback borné', () => {
  it('la finance-critique ne se dégrade jamais (reste Opus)', () => {
    const m = resolveModelWithFallback({
      tenantConfig: tenant('base'),
      role: 'micro',
      financeCritical: true,
    })
    expect(m.model).toBe('claude-opus-4-8')
  })

  it('helpers de fallback', () => {
    expect(getFallbackRole('cerveau')).toBe('workhorse')
    expect(getFallbackRole('workhorse')).toBe('micro')
    expect(getFallbackRole('micro')).toBeNull()
    expect(getUpgradedTier('base')).toBe('intermediaire')
    expect(getUpgradedTier('intermediaire')).toBe('premium')
    expect(getUpgradedTier('premium')).toBeNull()
    expect(mapOffreToTier('base')).toBe('economique')
  })
})

describe('resolveModel - épinglage planificateur (Sonnet toujours)', () => {
  it('route task_decomposition vers Sonnet 4.6 sur le palier base', () => {
    const m = resolveModel({
      tenantConfig: tenant('base'),
      role: 'micro',
      actionRole: 'task_decomposition',
    })
    expect(m.model).toBe('claude-sonnet-4-6')
    expect(m.provider).toBe('anthropic')
    expect(m.plannerPinned).toBe(true)
    expect(m.financePinned).toBe(false)
  })

  it('route task_decomposition vers Sonnet sur le palier intermediaire', () => {
    const m = resolveModel({
      tenantConfig: tenant('intermediaire'),
      role: 'cerveau',
      actionRole: 'task_decomposition',
    })
    expect(m.model).toBe('claude-sonnet-4-6')
    expect(m.plannerPinned).toBe(true)
  })

  it('route task_decomposition vers Sonnet même sur le palier premium', () => {
    const m = resolveModel({
      tenantConfig: tenant('premium'),
      role: 'micro',
      actionRole: 'task_decomposition',
    })
    expect(m.model).toBe('claude-sonnet-4-6')
    expect(m.plannerPinned).toBe(true)
  })

  it('le planificateur ne se dégrade jamais dans le fallback', () => {
    const m = resolveModelWithFallback({
      tenantConfig: tenant('base'),
      role: 'micro',
      actionRole: 'task_decomposition',
    })
    expect(m.model).toBe('claude-sonnet-4-6')
    expect(m.plannerPinned).toBe(true)
  })

  it('isPlannerCritical détecte task_decomposition', () => {
    expect(
      isPlannerCritical({ tenantConfig: tenant('base'), role: 'micro', actionRole: 'task_decomposition' }),
    ).toBe(true)
    expect(
      isPlannerCritical({ tenantConfig: tenant('base'), role: 'micro', actionRole: 'deadline_extraction' }),
    ).toBe(false)
  })

  it('routage normal sans actionRole planificateur reste non pinné', () => {
    const m = resolveModel({ tenantConfig: tenant('base'), role: 'workhorse' })
    expect(m.plannerPinned).toBe(false)
    expect(m.financePinned).toBe(false)
  })

  it('finance-critique prime sur le planificateur si les deux sont demandés', () => {
    const m = resolveModel({
      tenantConfig: tenant('base'),
      role: 'micro',
      financeCritical: true,
      actionRole: 'task_decomposition',
    })
    expect(m.model).toBe('claude-opus-4-8')
    expect(m.financePinned).toBe(true)
    expect(m.plannerPinned).toBe(false)
  })
})

describe('isFinanceCritical et isPlannerCritical', () => {
  it('isFinanceCritical via financeCritical flag', () => {
    expect(isFinanceCritical({ tenantConfig: tenant('base'), role: 'micro', financeCritical: true })).toBe(true)
  })

  it('isFinanceCritical via actionRole sémantique', () => {
    expect(isFinanceCritical({ tenantConfig: tenant('base'), role: 'micro', actionRole: 'amount_verification' })).toBe(true)
  })

  it('ni finance ni planificateur = false', () => {
    expect(isFinanceCritical({ tenantConfig: tenant('base'), role: 'micro' })).toBe(false)
    expect(isPlannerCritical({ tenantConfig: tenant('base'), role: 'micro' })).toBe(false)
  })
})
