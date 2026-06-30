import { describe, expect, test } from 'vitest'
import { buildExtractedPatch, validateExtracted } from './document-edit-core.js'

describe('validateExtracted', () => {
  test('accepts a fully valid input and coerces montant to a number', () => {
    // Arrange
    const input = {
      montant: '149.99',
      devise: 'GBP',
      date_emission: '2026-06-01',
      date_echeance: '2026-07-01',
      emetteur: 'Acme Ltd',
      destinataire: 'Etienne',
      numero_document: 'INV-042',
    }

    // Act
    const result = validateExtracted(input)

    // Assert
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.montant).toBe(149.99)
      expect(result.data.devise).toBe('GBP')
    }
  })

  test('treats empty strings as absent fields, not as errors', () => {
    // Arrange
    const input = { montant: '', devise: '', date_emission: '', emetteur: 'Acme Ltd' }

    // Act
    const result = validateExtracted(input)

    // Assert
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.montant).toBeUndefined()
      expect(result.data.emetteur).toBe('Acme Ltd')
    }
  })

  test('rejects a negative montant', () => {
    // Arrange
    const input = { montant: '-10' }

    // Act
    const result = validateExtracted(input)

    // Assert
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.montant).toBeDefined()
    }
  })

  test('rejects a non-numeric montant', () => {
    // Arrange
    const input = { montant: 'abc' }

    // Act
    const result = validateExtracted(input)

    // Assert
    expect(result.success).toBe(false)
  })

  test('rejects a date not in ISO format', () => {
    // Arrange
    const input = { date_echeance: '01/07/2026' }

    // Act
    const result = validateExtracted(input)

    // Assert
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.date_echeance).toBeDefined()
    }
  })

  test('rejects a currency code that is not 3 letters', () => {
    // Arrange
    const input = { devise: 'POUNDS' }

    // Act
    const result = validateExtracted(input)

    // Assert
    expect(result.success).toBe(false)
  })
})

describe('buildExtractedPatch', () => {
  test('merges validated fields onto current without mutating current', () => {
    // Arrange
    const current = { montant: 100, emetteur: 'Old Co' }
    const validated = { montant: 200 }

    // Act
    const patched = buildExtractedPatch(current, validated)

    // Assert
    expect(patched).toEqual({ montant: 200, emetteur: 'Old Co' })
    expect(current).toEqual({ montant: 100, emetteur: 'Old Co' })
  })

  test('clears a field when the validated value is undefined', () => {
    // Arrange
    const current = { montant: 100, emetteur: 'Old Co' }
    const validated = { emetteur: undefined }

    // Act
    const patched = buildExtractedPatch(current, validated)

    // Assert
    expect(patched.emetteur).toBeUndefined()
    expect(JSON.parse(JSON.stringify(patched))).toEqual({ montant: 100 })
  })
})
