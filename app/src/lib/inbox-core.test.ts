import { describe, expect, test } from 'vitest'
import { buildInbox, type InboxRows } from './inbox-core.js'

const EMPTY: InboxRows = { documents: [], reminders: [] }

describe('buildInbox', () => {
  test('returns empty lists when no rows', () => {
    // Arrange / Act
    const view = buildInbox(EMPTY)

    // Assert
    expect(view).toEqual({ documents: [], reminders: [] })
  })

  test('keeps documents with an actionable status', () => {
    // Arrange
    const rows: InboxRows = {
      documents: [
        {
          id: 'd1',
          source: 'telegram',
          status: 'received',
          needs_human_validation: false,
          created_at: '2026-06-29T10:00:00Z',
        },
        {
          id: 'd2',
          source: 'upload',
          status: 'archived',
          needs_human_validation: false,
          created_at: '2026-06-29T11:00:00Z',
        },
      ],
      reminders: [],
    }

    // Act
    const view = buildInbox(rows)

    // Assert
    expect(view.documents.map((d) => d.id)).toEqual(['d1'])
  })

  test('keeps validated documents that still need human validation', () => {
    // Arrange
    const rows: InboxRows = {
      documents: [
        {
          id: 'd1',
          source: 'email',
          status: 'validated',
          needs_human_validation: true,
          created_at: '2026-06-29T10:00:00Z',
        },
      ],
      reminders: [],
    }

    // Act
    const view = buildInbox(rows)

    // Assert
    expect(view.documents.map((d) => d.id)).toEqual(['d1'])
  })

  test('excludes archived documents that do not need validation', () => {
    // Arrange
    const rows: InboxRows = {
      documents: [
        {
          id: 'd1',
          source: 'upload',
          status: 'archived',
          needs_human_validation: false,
          created_at: '2026-06-29T10:00:00Z',
        },
      ],
      reminders: [],
    }

    // Act
    const view = buildInbox(rows)

    // Assert
    expect(view.documents).toEqual([])
  })

  test('keeps only pending reminders, sorted by closest due date first', () => {
    // Arrange
    const rows: InboxRows = {
      documents: [],
      reminders: [
        {
          id: 'r1',
          document_id: null,
          due_date: '2026-07-20',
          amount: 50,
          currency: 'GBP',
          status: 'pending',
        },
        {
          id: 'r2',
          document_id: null,
          due_date: '2026-07-05',
          amount: 200,
          currency: 'GBP',
          status: 'pending',
        },
        {
          id: 'r3',
          document_id: null,
          due_date: '2026-07-01',
          amount: 10,
          currency: 'GBP',
          status: 'paid',
        },
      ],
    }

    // Act
    const view = buildInbox(rows)

    // Assert
    expect(view.reminders.map((r) => r.id)).toEqual(['r2', 'r1'])
  })
})
