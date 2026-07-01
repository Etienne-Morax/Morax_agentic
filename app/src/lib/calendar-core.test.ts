import { describe, expect, test } from 'vitest'
import { addMonths, buildCalendarMonth, type CalendarInput } from './calendar-core.js'
import type { ReminderRow } from './timeline-core.js'

function reminder(overrides: Partial<ReminderRow> & Pick<ReminderRow, 'id' | 'due_date'>): ReminderRow {
  return {
    document_id: null,
    amount: 100,
    currency: 'GBP',
    status: 'pending',
    ...overrides,
  }
}

describe('buildCalendarMonth', () => {
  test('produces a 6x7 grid starting on a Monday', () => {
    // Arrange
    const input: CalendarInput = { reminders: [], month: '2026-07', today: '2026-07-01' }

    // Act
    const result = buildCalendarMonth(input)

    // Assert
    expect(result.weeks).toHaveLength(6)
    for (const week of result.weeks) {
      expect(week).toHaveLength(7)
    }
    expect(result.weeks[0]?.[0]?.date).toBe('2026-06-29')
  })

  test('July 2026 (starts on a Wednesday) spills correctly into the first week', () => {
    // Arrange
    const input: CalendarInput = { reminders: [], month: '2026-07', today: '2026-07-01' }

    // Act
    const result = buildCalendarMonth(input)

    // Assert
    const firstWeek = result.weeks[0] ?? []
    expect(firstWeek.map((cell) => cell.inMonth)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
      true,
    ])
    expect(firstWeek[2]?.date).toBe('2026-07-01')
  })

  test('marks the cell matching today', () => {
    // Arrange
    const input: CalendarInput = { reminders: [], month: '2026-07', today: '2026-07-15' }

    // Act
    const result = buildCalendarMonth(input)

    // Assert
    const flatCells = result.weeks.flat()
    const todayCells = flatCells.filter((cell) => cell.isToday)
    expect(todayCells).toHaveLength(1)
    expect(todayCells[0]?.date).toBe('2026-07-15')
  })

  test('buckets reminders into the cell matching their due_date', () => {
    // Arrange
    const input: CalendarInput = {
      reminders: [reminder({ id: 'rem-1', due_date: '2026-07-10' })],
      month: '2026-07',
      today: '2026-07-01',
    }

    // Act
    const result = buildCalendarMonth(input)

    // Assert
    const cell = result.weeks.flat().find((c) => c.date === '2026-07-10')
    expect(cell?.reminders).toHaveLength(1)
    expect(cell?.reminders[0]?.id).toBe('rem-1')
  })

  test('marks a pending reminder in the past as overdue, sorted ascending by due_date', () => {
    // Arrange
    const input: CalendarInput = {
      reminders: [
        reminder({ id: 'rem-late', due_date: '2026-06-20' }),
        reminder({ id: 'rem-earlier', due_date: '2026-06-01' }),
      ],
      month: '2026-07',
      today: '2026-07-01',
    }

    // Act
    const result = buildCalendarMonth(input)

    // Assert
    expect(result.overdue.map((r) => r.id)).toEqual(['rem-earlier', 'rem-late'])
    expect(result.overdue.every((r) => r.isOverdue)).toBe(true)
  })

  test('does not mark paid or dismissed reminders as overdue even if due_date is past', () => {
    // Arrange
    const input: CalendarInput = {
      reminders: [
        reminder({ id: 'rem-paid', due_date: '2026-06-01', status: 'paid' }),
        reminder({ id: 'rem-dismissed', due_date: '2026-06-02', status: 'dismissed' }),
      ],
      month: '2026-07',
      today: '2026-07-01',
    }

    // Act
    const result = buildCalendarMonth(input)

    // Assert
    expect(result.overdue).toEqual([])
  })

  test('does not mark a future pending reminder as overdue', () => {
    // Arrange
    const input: CalendarInput = {
      reminders: [reminder({ id: 'rem-future', due_date: '2026-07-20' })],
      month: '2026-07',
      today: '2026-07-01',
    }

    // Act
    const result = buildCalendarMonth(input)

    // Assert
    expect(result.overdue).toEqual([])
  })

  test('computes prevMonth and nextMonth across a year boundary', () => {
    // Arrange
    const januaryInput: CalendarInput = { reminders: [], month: '2026-01', today: '2026-01-15' }
    const decemberInput: CalendarInput = { reminders: [], month: '2026-12', today: '2026-12-15' }

    // Act
    const january = buildCalendarMonth(januaryInput)
    const december = buildCalendarMonth(decemberInput)

    // Assert
    expect(january.prevMonth).toBe('2025-12')
    expect(january.nextMonth).toBe('2026-02')
    expect(december.prevMonth).toBe('2026-11')
    expect(december.nextMonth).toBe('2027-01')
  })

  test('sizes a leap-year February grid correctly (29 days)', () => {
    // Arrange
    const input: CalendarInput = { reminders: [], month: '2028-02', today: '2028-02-01' }

    // Act
    const result = buildCalendarMonth(input)

    // Assert
    const inMonthCells = result.weeks.flat().filter((cell) => cell.inMonth)
    expect(inMonthCells).toHaveLength(29)
    expect(inMonthCells[0]?.date).toBe('2028-02-01')
    expect(inMonthCells[28]?.date).toBe('2028-02-29')
  })

  test('orders remindersOfMonth with pending first, then by due_date', () => {
    // Arrange
    const input: CalendarInput = {
      reminders: [
        reminder({ id: 'rem-paid', due_date: '2026-07-05', status: 'paid' }),
        reminder({ id: 'rem-pending-late', due_date: '2026-07-20' }),
        reminder({ id: 'rem-pending-early', due_date: '2026-07-03' }),
        reminder({ id: 'rem-other-month', due_date: '2026-08-01' }),
      ],
      month: '2026-07',
      today: '2026-07-01',
    }

    // Act
    const result = buildCalendarMonth(input)

    // Assert
    expect(result.remindersOfMonth.map((r) => r.id)).toEqual([
      'rem-pending-early',
      'rem-pending-late',
      'rem-paid',
    ])
  })

  test('summarizes overdue count and pending/paid counts within the displayed month', () => {
    // Arrange
    const input: CalendarInput = {
      reminders: [
        reminder({ id: 'rem-overdue', due_date: '2026-06-15' }),
        reminder({ id: 'rem-pending-in-month', due_date: '2026-07-10' }),
        reminder({ id: 'rem-paid-in-month', due_date: '2026-07-12', status: 'paid' }),
        reminder({ id: 'rem-pending-other-month', due_date: '2026-08-01' }),
      ],
      month: '2026-07',
      today: '2026-07-01',
    }

    // Act
    const result = buildCalendarMonth(input)

    // Assert
    expect(result.summary).toEqual({ overdueCount: 1, pendingInMonth: 1, paidInMonth: 1 })
  })
})

describe('addMonths', () => {
  test('adds a positive delta within the same year', () => {
    expect(addMonths('2026-03', 2)).toBe('2026-05')
  })

  test('subtracts across a year boundary', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })

  test('adds across a year boundary', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
  })
})
