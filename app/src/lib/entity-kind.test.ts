import { describe, expect, test } from 'vitest'
import { entityKindSpec, SOURCE_ICON } from './entity-kind.js'

describe('entityKindSpec', () => {
  test('returns a spec with icon, label and the three color roles for each kind', () => {
    const kinds = ['document', 'job_run', 'reminder', 'pending_action', 'draft'] as const
    for (const kind of kinds) {
      const spec = entityKindSpec(kind)
      expect(spec.icon).toBeDefined()
      expect(spec.label.length).toBeGreaterThan(0)
      expect(spec.ink).toMatch(/^var\(--kind-/)
      expect(spec.soft).toMatch(/^var\(--kind-/)
      expect(spec.vivid).toMatch(/^var\(--kind-/)
    }
  })

  test('document and draft use distinct color roles', () => {
    expect(entityKindSpec('document').ink).not.toBe(entityKindSpec('draft').ink)
  })
})

describe('SOURCE_ICON', () => {
  test('maps all document sources to an icon component', () => {
    expect(SOURCE_ICON.telegram).toBeDefined()
    expect(SOURCE_ICON.email).toBeDefined()
    expect(SOURCE_ICON.upload).toBeDefined()
  })
})
