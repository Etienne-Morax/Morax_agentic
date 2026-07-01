import { describe, expect, test } from 'vitest'
import { buildCogsSummary, type CostTraceRow } from './cogs-core.js'

function costTrace(overrides: Partial<CostTraceRow> = {}): CostTraceRow {
  return {
    model: 'claude-opus-4-8',
    provider: 'anthropic',
    tokens_in: 100,
    tokens_out: 50,
    usd_cost: 0.01,
    job_run_id: null,
    ...overrides,
  }
}

describe('buildCogsSummary', () => {
  test('returns zeros and empty breakdowns when no rows', () => {
    // Arrange / Act
    const summary = buildCogsSummary([])

    // Assert
    expect(summary.totals).toEqual({
      usdCost: 0,
      tokensIn: 0,
      tokensOut: 0,
      jobCount: 0,
      traceCount: 0,
    })
    expect(summary.byModel).toEqual([])
    expect(summary.byProvider).toEqual([])
  })

  test('aggregates cost and tokens for a single model across rows', () => {
    // Arrange
    const rows: CostTraceRow[] = [
      costTrace({ usd_cost: 0.01, tokens_in: 100, tokens_out: 50 }),
      costTrace({ usd_cost: 0.02, tokens_in: 200, tokens_out: 80 }),
    ]

    // Act
    const summary = buildCogsSummary(rows)

    // Assert
    expect(summary.totals.usdCost).toBeCloseTo(0.03)
    expect(summary.totals.tokensIn).toBe(300)
    expect(summary.totals.tokensOut).toBe(130)
    expect(summary.byModel).toHaveLength(1)
    expect(summary.byModel[0]?.usdCost).toBeCloseTo(0.03)
  })

  test('counts distinct job_run_id as a single job', () => {
    // Arrange
    const rows: CostTraceRow[] = [
      costTrace({ job_run_id: 'job-1' }),
      costTrace({ job_run_id: 'job-1' }),
    ]

    // Act
    const summary = buildCogsSummary(rows)

    // Assert
    expect(summary.totals.jobCount).toBe(1)
    expect(summary.byModel[0]?.jobCount).toBe(1)
  })

  test('excludes null job_run_id from job count but still sums cost', () => {
    // Arrange
    const rows: CostTraceRow[] = [
      costTrace({ job_run_id: null, usd_cost: 0.05 }),
      costTrace({ job_run_id: 'job-2', usd_cost: 0.05 }),
    ]

    // Act
    const summary = buildCogsSummary(rows)

    // Assert
    expect(summary.totals.jobCount).toBe(1)
    expect(summary.totals.usdCost).toBeCloseTo(0.1)
  })

  test('sorts byModel descending by usd cost', () => {
    // Arrange
    const rows: CostTraceRow[] = [
      costTrace({ model: 'gemini-3.1-pro-preview', provider: 'google', usd_cost: 0.01 }),
      costTrace({ model: 'claude-opus-4-8', provider: 'anthropic', usd_cost: 0.05 }),
    ]

    // Act
    const summary = buildCogsSummary(rows)

    // Assert
    expect(summary.byModel.map((entry) => entry.model)).toEqual([
      'claude-opus-4-8',
      'gemini-3.1-pro-preview',
    ])
  })

  test('sharePct sums to approximately 100 across models', () => {
    // Arrange
    const rows: CostTraceRow[] = [
      costTrace({ model: 'claude-opus-4-8', usd_cost: 0.03 }),
      costTrace({ model: 'claude-sonnet-4-6', usd_cost: 0.01 }),
    ]

    // Act
    const summary = buildCogsSummary(rows)

    // Assert
    const totalShare = summary.byModel.reduce((sum, entry) => sum + entry.sharePct, 0)
    expect(totalShare).toBeCloseTo(100)
  })

  test('groups byProvider across multiple models from the same provider', () => {
    // Arrange
    const rows: CostTraceRow[] = [
      costTrace({ model: 'claude-opus-4-8', provider: 'anthropic', usd_cost: 0.02 }),
      costTrace({ model: 'claude-sonnet-4-6', provider: 'anthropic', usd_cost: 0.01 }),
      costTrace({ model: 'gemini-3.1-pro-preview', provider: 'google', usd_cost: 0.01 }),
    ]

    // Act
    const summary = buildCogsSummary(rows)

    // Assert
    expect(summary.byProvider).toEqual([
      { provider: 'anthropic', usdCost: expect.closeTo(0.03, 6), sharePct: expect.closeTo(75, 6) },
      { provider: 'google', usdCost: expect.closeTo(0.01, 6), sharePct: expect.closeTo(25, 6) },
    ])
  })

  test('sums tokens_in and tokens_out per model independently of cost', () => {
    // Arrange
    const rows: CostTraceRow[] = [
      costTrace({ tokens_in: 1000, tokens_out: 500 }),
      costTrace({ tokens_in: 2000, tokens_out: 700 }),
    ]

    // Act
    const summary = buildCogsSummary(rows)

    // Assert
    expect(summary.byModel[0]?.tokensIn).toBe(3000)
    expect(summary.byModel[0]?.tokensOut).toBe(1200)
  })

  test('keeps traceCount equal to raw row count regardless of grouping', () => {
    // Arrange
    const rows: CostTraceRow[] = [
      costTrace({ model: 'claude-opus-4-8' }),
      costTrace({ model: 'claude-opus-4-8' }),
      costTrace({ model: 'claude-sonnet-4-6' }),
    ]

    // Act
    const summary = buildCogsSummary(rows)

    // Assert
    expect(summary.totals.traceCount).toBe(3)
  })

  test('reports provider from the first row seen for a model', () => {
    // Arrange
    const rows: CostTraceRow[] = [costTrace({ model: 'deepseek-v4-flash', provider: 'deepseek' })]

    // Act
    const summary = buildCogsSummary(rows)

    // Assert
    expect(summary.byModel[0]?.provider).toBe('deepseek')
  })
})
