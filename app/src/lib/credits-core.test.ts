import { describe, expect, test } from 'vitest'
import { summarizeCredits, type CreditLedgerRow } from './credits-core.js'

describe('summarizeCredits', () => {
  test('sums weight to zero when no rows', () => {
    // Arrange / Act
    const summary = summarizeCredits([], { actionQuotaMonthly: 60, alertThresholdPct: 80 })

    // Assert
    expect(summary.consumed).toBe(0)
    expect(summary.zone).toBe('green')
    expect(summary.byCategory).toEqual([])
  })

  test('sums weight across rows and reaches the orange zone past the alert threshold', () => {
    // Arrange
    const rows: CreditLedgerRow[] = [
      { action_category: 'scan_document', weight: 1 },
      { action_category: 'scan_document', weight: 1 },
      { action_category: 'brouillon_devis', weight: 48 },
    ]

    // Act
    const summary = summarizeCredits(rows, { actionQuotaMonthly: 60, alertThresholdPct: 80 })

    // Assert
    expect(summary.consumed).toBe(50)
    expect(summary.pct).toBeCloseTo((50 / 60) * 100)
    expect(summary.zone).toBe('orange')
    expect(summary.alert).toBe(true)
  })

  test('groups weight by category, sorted descending', () => {
    // Arrange
    const rows: CreditLedgerRow[] = [
      { action_category: 'scan_document', weight: 1 },
      { action_category: 'scan_document', weight: 1 },
      { action_category: 'classification', weight: 0.5 },
    ]

    // Act
    const summary = summarizeCredits(rows, { actionQuotaMonthly: 60, alertThresholdPct: 80 })

    // Assert
    expect(summary.byCategory).toEqual([
      { category: 'scan_document', weight: 2 },
      { category: 'classification', weight: 0.5 },
    ])
  })

  test('reaches red zone when consumption exceeds 90 percent', () => {
    // Arrange
    const rows: CreditLedgerRow[] = [{ action_category: 'devis_complexe', weight: 58 }]

    // Act
    const summary = summarizeCredits(rows, { actionQuotaMonthly: 60, alertThresholdPct: 80 })

    // Assert
    expect(summary.zone).toBe('red')
  })
})
