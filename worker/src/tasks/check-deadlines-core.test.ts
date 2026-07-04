import { describe, expect, it } from 'vitest'
import type { ReminderSummaryRow } from '../ports.js'
import { formatDeadlinesDigest } from './check-deadlines-core.js'

function reminder(overrides: Partial<ReminderSummaryRow> = {}): ReminderSummaryRow {
  return {
    id: 'rem-1',
    dueDate: '2026-07-15',
    amount: 340,
    currency: 'GBP',
    ...overrides,
  }
}

describe('formatDeadlinesDigest', () => {
  it('rassure quand les deux listes sont vides', () => {
    expect(formatDeadlinesDigest([], [])).toBe(
      'Aucune echeance en retard ni a venir sous 7 jours.',
    )
  })

  it('formate uniquement la section EN RETARD quand upcoming est vide', () => {
    const text = formatDeadlinesDigest([reminder({ id: 'rem-late' })], [])

    expect(text).toBe('EN RETARD :\n- 15/07/2026 — 340 GBP')
  })

  it('formate uniquement la section A VENIR quand overdue est vide', () => {
    const text = formatDeadlinesDigest([], [reminder({ id: 'rem-soon' })])

    expect(text).toBe('A VENIR (7 jours) :\n- 15/07/2026 — 340 GBP')
  })

  it('formate les deux sections quand les deux listes sont non vides', () => {
    const overdue = [reminder({ id: 'rem-late', dueDate: '2026-07-01', amount: 100, currency: 'EUR' })]
    const upcoming = [reminder({ id: 'rem-soon', dueDate: '2026-07-20', amount: 200, currency: 'USD' })]

    const text = formatDeadlinesDigest(overdue, upcoming)

    expect(text).toBe(
      'EN RETARD :\n- 01/07/2026 — 100 EUR\n\nA VENIR (7 jours) :\n- 20/07/2026 — 200 USD',
    )
  })

  it('omet le montant/devise quand amount est null', () => {
    const text = formatDeadlinesDigest([reminder({ amount: null })], [])

    expect(text).toBe('EN RETARD :\n- 15/07/2026')
  })

  it('liste plusieurs echeances dans la meme section', () => {
    const overdue = [
      reminder({ id: 'rem-1', dueDate: '2026-07-01' }),
      reminder({ id: 'rem-2', dueDate: '2026-07-02', amount: null }),
    ]

    const text = formatDeadlinesDigest(overdue, [])

    expect(text).toBe('EN RETARD :\n- 01/07/2026 — 340 GBP\n- 02/07/2026')
  })
})
