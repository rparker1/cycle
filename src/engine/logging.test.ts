import { describe, expect, test } from 'vitest'
import { MAX_PERIOD_DAYS, planPeriodRemoval, planPeriodRun } from './logging'
import { aLog, aPeriodDay, aPeriodStart } from './__testutils__/fixtures'
import type { DayLog, IsoDate } from './types'

/** Compact view of a plan: date -> the flags it sets. */
const summarise = (writes: { date: IsoDate; patch: Partial<DayLog> }[]) =>
  writes.map((w) => ({
    date: w.date,
    period: w.patch.isPeriod,
    start: w.patch.isPeriodStart,
    end: w.patch.isPeriodEnd,
  }))

describe('planPeriodRun', () => {
  test('books the requested number of consecutive days', () => {
    const writes = planPeriodRun([], '2026-09-20', 5)

    expect(writes.map((w) => w.date)).toEqual([
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
    ])
    expect(writes.every((w) => w.patch.isPeriod === true)).toBe(true)
  })

  test('marks only the first day as the start', () => {
    const writes = planPeriodRun([], '2026-09-20', 3)

    expect(summarise(writes)).toEqual([
      { date: '2026-09-20', period: true, start: true, end: false },
      { date: '2026-09-21', period: true, start: false, end: false },
      { date: '2026-09-22', period: true, start: false, end: true },
    ])
  })

  test('a one-day period is both the start and the end', () => {
    const writes = planPeriodRun([], '2026-09-20', 1)

    expect(summarise(writes)).toEqual([
      { date: '2026-09-20', period: true, start: true, end: true },
    ])
  })

  test('clamps a nonsensical length rather than writing hundreds of days', () => {
    expect(planPeriodRun([], '2026-09-20', 400)).toHaveLength(MAX_PERIOD_DAYS)
    expect(planPeriodRun([], '2026-09-20', 0)).toHaveLength(1)
    expect(planPeriodRun([], '2026-09-20', -3)).toHaveLength(1)
  })

  test('does not set a flow when the day already has one', () => {
    const logs = [aPeriodStart('2026-09-20', { flow: 'heavy' })]
    const writes = planPeriodRun(logs, '2026-09-20', 2)

    expect(writes[0]?.patch.flow).toBeUndefined()
    expect(writes[1]?.patch.flow).toBe('medium')
  })

  // A stray start inside the run would carve a two-day "cycle" out of one
  // period, which is exactly what poisons the baseline.
  test('clears a stray period start inside the run', () => {
    const logs = [aPeriodStart('2026-09-22')]
    const writes = planPeriodRun(logs, '2026-09-20', 5)

    const stray = writes.find((w) => w.date === '2026-09-22')
    expect(stray?.patch.isPeriodStart).toBe(false)
  })

  test('clears a mis-tapped start just after the run', () => {
    const logs = [aPeriodStart('2026-09-26')]
    const writes = planPeriodRun(logs, '2026-09-20', 5)

    expect(writes.find((w) => w.date === '2026-09-26')?.patch.isPeriodStart).toBe(false)
  })

  test('leaves a genuine later period alone', () => {
    const logs = [aPeriodStart('2026-10-18')]
    const writes = planPeriodRun(logs, '2026-09-20', 5)

    expect(writes.some((w) => w.date === '2026-10-18')).toBe(false)
  })

  test('shortening a period clears the days that fall away', () => {
    const logs = [
      aPeriodStart('2026-09-20'),
      aPeriodDay('2026-09-21'),
      aPeriodDay('2026-09-22'),
      aPeriodDay('2026-09-23'),
      aPeriodDay('2026-09-24', { isPeriodEnd: true }),
    ]
    const writes = planPeriodRun(logs, '2026-09-20', 3)

    expect(writes.find((w) => w.date === '2026-09-23')?.patch.isPeriod).toBe(false)
    expect(writes.find((w) => w.date === '2026-09-24')?.patch.isPeriod).toBe(false)
    expect(writes.find((w) => w.date === '2026-09-22')?.patch.isPeriodEnd).toBe(true)
  })

  test('lengthening a period adds the extra days', () => {
    const logs = [aPeriodStart('2026-09-20'), aPeriodDay('2026-09-21', { isPeriodEnd: true })]
    const writes = planPeriodRun(logs, '2026-09-20', 4)

    expect(writes.map((w) => w.date)).toContain('2026-09-23')
    expect(writes.find((w) => w.date === '2026-09-21')?.patch.isPeriodEnd).toBe(false)
    expect(writes.find((w) => w.date === '2026-09-23')?.patch.isPeriodEnd).toBe(true)
  })

  test('does not disturb an unrelated logged symptom day', () => {
    const logs = [aLog('2026-09-30', { symptoms: ['Cramps'] })]
    const writes = planPeriodRun(logs, '2026-09-20', 5)

    expect(writes.some((w) => w.date === '2026-09-30')).toBe(false)
  })

  test('clears a not-yet answer on every day it books', () => {
    const logs = [aLog('2026-09-24', { noBleed: true })]
    const writes = planPeriodRun(logs, '2026-09-24', 3)
    expect(writes.filter((w) => w.patch.isPeriod === true).every((w) => w.patch.noBleed === false))
      .toBe(true)
  })
})

describe('planPeriodRemoval', () => {
  test('clears every day of the logged run', () => {
    const logs = [
      aPeriodStart('2026-09-20'),
      aPeriodDay('2026-09-21'),
      aPeriodDay('2026-09-22', { isPeriodEnd: true }),
    ]
    const writes = planPeriodRemoval(logs, '2026-09-20')

    expect(writes.map((w) => w.date)).toEqual(['2026-09-20', '2026-09-21', '2026-09-22'])
    expect(writes.every((w) => w.patch.isPeriod === false)).toBe(true)
    expect(writes.every((w) => w.patch.isPeriodStart === false)).toBe(true)
  })

  test('stops at a gap rather than clearing the next period too', () => {
    const logs = [
      aPeriodStart('2026-09-20'),
      aPeriodDay('2026-09-21'),
      aPeriodStart('2026-10-18'),
    ]
    const writes = planPeriodRemoval(logs, '2026-09-20')

    expect(writes.map((w) => w.date)).toEqual(['2026-09-20', '2026-09-21'])
  })

  test('returns nothing when the date is not a period day', () => {
    expect(planPeriodRemoval([], '2026-09-20')).toEqual([])
  })
})
