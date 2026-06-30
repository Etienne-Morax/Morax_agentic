import { describe, expect, it } from 'vitest'
import {
  ACTION_WEIGHTS,
  computeMonthlyQuota,
  creditCost,
  suggestUpgradePack,
  usageStatus,
} from './credits.js'

describe('poids des actions (grille-actions-poids.md)', () => {
  it('respecte la grille', () => {
    expect(creditCost('rappel_automatique')).toBe(0.5)
    expect(creditCost('classification')).toBe(0.5)
    expect(creditCost('scan_document')).toBe(1)
    expect(creditCost('resume_financier')).toBe(1.5)
    expect(creditCost('brouillon_facture')).toBe(2)
    expect(creditCost('brouillon_devis')).toBe(3)
    expect(creditCost('devis_complexe')).toBe(5)
  })

  it('couvre les 10 catégories', () => {
    expect(Object.keys(ACTION_WEIGHTS)).toHaveLength(10)
  })
})

describe('computeMonthlyQuota', () => {
  it('base seule = 60', () => {
    expect(computeMonthlyQuota(['base'])).toBe(60)
  })

  it('base + pack devis_facture = 100', () => {
    expect(computeMonthlyQuota(['base', 'devis_facture'])).toBe(100)
  })

  it('base + recus + voix = 120', () => {
    expect(computeMonthlyQuota(['base', 'recus_depenses', 'voix'])).toBe(120)
  })

  it('tier_premium n ajoute pas de crédits', () => {
    expect(computeMonthlyQuota(['base', 'tier_premium'])).toBe(60)
  })

  it('ajoute base implicitement si absent', () => {
    expect(computeMonthlyQuota(['devis_facture'])).toBe(100)
  })
})

describe('usageStatus', () => {
  it('48/60 au seuil 80% = alerte, non bloqué, orange', () => {
    const s = usageStatus(48, 60, 80)
    expect(s.pct).toBe(80)
    expect(s.alert).toBe(true)
    expect(s.blocked).toBe(false)
    expect(s.zone).toBe('orange')
  })

  it('54/60 = 90% = rouge', () => {
    const s = usageStatus(54, 60, 80)
    expect(s.zone).toBe('red')
    expect(s.alert).toBe(true)
  })

  it('60/60 = bloqué', () => {
    const s = usageStatus(60, 60, 80)
    expect(s.blocked).toBe(true)
  })

  it('30/60 = vert, pas d alerte', () => {
    const s = usageStatus(30, 60, 80)
    expect(s.zone).toBe('green')
    expect(s.alert).toBe(false)
    expect(s.blocked).toBe(false)
  })
})

describe('suggestUpgradePack', () => {
  it('scans -> pack reçus/dépenses', () => {
    expect(suggestUpgradePack('scan_document')).toBe('recus_depenses')
  })
  it('devis -> pack devis/factures', () => {
    expect(suggestUpgradePack('brouillon_devis')).toBe('devis_facture')
  })
})
