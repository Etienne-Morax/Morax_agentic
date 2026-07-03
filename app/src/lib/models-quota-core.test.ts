import { registry } from '@morax/model-core'
import { describe, expect, test } from 'vitest'
import { bucketDailyTrend, buildAdminView, buildClientView } from './models-quota-core.js'
import type { CreditLedgerRow } from './credits-core.js'
import type { CostTraceRow } from './cogs-core.js'

describe('buildAdminView', () => {
  test('agrège les modèles du registre réel (aucune valeur en dur)', () => {
    // Arrange / Act
    const view = buildAdminView({ registry, tenants: [], costTraceRows: [] })

    // Assert
    const expectedCount = Object.values(registry.tiers).reduce(
      (sum, tier) => sum + Object.keys(tier).length,
      0,
    )
    expect(view.models).toHaveLength(expectedCount)
    expect(view.detail).toBe('admin')
  })

  test('somme les crédits consommés/quota sur tous les tenants, sans les mélanger', () => {
    // Arrange
    const tenantA = {
      tenantId: 'tenant-a',
      displayName: 'Tenant A',
      actionQuotaMonthly: 60,
      alertThresholdPct: 80,
      ledgerRows: [{ action_category: 'scan_document', weight: 10 }] as CreditLedgerRow[],
    }
    const tenantB = {
      tenantId: 'tenant-b',
      displayName: 'Tenant B',
      actionQuotaMonthly: 100,
      alertThresholdPct: 80,
      ledgerRows: [{ action_category: 'brouillon_devis', weight: 30 }] as CreditLedgerRow[],
    }

    // Act
    const view = buildAdminView({ registry, tenants: [tenantA, tenantB], costTraceRows: [] })

    // Assert
    expect(view.globalCredits).toEqual({ consumed: 40, quota: 160 })
    expect(view.byTenant).toHaveLength(2)
    expect(view.byTenant[0]?.tenantId).toBe('tenant-a')
    expect(view.byTenant[0]?.credits.consumed).toBe(10)
    expect(view.byTenant[1]?.tenantId).toBe('tenant-b')
    expect(view.byTenant[1]?.credits.consumed).toBe(30)
  })

  test('inclut une tendance conso/jour depuis trendRows + garde-fous budget non connectés par défaut', () => {
    // Arrange
    const trendRows = [
      { created_at: '2026-07-02T09:00:00.000Z', weight: 2 },
      { created_at: '2026-07-02T18:00:00.000Z', weight: 3 },
      { created_at: '2026-07-01T10:00:00.000Z', weight: 1 },
    ]

    // Act
    const view = buildAdminView({ registry, tenants: [], costTraceRows: [], trendRows })

    // Assert : triée par jour croissant, poids sommés par jour UTC
    expect(view.trend).toEqual([
      { day: '2026-07-01', weight: 1 },
      { day: '2026-07-02', weight: 5 },
    ])
    expect(view.budgetGuards.connected).toBe(false)
  })

  test('garde-fous budget : passe-plat quand fourni', () => {
    // Arrange / Act
    const view = buildAdminView({
      registry,
      tenants: [],
      costTraceRows: [],
      budgetGuards: { connected: true, note: 'quota Max OK' },
    })

    // Assert
    expect(view.budgetGuards).toEqual({ connected: true, note: 'quota Max OK' })
  })

  test('inclut la tendance COGS séparée des crédits produit', () => {
    // Arrange
    const costTraceRows: CostTraceRow[] = [
      {
        model: 'claude-opus-4-8',
        provider: 'anthropic',
        tokens_in: 1000,
        tokens_out: 500,
        usd_cost: 0.02,
        job_run_id: 'job-1',
      },
    ]

    // Act
    const view = buildAdminView({ registry, tenants: [], costTraceRows })

    // Assert
    expect(view.cogs.totals.usdCost).toBeCloseTo(0.02)
    expect(view.cogs.byModel).toHaveLength(1)
    expect(view.cogs.byModel[0]?.model).toBe('claude-opus-4-8')
  })
})

describe('bucketDailyTrend', () => {
  test('regroupe par jour UTC, somme les poids et trie par jour croissant', () => {
    const rows = [
      { created_at: '2026-07-03T23:59:00.000Z', weight: 4 },
      { created_at: '2026-07-01T00:00:00.000Z', weight: 1 },
      { created_at: '2026-07-01T12:00:00.000Z', weight: 2 },
    ]
    expect(bucketDailyTrend(rows)).toEqual([
      { day: '2026-07-01', weight: 3 },
      { day: '2026-07-03', weight: 4 },
    ])
  })

  test('ignore les created_at inexploitables et renvoie [] sur entrée vide', () => {
    expect(bucketDailyTrend([])).toEqual([])
    expect(bucketDailyTrend([{ created_at: 'x', weight: 5 }])).toEqual([])
  })
})

describe('buildClientView', () => {
  test('expose des labels produit sans détail infra ni nom technique de provider', () => {
    // Arrange / Act
    const view = buildClientView({
      registry,
      tenant: { actionQuotaMonthly: 60, alertThresholdPct: 80 },
      ledgerRows: [],
    })

    // Assert
    expect(view.detail).toBe('client')
    for (const model of view.models) {
      expect(model.label).not.toMatch(/anthropic|openrouter|claude-|gemini-|minimax|deepseek/i)
    }
  })

  test('ne retient que les rôles atteignables (exclut les rôles uniquement dépréciés)', () => {
    // Arrange / Act
    const view = buildClientView({
      registry,
      tenant: { actionQuotaMonthly: 60, alertThresholdPct: 80 },
      ledgerRows: [],
    })

    // Assert
    const roles = view.models.map((m) => m.role)
    expect(roles).toContain('cerveau')
    expect(roles).toContain('workhorse')
    expect(roles).toContain('micro')
  })

  test('calcule les crédits uniquement à partir des lignes du tenant courant', () => {
    // Arrange
    const ledgerRows: CreditLedgerRow[] = [
      { action_category: 'scan_document', weight: 5 },
      { action_category: 'classification', weight: 2 },
    ]

    // Act
    const view = buildClientView({
      registry,
      tenant: { actionQuotaMonthly: 60, alertThresholdPct: 80 },
      ledgerRows,
    })

    // Assert
    expect(view.credits.consumed).toBe(7)
    expect(view.credits.quota).toBe(60)
  })
})
