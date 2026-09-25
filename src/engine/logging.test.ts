import { describe, expect, test } from 'vitest'
import { MAX_PERIOD_DAYS, isSpottingOnly, spottingPatch, planBleedingReport, planPeriodRemoval, planPeriodRun } from './logging'
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

/** Apply a plan to a set of logs, as the repository would. */
const apply = (logs: DayLog[], writes: { date: IsoDate; patch: Partial<DayLog> }[]): DayLog[] => {
  const byDate = new Map(logs.map((l) => [l.logDate, { ...l }]))
  for (const { date, patch } of writes) {
    byDate.set(date, { ...(byDate.get(date) ?? aLog(date)), ...patch })
  }
  return [...byDate.values()].sort((a, b) => a.logDate.localeCompare(b.logDate))
}

const invariantsHold = (logs: DayLog[], cycleStart: IsoDate) => {
  expect(logs.filter((l) => l.isPeriodStart).map((l) => l.logDate)).toEqual([cycleStart])
  expect(logs.some((l) => l.isPeriod && l.noBleed)).toBe(false)
}

describe('planBleedingReport', () => {
  // The screenshot case: an older start-only log, then day 5 is tapped.
  const startOnly = [aPeriodStart('2026-09-20')]

  test('yes on day 5 fills days 2-4 and never adds a start', () => {
    const after = apply(startOnly, planBleedingReport(startOnly, '2026-09-20', '2026-09-24', true, 'light'))
    expect(after.filter((l) => l.isPeriod).map((l) => l.logDate)).toEqual([
      '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24',
    ])
    expect(after.find((l) => l.logDate === '2026-09-24')?.flow).toBe('light')
    expect(after.some((l) => l.isPeriodEnd)).toBe(false)
    invariantsHold(after, '2026-09-20')
  })

  test('no on day 5 confirms day 4 as the last day', () => {
    const after = apply(startOnly, planBleedingReport(startOnly, '2026-09-20', '2026-09-24', false))
    expect(after.filter((l) => l.isPeriod).map((l) => l.logDate)).toEqual([
      '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23',
    ])
    expect(after.find((l) => l.logDate === '2026-09-23')?.isPeriodEnd).toBe(true)
    expect(after.find((l) => l.logDate === '2026-09-24')?.noBleed).toBe(true)
    invariantsHold(after, '2026-09-20')
  })

  test('no on day 3 of a booked 5-day period trims the rest', () => {
    const booked = apply([], planPeriodRun([], '2026-09-20', 5))
    const after = apply(booked, planBleedingReport(booked, '2026-09-20', '2026-09-22', false))
    expect(after.filter((l) => l.isPeriod).map((l) => l.logDate)).toEqual(['2026-09-20', '2026-09-21'])
    expect(after.filter((l) => l.isPeriodEnd).map((l) => l.logDate)).toEqual(['2026-09-21'])
    invariantsHold(after, '2026-09-20')
  })

  test('yes past a booked end extends the period and unconfirms the end', () => {
    const booked = apply([], planPeriodRun([], '2026-09-20', 5))
    const after = apply(booked, planBleedingReport(booked, '2026-09-20', '2026-09-25', true, 'light'))
    expect(after.filter((l) => l.isPeriod)).toHaveLength(6)
    expect(after.some((l) => l.isPeriodEnd)).toBe(false)
    invariantsHold(after, '2026-09-20')
  })

  test('yes inside a booked period keeps its end', () => {
    const booked = apply([], planPeriodRun([], '2026-09-20', 5))
    const after = apply(booked, planBleedingReport(booked, '2026-09-20', '2026-09-22', true, 'heavy'))
    expect(after.filter((l) => l.isPeriodEnd).map((l) => l.logDate)).toEqual(['2026-09-24'])
    expect(after.find((l) => l.logDate === '2026-09-22')?.flow).toBe('heavy')
  })

  test('a later Yes overrides an earlier No on the same day', () => {
    const saidNo = apply(startOnly, planBleedingReport(startOnly, '2026-09-20', '2026-09-24', false))
    const after = apply(saidNo, planBleedingReport(saidNo, '2026-09-20', '2026-09-24', true, 'light'))
    const day = after.find((l) => l.logDate === '2026-09-24')
    expect(day).toMatchObject({ isPeriod: true, noBleed: false })
    expect(after.some((l) => l.isPeriodEnd)).toBe(false)
    invariantsHold(after, '2026-09-20')
  })

  test('yes fill leaves an explicit not-bleeding day alone', () => {
    const logs = [aPeriodStart('2026-09-20'), aLog('2026-09-22', { noBleed: true })]
    const after = apply(logs, planBleedingReport(logs, '2026-09-20', '2026-09-24', true))
    expect(after.find((l) => l.logDate === '2026-09-22')).toMatchObject({ isPeriod: false, noBleed: true })
    invariantsHold(after, '2026-09-20')
  })

  test('a second No after a No only records the day', () => {
    const logs = [aPeriodStart('2026-09-20', { isPeriodEnd: true }), aLog('2026-09-21', { noBleed: true })]
    const writes = planBleedingReport(logs, '2026-09-20', '2026-09-22', false)
    expect(writes.map((w) => w.date)).toEqual(['2026-09-22'])
  })

  test('does nothing on the start day itself', () => {
    expect(planBleedingReport(startOnly, '2026-09-20', '2026-09-20', false)).toEqual([])
  })

  test('refuses a yes beyond the longest period the app records', () => {
    // Cycle day 16 from a 20 Sep start is 5 Oct.
    expect(planBleedingReport(startOnly, '2026-09-20', '2026-10-05', true)).toEqual([])
  })

  test('accepts a yes on the last allowed day and a no the day after', () => {
    expect(planBleedingReport(startOnly, '2026-09-20', '2026-10-04', true)).not.toEqual([])
    expect(planBleedingReport(startOnly, '2026-09-20', '2026-10-05', false)).not.toEqual([])
    expect(planBleedingReport(startOnly, '2026-09-20', '2026-10-06', false)).toEqual([])
  })
})

describe('spotting', () => {
  test('is a spotting flow on a day that is not a period day', () => {
    expect(isSpottingOnly(aLog('2026-09-10', { flow: 'spotting' }))).toBe(true)
    expect(isSpottingOnly(aPeriodDay('2026-09-10', { flow: 'spotting' }))).toBe(false)
    expect(isSpottingOnly(aLog('2026-09-10'))).toBe(false)
    expect(isSpottingOnly(null)).toBe(false)
  })

  test('marking it never makes the day a period day or a start', () => {
    expect(spottingPatch(true)).toMatchObject({
      isPeriod: false,
      isPeriodStart: false,
      isPeriodEnd: false,
      flow: 'spotting',
      noBleed: true,
    })
  })

  test('clearing it leaves the day unreported', () => {
    expect(spottingPatch(false)).toEqual({ flow: null, noBleed: false })
  })

  test('a spotting day is not filled in as a period day by a later yes', () => {
    const logs = [aPeriodStart('2026-09-20'), aLog('2026-09-22', spottingPatch(true))]
    const writes = planBleedingReport(logs, '2026-09-20', '2026-09-24', true)
    expect(writes.some((w) => w.date === '2026-09-22')).toBe(false)
  })
})
