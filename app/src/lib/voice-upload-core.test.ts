import { describe, expect, test } from 'vitest'
import {
  buildVoiceUploadKey,
  validateVoiceUpload,
  MAX_VOICE_UPLOAD_BYTES,
  type VoiceUploadCandidate,
} from './voice-upload-core.js'

function candidate(overrides: Partial<VoiceUploadCandidate> = {}): VoiceUploadCandidate {
  return {
    size: 1024,
    type: 'audio/wav',
    ...overrides,
  }
}

describe('validateVoiceUpload', () => {
  test('accepts a valid wav recording', () => {
    const result = validateVoiceUpload(candidate())
    expect(result.success).toBe(true)
  })

  test('rejects an oversized file', () => {
    const result = validateVoiceUpload(candidate({ size: MAX_VOICE_UPLOAD_BYTES + 1 }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.message).toMatch(/trop long/)
    }
  })

  test('rejects a disallowed mime type (e.g. raw webm)', () => {
    const result = validateVoiceUpload(candidate({ type: 'audio/webm' }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.message).toMatch(/Format audio non supporte/)
    }
  })

  test('rejects a missing file', () => {
    const result = validateVoiceUpload(null)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.message).toMatch(/Aucun message vocal/)
    }
  })

  test('rejects an empty file', () => {
    const result = validateVoiceUpload(candidate({ size: 0 }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.message).toMatch(/Aucun message vocal/)
    }
  })
})

describe('buildVoiceUploadKey', () => {
  test('builds a tenant-scoped R2 key', () => {
    expect(buildVoiceUploadKey('morax-test', 'v1', 'message.wav')).toBe(
      'tenants/morax-test/voice/v1/message.wav',
    )
  })

  test('sanitizes special characters in the filename', () => {
    expect(buildVoiceUploadKey('morax-test', 'v1', 'note (1).wav')).toBe(
      'tenants/morax-test/voice/v1/note--1-.wav',
    )
  })
})
