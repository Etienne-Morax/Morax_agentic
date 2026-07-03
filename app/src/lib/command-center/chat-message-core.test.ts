import { describe, expect, test } from 'vitest'
import { mapCommandMessageRow } from './chat-message-core.js'

describe('mapCommandMessageRow', () => {
  test('maps a user row to a ChatMessage with content/createdAt fields', () => {
    const row = {
      id: 'msg-1',
      role: 'user' as const,
      body: 'Relance les impayes',
      created_at: '2026-07-03T08:03:10Z',
    }

    expect(mapCommandMessageRow(row)).toEqual({
      id: 'msg-1',
      role: 'user',
      content: 'Relance les impayes',
      createdAt: '2026-07-03T08:03:10Z',
    })
  })

  test('maps an agent row and preserves role', () => {
    const row = {
      id: 'msg-2',
      role: 'agent' as const,
      body: "Recu, je m'en occupe.",
      created_at: '2026-07-03T08:03:25Z',
    }

    const result = mapCommandMessageRow(row)

    expect(result.role).toBe('agent')
    expect(result.content).toBe(row.body)
  })
})
