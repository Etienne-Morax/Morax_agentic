import { describe, expect, test } from 'vitest'
import {
  buildScanUploadKey,
  validateScanUpload,
  MAX_SCAN_UPLOAD_BYTES,
  type ScanUploadCandidate,
} from './scan-upload-core.js'

function candidate(overrides: Partial<ScanUploadCandidate> = {}): ScanUploadCandidate {
  return {
    size: 1024,
    type: 'image/jpeg',
    ...overrides,
  }
}

describe('validateScanUpload', () => {
  test('accepts a valid image', () => {
    const result = validateScanUpload(candidate({ type: 'image/jpeg' }))
    expect(result.success).toBe(true)
  })

  test('accepts a valid PDF', () => {
    const result = validateScanUpload(candidate({ type: 'application/pdf' }))
    expect(result.success).toBe(true)
  })

  test('rejects an oversized file', () => {
    const result = validateScanUpload(candidate({ size: MAX_SCAN_UPLOAD_BYTES + 1 }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.message).toMatch(/volumineux/)
    }
  })

  test('rejects a disallowed mime type', () => {
    const result = validateScanUpload(candidate({ type: 'application/zip' }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.message).toMatch(/Format non supporte/)
    }
  })

  test('rejects a missing file', () => {
    const result = validateScanUpload(null)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.message).toMatch(/Aucun fichier/)
    }
  })

  test('rejects an empty file', () => {
    const result = validateScanUpload(candidate({ size: 0 }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.message).toMatch(/Aucun fichier/)
    }
  })
})

describe('buildScanUploadKey', () => {
  test('builds a tenant-scoped R2 key', () => {
    expect(buildScanUploadKey('morax-test', 'doc-1', 'receipt.jpg')).toBe(
      'tenants/morax-test/uploads/doc-1/receipt.jpg',
    )
  })

  test('sanitizes special characters in the filename', () => {
    expect(buildScanUploadKey('morax-test', 'doc-1', 'ma facture (1).pdf')).toBe(
      'tenants/morax-test/uploads/doc-1/ma-facture--1-.pdf',
    )
  })
})
