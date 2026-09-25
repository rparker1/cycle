/**
 * Test fixtures. Not imported by production code.
 */

import type { CycleResolution, DayLog, IsoDate, Profile, Resolution } from '../types'

let seq = 0
const nextId = (): string => `fixture-${++seq}`

export function aLog(logDate: IsoDate, over: Partial<DayLog> = {}): DayLog {
  return {
    id: nextId(),
    logDate,
    isPeriod: false,
    isPeriodStart: false,
    isPeriodEnd: false,
    noBleed: false,
    flow: null,
    feltFertile: false,
    ovulationClaimed: false,
    ovulationConfidence: null,
    ovulationSigns: [],
    symptoms: [],
    mood: null,
    sexualActivity: null,
    protectionUsed: null,
    notes: null,
    predictionFeedback: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...over,
  }
}

export function aPeriodStart(logDate: IsoDate, over: Partial<DayLog> = {}): DayLog {
  return aLog(logDate, { isPeriod: true, isPeriodStart: true, flow: 'medium', ...over })
}

export function aPeriodDay(logDate: IsoDate, over: Partial<DayLog> = {}): DayLog {
  return aLog(logDate, { isPeriod: true, flow: 'medium', ...over })
}

export function aConfirmedOvulation(logDate: IsoDate, over: Partial<DayLog> = {}): DayLog {
  return aLog(logDate, {
    ovulationClaimed: true,
    ovulationConfidence: 'confident',
    ...over,
  })
}

export function aProfile(over: Partial<Profile> = {}): Profile {
  return {
    displayName: 'Test',
    appName: 'Cycle',
    avgCycleLength: 28,
    avgPeriodLength: 5,
    lutealLength: 14,
    onboardedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

export function aResolution(
  cycleStart: IsoDate,
  resolution: Resolution,
  over: Partial<CycleResolution> = {},
): CycleResolution {
  return {
    id: nextId(),
    cycleStart,
    observedLength: null,
    resolution,
    excludedFromBaseline: resolution === 'one_off' || resolution === 'mislogged',
    note: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...over,
  }
}

/**
 * Period starts spaced by the given lengths, beginning at `first`.
 * `periodStarts('2026-01-01', [28, 28])` yields three starts and two
 * completed cycles of 28 days.
 */
export function periodStarts(first: IsoDate, lengths: number[]): DayLog[] {
  const logs: DayLog[] = [aPeriodStart(first)]
  let cursor = first
  for (const len of lengths) {
    const d = new Date(`${cursor}T00:00:00`)
    d.setDate(d.getDate() + len)
    cursor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`
    logs.push(aPeriodStart(cursor))
  }
  return logs
}
