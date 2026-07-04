import { describe, expect, it } from 'vitest'
import { validatePushSubscription } from './push-subscribe-core'

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
    ...overrides,
  }
}

describe('validatePushSubscription', () => {
  it('accepte un abonnement PushSubscription.toJSON() valide', () => {
    const result = validatePushSubscription(validInput())
    expect(result).toEqual({
      success: true,
      data: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
        p256dh: 'p256dh-key',
        auth: 'auth-secret',
      },
    })
  })

  it('rejette un endpoint absent ou vide', () => {
    const result = validatePushSubscription(validInput({ endpoint: '' }))
    expect(result.success).toBe(false)
  })

  it('rejette un endpoint qui n\'est pas une URL', () => {
    const result = validatePushSubscription(validInput({ endpoint: 'not-a-url' }))
    expect(result.success).toBe(false)
  })

  it('rejette des keys manquantes', () => {
    const result = validatePushSubscription({ endpoint: 'https://push.example/a' })
    expect(result.success).toBe(false)
  })

  it('rejette p256dh vide', () => {
    const result = validatePushSubscription(validInput({ keys: { p256dh: '', auth: 'a' } }))
    expect(result.success).toBe(false)
  })

  it('rejette auth vide', () => {
    const result = validatePushSubscription(validInput({ keys: { p256dh: 'p', auth: '' } }))
    expect(result.success).toBe(false)
  })
})
