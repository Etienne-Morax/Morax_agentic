import { describe, expect, test } from 'vitest'
import { activityByDay, buildCockpitStats, dueTone, groupItemsByDay } from './dashboard-core.js'
import type { TimelineItem, TimelineSourceRows } from './timeline-core.js'

const EMPTY_ROWS: TimelineSourceRows = {
  documents: [],
  jobRuns: [],
  reminders: [],
  pendingActions: [],
}

describe('buildCockpitStats', () => {
  test('counts actionable documents, pending reminders, running/errored jobs and pending actions', () => {
    const rows: TimelineSourceRows = {
      documents: [
        { id: '1', source: 'telegram', status: 'received', needs_human_validation: false, created_at: '2026-06-01T00:00:00Z' },
        { id: '2', source: 'email', status: 'validated', needs_human_validation: false, created_at: '2026-06-01T00:00:00Z' },
        { id: '3', source: 'upload', status: 'archived', needs_human_validation: true, created_at: '2026-06-01T00:00:00Z' },
      ],
      jobRuns: [
        { id: 'j1', type: 'capture_document', status: 'running', error: null, started_at: '2026-06-01T00:00:00Z' },
        { id: 'j2', type: 'capture_document', status: 'error', error: 'boom', started_at: '2026-06-01T00:00:00Z' },
        { id: 'j3', type: 'capture_document', status: 'done', error: null, started_at: '2026-06-01T00:00:00Z' },
      ],
      reminders: [
        { id: 'r1', document_id: null, due_date: '2026-06-10', amount: 10, currency: 'GBP', status: 'pending' },
        { id: 'r2', document_id: null, due_date: '2026-06-05', amount: 20, currency: 'GBP', status: 'pending' },
        { id: 'r3', document_id: null, due_date: '2026-06-01', amount: 5, currency: 'GBP', status: 'paid' },
      ],
      pendingActions: [
        { id: 'a1', action_type: 'send_email', status: 'pending', requested_at: '2026-06-01T00:00:00Z' },
        { id: 'a2', action_type: 'expense', status: 'approved', requested_at: '2026-06-01T00:00:00Z' },
      ],
    }

    const stats = buildCockpitStats(rows)

    expect(stats.docsToProcess).toBe(2)
    expect(stats.pendingReminders).toBe(2)
    expect(stats.nextDueDate).toBe('2026-06-05')
    expect(stats.runningJobs).toBe(1)
    expect(stats.erroredJobs).toBe(1)
    expect(stats.pendingActions).toBe(1)
  })

  test('returns zeros and a null next due date for empty rows', () => {
    const stats = buildCockpitStats(EMPTY_ROWS)
    expect(stats).toEqual({
      docsToProcess: 0,
      pendingReminders: 0,
      nextDueDate: null,
      runningJobs: 0,
      erroredJobs: 0,
      pendingActions: 0,
    })
  })
})

describe('activityByDay', () => {
  test('buckets items into a fixed-length histogram, oldest day first', () => {
    const items: TimelineItem[] = [
      { id: '1', kind: 'document', title: 'a', status: 'received', timestamp: '2026-06-10T09:00:00Z' },
      { id: '2', kind: 'document', title: 'b', status: 'received', timestamp: '2026-06-10T14:00:00Z' },
      { id: '3', kind: 'job_run', title: 'c', status: 'done', timestamp: '2026-06-08T00:00:00Z' },
    ]

    const histogram = activityByDay(items, 3, '2026-06-10')

    expect(histogram).toEqual([1, 0, 2])
  })

  test('ignores items outside the requested window', () => {
    const items: TimelineItem[] = [
      { id: '1', kind: 'document', title: 'a', status: 'received', timestamp: '2026-05-01T00:00:00Z' },
    ]

    expect(activityByDay(items, 3, '2026-06-10')).toEqual([0, 0, 0])
  })
})

describe('groupItemsByDay', () => {
  test('groups by calendar day, most recent first, with relative labels', () => {
    const items: TimelineItem[] = [
      { id: '1', kind: 'document', title: 'today-a', status: 'received', timestamp: '2026-06-10T09:00:00Z' },
      { id: '2', kind: 'document', title: 'today-b', status: 'received', timestamp: '2026-06-10T14:00:00Z' },
      { id: '3', kind: 'job_run', title: 'yesterday', status: 'done', timestamp: '2026-06-09T00:00:00Z' },
    ]

    const groups = groupItemsByDay(items, '2026-06-10')

    expect(groups).toHaveLength(2)
    expect(groups[0]?.label).toBe("Aujourd'hui")
    expect(groups[0]?.items).toHaveLength(2)
    expect(groups[1]?.label).toBe('Hier')
  })

  test('returns an empty list for no items', () => {
    expect(groupItemsByDay([], '2026-06-10')).toEqual([])
  })
})

describe('dueTone', () => {
  test('classifies an overdue date as danger', () => {
    expect(dueTone('2026-06-01', '2026-06-10')).toBe('danger')
  })

  test('classifies a date within 7 days as warning', () => {
    expect(dueTone('2026-06-15', '2026-06-10')).toBe('warning')
  })

  test('classifies a far-future date as neutral', () => {
    expect(dueTone('2026-07-01', '2026-06-10')).toBe('neutral')
  })

  test('classifies today as warning', () => {
    expect(dueTone('2026-06-10', '2026-06-10')).toBe('warning')
  })
})
