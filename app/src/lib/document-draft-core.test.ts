import { describe, expect, test } from 'vitest'
import { computeDraftTotals, validateDraft } from './document-draft-core.js'

describe('computeDraftTotals', () => {
  test('returns zero totals for an empty line item list', () => {
    // Arrange
    const lineItems: never[] = []

    // Act
    const totals = computeDraftTotals(lineItems, 20)

    // Assert
    expect(totals).toEqual({ subtotal: 0, vatAmount: 0, total: 0 })
  })

  test('sums subtotal across multiple line items', () => {
    // Arrange
    const lineItems = [
      { description: 'Consulting', quantity: 2, unitPrice: 100 },
      { description: 'Support', quantity: 1, unitPrice: 50 },
    ]

    // Act
    const totals = computeDraftTotals(lineItems, 0)

    // Assert
    expect(totals.subtotal).toBe(250)
  })

  test('computes VAT amount at the given rate', () => {
    // Arrange
    const lineItems = [{ description: 'Item', quantity: 1, unitPrice: 100 }]

    // Act
    const totals = computeDraftTotals(lineItems, 20)

    // Assert
    expect(totals.vatAmount).toBe(20)
    expect(totals.total).toBe(120)
  })

  test('rounds monetary values to 2 decimals', () => {
    // Arrange
    const lineItems = [{ description: 'Item', quantity: 1, unitPrice: 33.333 }]

    // Act
    const totals = computeDraftTotals(lineItems, 0)

    // Assert
    expect(totals.subtotal).toBe(33.33)
  })

  test('supports a zero VAT rate', () => {
    // Arrange
    const lineItems = [{ description: 'Item', quantity: 1, unitPrice: 100 }]

    // Act
    const totals = computeDraftTotals(lineItems, 0)

    // Assert
    expect(totals.vatAmount).toBe(0)
    expect(totals.total).toBe(100)
  })
})

describe('validateDraft', () => {
  test('accepts a fully valid quote input', () => {
    // Arrange
    const input = {
      kind: 'quote',
      docNumber: 'Q-001',
      clientName: 'Acme Ltd',
      currency: 'GBP',
      vatRate: '20',
      lineItems: [{ description: 'Item', quantity: '2', unitPrice: '10' }],
    }

    // Act
    const result = validateDraft(input)

    // Assert
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.kind).toBe('quote')
      expect(result.data.vatRate).toBe(20)
      expect(result.data.lineItems).toEqual([{ description: 'Item', quantity: 2, unitPrice: 10 }])
    }
  })

  test('defaults line items to an empty array when absent', () => {
    // Arrange
    const input = { kind: 'invoice', vatRate: '20' }

    // Act
    const result = validateDraft(input)

    // Assert
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.lineItems).toEqual([])
    }
  })

  test('rejects an invalid kind', () => {
    // Arrange
    const input = { kind: 'receipt', vatRate: '20', lineItems: [] }

    // Act
    const result = validateDraft(input)

    // Assert
    expect(result.success).toBe(false)
  })

  test('rejects a negative line item quantity', () => {
    // Arrange
    const input = {
      kind: 'quote',
      vatRate: '20',
      lineItems: [{ description: 'Item', quantity: '-1', unitPrice: '10' }],
    }

    // Act
    const result = validateDraft(input)

    // Assert
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(Object.keys(result.errors).some((key) => key.includes('quantity'))).toBe(true)
    }
  })

  test('rejects a negative unit price', () => {
    // Arrange
    const input = {
      kind: 'quote',
      vatRate: '20',
      lineItems: [{ description: 'Item', quantity: '1', unitPrice: '-10' }],
    }

    // Act
    const result = validateDraft(input)

    // Assert
    expect(result.success).toBe(false)
  })

  test('rejects a VAT rate above 100', () => {
    // Arrange
    const input = { kind: 'quote', vatRate: '150', lineItems: [] }

    // Act
    const result = validateDraft(input)

    // Assert
    expect(result.success).toBe(false)
  })

  test('treats an empty client name as absent, not an error', () => {
    // Arrange
    const input = { kind: 'quote', clientName: '', vatRate: '20', lineItems: [] }

    // Act
    const result = validateDraft(input)

    // Assert
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.clientName).toBeUndefined()
    }
  })

  test('rejects a line item missing a description', () => {
    // Arrange
    const input = {
      kind: 'quote',
      vatRate: '20',
      lineItems: [{ description: '', quantity: '1', unitPrice: '10' }],
    }

    // Act
    const result = validateDraft(input)

    // Assert
    expect(result.success).toBe(false)
  })

  test('accepts a valid client email', () => {
    // Arrange
    const input = { kind: 'quote', clientEmail: 'client@x.com', vatRate: '20', lineItems: [] }

    // Act
    const result = validateDraft(input)

    // Assert
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.clientEmail).toBe('client@x.com')
    }
  })

  test('rejects an invalid client email', () => {
    // Arrange
    const input = { kind: 'quote', clientEmail: 'not-an-email', vatRate: '20', lineItems: [] }

    // Act
    const result = validateDraft(input)

    // Assert
    expect(result.success).toBe(false)
  })

  test('treats an empty client email as absent, not an error', () => {
    // Arrange
    const input = { kind: 'quote', clientEmail: '', vatRate: '20', lineItems: [] }

    // Act
    const result = validateDraft(input)

    // Assert
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.clientEmail).toBeUndefined()
    }
  })
})
