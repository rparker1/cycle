/**
 * Prediction and per-day assessment.
 *
 * Everything the app tells a user about their body is computed here. The
 * module is pure: no storage, no network, no reading of the clock. "Today"
 * arrives as an argument so every claim is reproducible and testable.
 */

import { addDays, diffDays, isWithin, maxIso } from '@/lib/date'
import { analyseCycles, deriveCycles, learnLutealLength } from './cycles'
import type {
  Confidence,
  Cycle,
  DayAssessment,
  DayLog,
  EngineInput,
  IsoDate,
  Phase,
  Prediction,
  RiskLevel,
  Window,
} from './types'

/** Sperm survival in the reproductive tract, in days before ovulation. */
const FERTILE_DAYS_BEFORE = 5
/** Ovum viability, in days after ovulation. */
const FERTILE_DAYS_AFTER = 1

const CONFIDENCE_FAIR_AT = 3
const CONFIDENCE_GOOD_AT = 6

export interface Engine {
  prediction: Prediction
  cycles: Cycle[]
  assessDay(date: IsoDate): DayAssessment
}

export function createEngine(engineInput: EngineInput): Engine {
  const { today, logs, resolutions, profile } = engineInput

  const liveLogs = logs.filter((l) => l.deletedAt === null)
  const cycles = deriveCycles(liveLogs, today)
  const { baseline, anomalies } = analyseCycles(cycles, resolutions, profile)
  const lutealLength = learnLutealLength(cycles, profile)

  const current = cycles.find((c) => c.isCurrent) ?? null
  const logsByDate = new Map(liveLogs.map((l) => [l.logDate, l]))

  const confidence: Confidence =
    baseline.eligibleCount >= CONFIDENCE_GOOD_AT
      ? 'good'
      : baseline.eligibleCount >= CONFIDENCE_FAIR_AT
        ? 'fair'
        : 'learning'

  if (current === null) {
    return {
      cycles,
      prediction: {
        today,
        cycleDay: null,
        phase: null,
        baseline,
        lutealLength,
        nextPeriod: null,
        ovulation: null,
        ovulationConfirmed: false,
        fertileWindow: null,
        protectionWindow: null,
        confidence,
        anomalies,
      },
      assessDay: (date) => emptyAssessment(date),
    }
  }

  const cycleLength = Math.round(baseline.length)
  const spread = Math.max(1, Math.round(baseline.spread))

  const nextPeriodLikely = addDays(current.startDate, cycleLength)
  const nextPeriod = {
    earliest: addDays(nextPeriodLikely, -spread),
    likely: nextPeriodLikely,
    latest: addDays(nextPeriodLikely, spread),
  }

  const ovulationConfirmed = current.confirmedOvulation !== null
  const ovulationLikely = ovulationConfirmed
    ? (current.confirmedOvulation as IsoDate)
    : addDays(nextPeriodLikely, -lutealLength)

  const ovulation = {
    earliest: ovulationConfirmed ? ovulationLikely : addDays(ovulationLikely, -spread),
    likely: ovulationLikely,
    latest: ovulationConfirmed ? ovulationLikely : addDays(ovulationLikely, spread),
  }

  const fertileWindow: Window = {
    start: addDays(ovulationLikely, -FERTILE_DAYS_BEFORE),
    end: addDays(ovulationLikely, FERTILE_DAYS_AFTER),
  }

  // Uncertainty widens caution; it never narrows it. A confirmed ovulation
  // removes the buffer entirely, an erratic history enlarges it.
  const uncertainty = ovulationConfirmed ? 0 : spread
  const protectionWindow: Window = {
    start: addDays(fertileWindow.start, -uncertainty),
    end: addDays(fertileWindow.end, uncertainty),
  }

  const prediction: Prediction = {
    today,
    cycleDay: diffDays(current.startDate, today) + 1,
    phase: phaseFor(today, current, ovulationLikely, profile.avgPeriodLength),
    baseline,
    lutealLength,
    nextPeriod,
    ovulation,
    ovulationConfirmed,
    fertileWindow,
    protectionWindow,
    confidence,
    anomalies,
  }

  const predictedPeriodEnd = addDays(nextPeriodLikely, profile.avgPeriodLength - 1)

  /*
   * The days this period is still expected to run. Most people tap "period"
   * on day one and then get on with their life, so without this the calendar
   * would show a single shaded day for a five-day period.
   */
  const currentStart = current.startDate
  const currentPeriodEnd =
    current.periodEndConfirmed && current.periodEndDate !== null
      ? current.periodEndDate
      : addDays(currentStart, Math.max(1, profile.avgPeriodLength) - 1)

  function assessDay(date: IsoDate): DayAssessment {
    const cycle = cycleContaining(cycles, date)
    const log = logsByDate.get(date)

    // Past cycles are described from what was logged; only the current and
    // future are described from predictions.
    const isFertile = isWithin(date, fertileWindow.start, fertileWindow.end)
    const inBuffer = isWithin(date, protectionWindow.start, protectionWindow.end)

    const risk: RiskLevel = isFertile
      ? 'high'
      : inBuffer
        ? 'elevated'
        : baseline.eligibleCount >= CONFIDENCE_FAIR_AT
          ? 'lower'
          : 'unknown'

    return {
      date,
      cycleDay: cycle === null ? null : diffDays(cycle.startDate, date) + 1,
      phase:
        cycle === null ? null : phaseFor(date, cycle, ovulationLikely, profile.avgPeriodLength),
      risk,
      isPeriod: log?.isPeriod === true,
      isPredictedPeriod:
        log?.isPeriod !== true &&
        (isWithin(date, nextPeriodLikely, predictedPeriodEnd) ||
          isWithin(date, currentStart, currentPeriodEnd)),
      isOvulation: date === ovulationLikely,
      isFertile,
    }
  }

  return { prediction, cycles, assessDay }
}

function cycleContaining(cycles: Cycle[], date: IsoDate): Cycle | null {
  return (
    cycles.find(
      (c) => date >= c.startDate && (c.endDate === null ? true : date <= c.endDate),
    ) ?? null
  )
}

/**
 * The phase a date falls in.
 *
 * Menstrual runs to the explicitly marked period end where the user set one.
 * Otherwise it runs to whichever is later: the last day they happened to log,
 * or their stated average period length. Logging every bleeding day is
 * optional, and someone who taps "period" on day one and then gets on with
 * their life should not be told they are follicular on day two.
 */
function phaseFor(
  date: IsoDate,
  cycle: Cycle,
  ovulationDate: IsoDate,
  avgPeriodLength: number,
): Phase {
  const assumedEnd = addDays(cycle.startDate, Math.max(1, avgPeriodLength) - 1)
  const periodEnd =
    cycle.periodEndConfirmed && cycle.periodEndDate !== null
      ? cycle.periodEndDate
      : maxIso(cycle.periodEndDate ?? cycle.startDate, assumedEnd)

  if (date <= periodEnd) return 'menstrual'
  if (date === ovulationDate) return 'ovulation'
  if (date < ovulationDate) return 'follicular'
  return 'luteal'
}

function emptyAssessment(date: IsoDate): DayAssessment {
  return {
    date,
    cycleDay: null,
    phase: null,
    risk: 'unknown',
    isPeriod: false,
    isPredictedPeriod: false,
    isOvulation: false,
    isFertile: false,
  }
}

/** Convenience for callers that only need the summary. */
export function predict(engineInput: EngineInput): Prediction {
  return createEngine(engineInput).prediction
}

export type { DayLog }
