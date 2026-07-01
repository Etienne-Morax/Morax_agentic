import { describe, expect, test } from 'vitest'
import {
  buildPdfKey,
  buildSendEmailPayload,
  validateFinalizeDraft,
  type FinalizeCheckInput,
} from './finalize-draft-core.js'

function input(overrides: Partial<FinalizeCheckInput> = {}): FinalizeCheckInput {
  return {
    status: 'draft',
    kind: 'invoice',
    docNumber: 'INV-001',
    clientEmail: 'client@x.com',
    lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100 }],
    ...overrides,
  }
}

describe('validateFinalizeDraft', () => {
  test('accepts a valid finalizable draft', () => {
    const result = validateFinalizeDraft(input())
    expect(result.success).toBe(true)
  })

  test('rejects a draft that is not in draft status', () => {
    const result = validateFinalizeDraft(input({ status: 'finalized' }))
    expect(result.success).toBe(false)
  })

  test('rejects a draft without a doc number', () => {
    const result = validateFinalizeDraft(input({ docNumber: undefined }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.form).toMatch(/Numero de document requis/)
    }
  })

  test('rejects a draft without a client email', () => {
    const result = validateFinalizeDraft(input({ clientEmail: undefined }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.form).toMatch(/Email client requis/)
    }
  })

  test('rejects an invalid client email', () => {
    const result = validateFinalizeDraft(input({ clientEmail: 'not-an-email' }))
    expect(result.success).toBe(false)
  })

  test('rejects a draft with no line items', () => {
    const result = validateFinalizeDraft(input({ lineItems: [] }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.form).toMatch(/Au moins une ligne requise/)
    }
  })
})

describe('buildPdfKey', () => {
  test('builds a tenant-scoped R2 key sanitized from the doc number', () => {
    expect(buildPdfKey('morax-test', 'draft-1', 'INV-001')).toBe(
      'tenants/morax-test/drafts/draft-1/INV-001.pdf',
    )
  })

  test('sanitizes special characters in the doc number', () => {
    expect(buildPdfKey('morax-test', 'draft-1', 'INV/2026 #01')).toBe(
      'tenants/morax-test/drafts/draft-1/INV-2026--01.pdf',
    )
  })
})

describe('buildSendEmailPayload', () => {
  test('builds the pending_actions payload with the computed total', () => {
    const payload = buildSendEmailPayload({
      draftId: 'draft-1',
      kind: 'invoice',
      docNumber: 'INV-001',
      clientEmail: 'client@x.com',
      pdfKey: 'tenants/morax-test/drafts/draft-1/INV-001.pdf',
      currency: 'GBP',
      lineItems: [{ description: 'Item', quantity: 2, unitPrice: 50 }],
      vatRate: 20,
    })

    expect(payload).toEqual({
      draft_id: 'draft-1',
      kind: 'invoice',
      doc_number: 'INV-001',
      client_email: 'client@x.com',
      pdf_key: 'tenants/morax-test/drafts/draft-1/INV-001.pdf',
      total: 120,
      currency: 'GBP',
    })
  })
})
