/**
 * Cycle derivation and baseline analysis.
 *
 * Cycles are never stored. They are derived from logged period starts every
 * time they are needed. A stored cycle would be a second source of truth that
 * drifts the moment a date is corrected — which is precisely how a single
 * mis-logged period corrupts a tracker's forecast.
 */

import { addDays, diffDays } from '@/lib/date'
import { clamp, mad, median } from './stats'
import { MAX_PERIOD_DAYS } from './logging'
import type { Anomaly, Baseline, Cycle, CycleResolution, DayLog, IsoDate, Profile } from './types'

/** How many recent cycles inform the baseline. */
const BASELINE_WINDOW = 6

/** Below this many cycles, the user's onboarding answer is the better reference. */
const MIN_CYCLES_FOR_HISTORY = 3

/** Assumed day-to-day variation before any history exists. */
const DEFAULT_SPREAD = 2

/** A cycle must differ by at least this much to be anomalous, however tight the history. */
const ABSOLUTE_THRESHOLD_DAYS = 7

/** At or beyond this multiple of the baseline, a missed period is the likelier explanation. */
const MISSED_PERIOD_RATIO = 1.5

const LUTEAL_MIN = 9
const LUTEAL_MAX = 17

/** How many recent confirmed periods inform the learned period length. */
const PERIOD_HISTORY_WINDOW = 6

/** One confirmed period is an anecdote; two is the least that is a pattern. */
const MIN_PERIODS_FOR_HISTORY = 2

interface CompletedCycle extends Cycle {
  length: number
  endDate: IsoDate
}

const isCompleted = (c: Cycle): c is CompletedCycle => c.length !== null && c.endDate !== null

const live = <T extends { deletedAt: string | null }>(rows: T[]): T[] =>
  rows.filter((r) => r.deletedAt === null)

/**
 * Build the cycle history from logged period starts.
 *
 * `isPeriodStart` is read from the log rather than inferred from runs of
 * bleeding. Inference breaks on spotting, on days the user forgot to log, and
 * on exactly the correction this app needs to make easy.
 */
export function deriveCycles(logs: DayLog[], today: IsoDate): Cycle[] {
  const current = live(logs)

  const starts = [
    ...new Set(
      current
        .filter((l) => l.isPeriodStart && l.logDate <= today)
        .map((l) => l.logDate),
    ),
  ].sort()

  return starts.map((startDate, i) => {
    const nextStart = starts[i + 1]
    const isCurrent = nextStart === undefined
    const endDate = nextStart === undefined ? null : addDays(nextStart, -1)
    const length = nextStart === undefined ? null : diffDays(startDate, nextStart)

    const withinCycle = (date: IsoDate): boolean =>
      date >= startDate && (endDate === null ? true : date <= endDate)

    const lastMatching = (predicate: (l: DayLog) => boolean): IsoDate | null => {
      const dates = current
        .filter((l) => predicate(l) && withinCycle(l.logDate))
        .map((l) => l.logDate)
        .sort()
      return dates.length > 0 ? (dates[dates.length - 1] as IsoDate) : null
    }

    return {
      startDate,
      endDate,
      length,
      periodEndDate: lastMatching((l) => l.isPeriod),
      periodEndConfirmed: lastMatching((l) => l.isPeriodEnd) !== null,
      confirmedOvulation: lastMatching(
        (l) => l.ovulationClaimed && l.ovulationConfidence === 'confident',
      ),
      isCurrent,
    }
  })
}

export interface CycleAnalysis {
  baseline: Baseline
  anomalies: Anomaly[]
}

/**
 * Work out the baseline cycle length and flag anything out of the ordinary.
 *
 * Two passes, because anomaly detection needs a reference and the reference
 * must not itself be poisoned by the anomaly:
 *
 *   1. Take a reference from the user's answered history — or, when that
 *      history is too thin to trust, from what they told us at onboarding.
 *   2. Flag deviations against it, then recompute the baseline with the
 *      unresolved ones provisionally excluded.
 *
 * Provisional exclusion is the important part. A late period is flagged and
 * set aside *before* the user answers, so the forecast never lurches on a
 * single unusual month.
 */
export function analyseCycles(
  cycles: Cycle[],
  resolutions: CycleResolution[],
  profile: Profile,
): CycleAnalysis {
  const completed = cycles.filter(isCompleted)
  const byStart = new Map(live(resolutions).map((r) => [r.cycleStart, r]))

  const answered = (c: CompletedCycle): boolean => byStart.has(c.startDate)
  const userExcluded = (c: CompletedCycle): boolean =>
    byStart.get(c.startDate)?.excludedFromBaseline === true

  // Pass 1 — the reference to judge against.
  const candidates = completed.filter((c) => !userExcluded(c))
  const recentCandidates = candidates.slice(-BASELINE_WINDOW)
  const hasHistory = recentCandidates.length >= MIN_CYCLES_FOR_HISTORY

  const reference = hasHistory
    ? median(recentCandidates.map((c) => c.length))
    : profile.avgCycleLength
  const referenceSpread = hasHistory
    ? Math.max(1, mad(recentCandidates.map((c) => c.length)))
    : DEFAULT_SPREAD
  const threshold = Math.max(ABSOLUTE_THRESHOLD_DAYS, 3 * referenceSpread)

  // Pass 2 — flag deviations. A cycle the user has already answered is never
  // raised again, whatever the answer was.
  const anomalies: Anomaly[] = candidates
    .filter((c) => !answered(c) && Math.abs(c.length - reference) > threshold)
    .map((c) => {
      const suspectMissed = c.length >= MISSED_PERIOD_RATIO * reference
      return {
        cycleStart: c.startDate,
        observedLength: c.length,
        baselineAtDetection: reference,
        kind: suspectMissed
          ? ('suspected_missed_period' as const)
          : c.length > reference
            ? ('unusually_long' as const)
            : ('unusually_short' as const),
        suggestedMissedPeriodDate: suspectMissed
          ? addDays(c.startDate, Math.round(reference))
          : null,
        autoAccepted: false,
      }
    })

  // A body that has genuinely changed should not require the user to keep
  // dismissing the same prompt. Two consecutive cycles deviating the same way
  // is treated as a new normal, and the baseline window restarts there.
  const flagged = new Set(anomalies.map((a) => a.cycleStart))
  const lastTwo = completed.slice(-2)
  const direction = (c: CompletedCycle): 1 | -1 => (c.length > reference ? 1 : -1)
  const shifted =
    lastTwo.length === 2 &&
    lastTwo.every((c) => flagged.has(c.startDate)) &&
    direction(lastTwo[0] as CompletedCycle) === direction(lastTwo[1] as CompletedCycle)

  if (shifted) {
    const shiftStarts = new Set(lastTwo.map((c) => c.startDate))
    for (const a of anomalies) {
      if (shiftStarts.has(a.cycleStart)) a.autoAccepted = true
    }
    const lengths = lastTwo.map((c) => c.length)
    return {
      baseline: {
        length: median(lengths),
        spread: Math.max(1, mad(lengths)),
        eligibleCount: lengths.length,
        source: 'shifted',
      },
      anomalies,
    }
  }

  const eligible = candidates
    .filter((c) => !flagged.has(c.startDate))
    .slice(-BASELINE_WINDOW)
    .map((c) => c.length)

  if (eligible.length === 0) {
    return {
      baseline: {
        length: profile.avgCycleLength,
        spread: DEFAULT_SPREAD,
        eligibleCount: 0,
        source: 'onboarding',
      },
      anomalies,
    }
  }

  return {
    baseline: {
      length: median(eligible),
      spread: Math.max(1, mad(eligible)),
      eligibleCount: eligible.length,
      source: 'history',
    },
    anomalies,
  }
}

/**
 * Learn the user's luteal phase from confirmed ovulations.
 *
 * The luteal phase is the more stable half of the cycle, so anchoring
 * predictions to it degrades more gracefully than assuming ovulation sits at
 * `cycleLength − 14`. Each time the user confirms ovulation and the next
 * period then arrives, we get one real measurement.
 */
export function learnLutealLength(cycles: Cycle[], profile: Profile): number {
  const observations = cycles
    .filter(isCompleted)
    .filter((c) => c.confirmedOvulation !== null)
    .map((c) => diffDays(c.confirmedOvulation as IsoDate, addDays(c.endDate, 1)))
    .filter((days) => days > 0)

  if (observations.length === 0) return profile.lutealLength
  return clamp(Math.round(median(observations)), LUTEAL_MIN, LUTEAL_MAX)
}

/**
 * Learn how long the user's periods actually last.
 *
 * A period counts once its last day has been confirmed — by a "no, not
 * bleeding" the day after, or by booking a length — and that day is in the
 * past. A length booked on day one for days that have not happened yet is a
 * guess, not an observation, and must not teach the model anything.
 */
export function learnPeriodLength(cycles: Cycle[], today: IsoDate, profile: Profile): number {
  const observations = cycles
    .filter((c) => c.periodEndConfirmed && c.periodEndDate !== null && c.periodEndDate < today)
    .map((c) => clamp(diffDays(c.startDate, c.periodEndDate as IsoDate) + 1, 1, MAX_PERIOD_DAYS))
    .slice(-PERIOD_HISTORY_WINDOW)

  if (observations.length < MIN_PERIODS_FOR_HISTORY) return profile.avgPeriodLength
  return Math.round(median(observations))
}
