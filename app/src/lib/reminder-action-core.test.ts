import { describe, expect, test } from 'vitest'
import { validateReminderStatusInput } from './reminder-action-core.js'

const VALID_ID = '11111111-1111-4111-8111-111111111111'

describe('validateReminderStatusInput', () => {
  test.each(['paid', 'dismissed', 'pending'] as const)(
    'accepts a valid target status: %s',
    (status) => {
      // Arrange
      const input = { reminderId: VALID_ID, status }

      // Act
      const result = validateReminderStatusInput(input)

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ reminderId: VALID_ID, status })
      }
    },
  )

  test('rejects an unknown status', () => {
    // Arrange
    const input = { reminderId: VALID_ID, status: 'archived' }

    // Act
    const result = validateReminderStatusInput(input)

    // Assert
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.status).toBeDefined()
    }
  })

  test('rejects a missing reminderId', () => {
    // Arrange
    const input = { reminderId: '', status: 'paid' }

    // Act
    const result = validateReminderStatusInput(input)

    // Assert
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.reminderId).toBeDefined()
    }
  })

  test('rejects a reminderId that is not a UUID', () => {
    // Arrange
    const input = { reminderId: 'not-a-uuid', status: 'paid' }

    // Act
    const result = validateReminderStatusInput(input)

    // Assert
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.reminderId).toBeDefined()
    }
  })
})
