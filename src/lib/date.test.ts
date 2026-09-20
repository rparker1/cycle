import { describe, expect, test } from 'vitest'
import { addDays, diffDays, isoToParts, maxIso, minIso, parseIso, toIso } from './date'

describe('addDays', () => {
  test('adds days within a month', () => {
    expect(addDays('2026-09-20', 5)).toBe('2026-09-25')
  })

  test('rolls over a month boundary', () => {
    expect(addDays('2026-09-28', 5)).toBe('2026-10-03')
  })

  test('rolls over a year boundary', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })

  test('subtracts with a negative count', () => {
    expect(addDays('2026-10-03', -5)).toBe('2026-09-28')
  })

  test('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  // The bug this guards: doing date maths through UTC timestamps shifts the
  // result by a day when the local zone crosses a DST boundary.
  test('does not shift across the spring DST boundary', () => {
    // UK clocks go forward on 2026-03-29.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
  })

  test('does not shift across the autumn DST boundary', () => {
    // UK clocks go back on 2026-10-25.
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
  })
})

describe('diffDays', () => {
  test('counts days between two dates', () => {
    expect(diffDays('2026-09-20', '2026-09-25')).toBe(5)
  })

  test('is negative when the second date is earlier', () => {
    expect(diffDays('2026-09-25', '2026-09-20')).toBe(-5)
  })

  test('is zero for the same date', () => {
    expect(diffDays('2026-09-20', '2026-09-20')).toBe(0)
  })

  test('counts across a DST boundary without losing a day', () => {
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2)
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2)
  })

  test('counts a full common year', () => {
    expect(diffDays('2026-01-01', '2027-01-01')).toBe(365)
  })
})

describe('parseIso and toIso', () => {
  test('round-trips a date through a local Date object', () => {
    expect(toIso(parseIso('2026-09-20'))).toBe('2026-09-20')
  })

  test('parses to local midnight, not UTC midnight', () => {
    const d = parseIso('2026-09-20')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(8)
    expect(d.getDate()).toBe(20)
    expect(d.getHours()).toBe(0)
  })

  test('formats a late-evening Date to its local calendar day', () => {
    const lateEvening = new Date(2026, 8, 20, 23, 30, 0)
    expect(toIso(lateEvening)).toBe('2026-09-20')
  })
})

describe('isoToParts', () => {
  test('splits a date into numeric parts', () => {
    expect(isoToParts('2026-09-20')).toEqual({ year: 2026, month: 9, day: 20 })
  })
})

describe('minIso and maxIso', () => {
  test('orders dates lexically, which is also chronologically', () => {
    expect(minIso('2026-10-03', '2026-09-28')).toBe('2026-09-28')
    expect(maxIso('2026-10-03', '2026-09-28')).toBe('2026-10-03')
  })
})
