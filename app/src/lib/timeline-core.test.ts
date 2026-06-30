import { describe, expect, test } from 'vitest'
import { buildTimeline, type TimelineSourceRows } from './timeline-core.js'

const EMPTY: TimelineSourceRows = {
  documents: [],
  jobRuns: [],
  reminders: [],
  pendingActions: [],
}

describe('buildTimeline', () => {
  test('returns empty array when no rows', () => {
    // Arrange / Act
    const items = buildTimeline(EMPTY)

    // Assert
    expect(items).toEqual([])
  })

  test('merges all four sources into one list', () => {
    // Arrange
    const rows: TimelineSourceRows = {
      documents: [
        {
          id: 'doc-1',
          source: 'telegram',
          status: 'received',
          needs_human_validation: false,
          created_at: '2026-06-29T10:00:00Z',
        },
      ],
      jobRuns: [
        {
          id: 'job-1',
          type: 'capture_document',
          status: 'done',
          error: null,
          started_at: '2026-06-29T11:00:00Z',
        },
      ],
      reminders: [
        {
          id: 'rem-1',
          document_id: 'doc-1',
          due_date: '2026-07-05',
          amount: 120.5,
          currency: 'GBP',
          status: 'pending',
        },
      ],
      pendingActions: [
        {
          id: 'pa-1',
          action_type: 'send_email',
          status: 'pending',
          requested_at: '2026-06-29T12:00:00Z',
        },
      ],
    }

    // Act
    const items = buildTimeline(rows)

    // Assert
    expect(items).toHaveLength(4)
    expect(items.map((item) => item.kind).sort()).toEqual([
      'document',
      'job_run',
      'pending_action',
      'reminder',
    ])
  })

  test('sorts items by timestamp descending', () => {
    // Arrange
    const rows: TimelineSourceRows = {
      documents: [
        {
          id: 'doc-old',
          source: 'upload',
          status: 'archived',
          needs_human_validation: false,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      jobRuns: [
        {
          id: 'job-recent',
          type: 'draft_invoice',
          status: 'done',
          error: null,
          started_at: '2026-06-30T09:00:00Z',
        },
      ],
      reminders: [],
      pendingActions: [],
    }

    // Act
    const items = buildTimeline(rows)

    // Assert
    expect(items[0]?.id).toBe('job-recent')
    expect(items[1]?.id).toBe('doc-old')
  })

  test('labels unknown job type with raw type as fallback', () => {
    // Arrange
    const rows: TimelineSourceRows = {
      ...EMPTY,
      jobRuns: [
        {
          id: 'job-x',
          type: 'futur_job_type',
          status: 'running',
          error: null,
          started_at: '2026-06-30T09:00:00Z',
        },
      ],
    }

    // Act
    const items = buildTimeline(rows)

    // Assert
    expect(items[0]?.title).toBe('futur_job_type')
  })

  test('surfaces job error in meta when present', () => {
    // Arrange
    const rows: TimelineSourceRows = {
      ...EMPTY,
      jobRuns: [
        {
          id: 'job-err',
          type: 'capture_document',
          status: 'error',
          error: 'timeout LLM',
          started_at: '2026-06-30T09:00:00Z',
        },
      ],
    }

    // Act
    const items = buildTimeline(rows)

    // Assert
    expect(items[0]?.meta).toEqual({ error: 'timeout LLM' })
  })
})
