import { describe, expect, it } from 'vitest'
import type { ReminderNotifyPayload } from '@morax/model-core'
import { formatReminderMessage } from './reminder-notify-core.js'

function reminder(overrides: Partial<ReminderNotifyPayload> = {}): ReminderNotifyPayload {
  return {
    id: 'rem-1',
    milestone: 'j7',
    due_date: '2026-07-15',
    amount: 340,
    currency: 'GBP',
    ...overrides,
  }
}

describe('formatReminderMessage', () => {
  it('formate un rappel J-7 avec montant', () => {
    expect(formatReminderMessage(reminder())).toBe(
      'Rappel : echeance dans 7 jours (15/07/2026) — 340 GBP.',
    )
  })

  it('formate un rappel J-3', () => {
    expect(formatReminderMessage(reminder({ milestone: 'j3' }))).toContain('dans 3 jours')
  })

  it('formate un rappel J-1 au singulier', () => {
    expect(formatReminderMessage(reminder({ milestone: 'j1' }))).toContain('dans 1 jour ')
  })

  it('omet le montant si absent', () => {
    const text = formatReminderMessage(reminder({ amount: undefined, currency: undefined }))
    expect(text).toBe('Rappel : echeance dans 7 jours (15/07/2026).')
  })

  it('omet la devise si absente mais garde le montant', () => {
    const text = formatReminderMessage(reminder({ currency: undefined }))
    expect(text).toBe('Rappel : echeance dans 7 jours (15/07/2026) — 340.')
  })

  it('leve si le payload reminder est absent', () => {
    expect(() => formatReminderMessage(undefined)).toThrow(/sans payload reminder/)
  })
})
