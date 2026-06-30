import { describe, expect, test } from 'vitest'
import { statusTone } from './status-tone.js'

describe('statusTone', () => {
  test('maps known document status to its tone', () => {
    expect(statusTone('document', 'validated')).toBe('success')
    expect(statusTone('document', 'incomplete')).toBe('warning')
  })

  test('maps known job_run status to its tone', () => {
    expect(statusTone('job_run', 'error')).toBe('danger')
    expect(statusTone('job_run', 'done')).toBe('success')
  })

  test('maps known pending_action status to its tone', () => {
    expect(statusTone('pending_action', 'rejected')).toBe('danger')
  })

  test('falls back to neutral for unknown status', () => {
    expect(statusTone('reminder', 'unknown_status')).toBe('neutral')
  })
})
