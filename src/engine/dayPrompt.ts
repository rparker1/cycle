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
  // MAX_PERIOD_DAYS - 1 (it refuses once the last bleeding day would land
  // beyond MAX_PERIOD_DAYS), so the zone stops there too — the last day a
  // "yes" can be recorded — otherwise the sheet would offer flow chips whose
  // answer is silently dropped.
  const bleedingZoneEnd = minIso(
    addDays(periodEndFor(current, periodLength), 1),
    addDays(current.startDate, MAX_PERIOD_DAYS - 1),
  )
  if (date <= bleedingZoneEnd) return 'bleeding'

  if (nextPeriodExpected !== null && date >= nextPeriodExpected.earliest) return 'started'

  const cycleDay = diffDays(current.startDate, date) + 1
  return cycleDay < LOG_START_FROM_CYCLE_DAY ? 'none' : 'logStart'
}
