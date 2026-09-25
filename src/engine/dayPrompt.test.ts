import { describe, expect, test } from 'vitest'
import { dayPrompt } from './dayPrompt'
import { createEngine } from './predict'
import { aLog, aPeriodDay, aPeriodStart, aProfile, periodStarts } from './__testutils__/fixtures'
import type { DayLog } from './types'

const engineFor = (logs: DayLog[], today: string) =>
  createEngine({ today, logs, resolutions: [], profile: aProfile({ avgPeriodLength: 5 }) })

describe('dayPrompt — the screenshot case', () => {
  // Start-only log on 20 Sep, today 24 Sep (cycle day 5).
  const engine = engineFor([aPeriodStart('2026-09-20')], '2026-09-24')

  test('asks about bleeding on day 5, not about a new start', () => {
    expect(dayPrompt('2026-09-24', '2026-09-24', engine)).toBe('bleeding')
  })

  test('asks nothing on the start day itself', () => {
    expect(dayPrompt('2026-09-20', '2026-09-24', engine)).toBe('none')
  })

  test('asks nothing about the future', () => {
    expect(dayPrompt('2026-09-25', '2026-09-24', engine)).toBe('none')
  })
})

describe('dayPrompt — zones', () => {
  test('asks about bleeding on the day after the period end', () => {
    // Assumed end is day 5 (24 Sep); the day after is 25 Sep.
    const engine = engineFor([aPeriodStart('2026-09-20')], '2026-09-26')
    expect(dayPrompt('2026-09-25', '2026-09-26', engine)).toBe('bleeding')
    expect(dayPrompt('2026-09-26', '2026-09-26', engine)).toBe('none')
  })

  test('offers no new start before cycle day 15', () => {
    const engine = engineFor([aPeriodStart('2026-09-01')], '2026-09-20')
    expect(dayPrompt('2026-09-14', '2026-09-20', engine)).toBe('none')
    expect(dayPrompt('2026-09-15', '2026-09-20', engine)).toBe('logStart')
  })

  test('asks whether it has started from the earliest expected day', () => {
    // Regular 28-day history, current cycle from 23 Apr: expected 21 May,
    // earliest 20 May.
    const engine = engineFor(periodStarts('2026-01-01', [28, 28, 28, 28]), '2026-05-21')
    expect(dayPrompt('2026-05-19', '2026-05-21', engine)).toBe('logStart')
    expect(dayPrompt('2026-05-20', '2026-05-21', engine)).toBe('started')
    expect(dayPrompt('2026-05-21', '2026-05-21', engine)).toBe('started')
  })

  test('still asks after a not-yet answer today', () => {
    const logs = [...periodStarts('2026-01-01', [28, 28, 28, 28]), aLog('2026-05-21', { noBleed: true })]
    const engine = engineFor(logs, '2026-05-21')
    expect(dayPrompt('2026-05-21', '2026-05-21', engine)).toBe('started')
  })

  test('keeps asking while the period is late', () => {
    const engine = engineFor(periodStarts('2026-01-01', [28, 28, 28, 28]), '2026-05-28')
    expect(dayPrompt('2026-05-28', '2026-05-28', engine)).toBe('started')
  })

  test('offers a start on days in past cycles, as before', () => {
    const engine = engineFor(periodStarts('2026-01-01', [28, 28, 28, 28]), '2026-05-10')
    expect(dayPrompt('2026-02-10', '2026-05-10', engine)).toBe('logStart')
  })

  test('offers a start when nothing has been logged', () => {
    expect(dayPrompt('2026-09-20', '2026-09-20', engineFor([], '2026-09-20'))).toBe('logStart')
  })

  test('stops asking about bleeding after the last day a yes can be recorded', () => {
    // A run logged every day from 1 Sep keeps extending the assumed end.
    const logs = [aPeriodStart('2026-09-01'), ...Array.from({ length: 16 }, (_, i) =>
      aPeriodDay(`2026-09-${String(i + 2).padStart(2, '0')}`))]
    const engine = engineFor(logs, '2026-09-20')
    expect(dayPrompt('2026-09-15', '2026-09-20', engine)).toBe('bleeding') // cycle day 15
    expect(dayPrompt('2026-09-16', '2026-09-20', engine)).not.toBe('bleeding') // cycle day 16
  })
})
