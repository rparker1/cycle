/**
 * Which question the day sheet asks about a given day.
 *
 * Pure, so the rule that stops a false second period start is tested rather
 * than buried in a component. The sheet renders whatever this returns.
 */

import { addDays, diffDays, minIso } from '@/lib/date'
import { periodEndFor, type Engine } from './predict'
import { MAX_PERIOD_DAYS } from './logging'
import type { IsoDate } from './types'

export type DayPrompt =
  /** "Were you bleeding this day?" — inside the current period, or the day after it. */
  | 'bleeding'
  /** "Has your period started?" — the next period is due or late. */
  | 'started'
  /** The existing "My period started this day". */
  | 'logStart'
  | 'none'

/**
 * The shortest cycle the app accepts. A "start" before this cycle day is a
 * mis-tap or spotting, not a new period.
 */
const LOG_START_FROM_CYCLE_DAY = 15

export function dayPrompt(date: IsoDate, today: IsoDate, engine: Engine): DayPrompt {
  if (date > today) return 'none'

  const current = engine.cycles.find((c) => c.isCurrent) ?? null
  if (current === null || date < current.startDate) return 'logStart'
  if (date === current.startDate) return 'none'

  const { periodLength, nextPeriodExpected } = engine.prediction
  // The planner (planBleedingReport) accepts a "yes" only up to cycle day
  // MAX_PERIOD_DAYS (it refuses once the last bleeding day would land beyond
  // that), so the zone ends there too — the last day a "yes" can be
  // recorded — otherwise the sheet would offer flow chips whose answer is
  // silently dropped.
  const bleedingZoneEnd = minIso(
    addDays(periodEndFor(current, periodLength), 1),
    addDays(current.startDate, MAX_PERIOD_DAYS - 1),
  )
  if (date <= bleedingZoneEnd) return 'bleeding'

  if (nextPeriodExpected !== null && date >= nextPeriodExpected.earliest) return 'started'

  const cycleDay = diffDays(current.startDate, date) + 1
  return cycleDay < LOG_START_FROM_CYCLE_DAY ? 'none' : 'logStart'
}

/**
 * Whether a new period may be booked starting on `date`.
 *
 * Spec §2: "A period can never gain a second start from these screens." A
 * start inside the running cycle before day 15 poisons the cycle history —
 * it books a short cycle and drags the fertile window with it — so this is
 * only true there when `dayPrompt` itself would already offer a start.
 */
export function canStartPeriodOn(date: IsoDate, today: IsoDate, engine: Engine): boolean {
  if (date > today) return false

  const current = engine.cycles.find((c) => c.isCurrent) ?? null
  if (current === null || date <= current.startDate) return true

  const prompt = dayPrompt(date, today, engine)
  return prompt === 'started' || prompt === 'logStart'
}
