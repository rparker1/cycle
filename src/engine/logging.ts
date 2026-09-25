/**
 * Planning period writes.
 *
 * Pure: takes the logs you have and the period you want to record, returns
 * the day-by-day changes needed. The repository applies them. Keeping the
 * decisions here means the awkward cases — a stray start inside a run, a
 * period being shortened — are testable without a database.
 */

import { addDays, diffDays } from '@/lib/date'
import type { DayLog, Flow, IsoDate } from './types'

/** Longest period the app will record in one go. */
export const MAX_PERIOD_DAYS = 15

/**
 * A start this close to another run is a mis-tap, not a second period. The
 * shortest cycle the app accepts is 15 days, so nothing genuine lands here.
 */
const MISTAP_WINDOW_DAYS = 3

export interface DayWrite {
  date: IsoDate
  patch: Partial<DayLog>
}

const clampLength = (days: number): number =>
  Math.min(MAX_PERIOD_DAYS, Math.max(1, Math.round(days || 1)))

const liveLogs = (logs: DayLog[]): DayLog[] => logs.filter((l) => l.deletedAt === null)

const byDate = (logs: DayLog[]): Map<IsoDate, DayLog> =>
  new Map(liveLogs(logs).map((l) => [l.logDate, l]))

/** The contiguous run of logged bleeding days beginning at `start`. */
function existingRun(logs: Map<IsoDate, DayLog>, start: IsoDate): IsoDate[] {
  const run: IsoDate[] = []
  for (let d = start; logs.get(d)?.isPeriod === true; d = addDays(d, 1)) {
    run.push(d)
    // A malformed log should not spin forever.
    if (run.length > MAX_PERIOD_DAYS * 4) break
  }
  return run
}

/**
 * Record a period of a given length, starting on a given day.
 *
 * This is what backfilling should have been from the start: one action for
 * the whole period, rather than tapping each day and declaring each one a new
 * start.
 */
export function planPeriodRun(
  logs: DayLog[],
  startDate: IsoDate,
  lengthDays: number,
): DayWrite[] {
  const length = clampLength(lengthDays)
  const existing = byDate(logs)
  const endDate = addDays(startDate, length - 1)

  const writes: DayWrite[] = []

  for (let i = 0; i < length; i++) {
    const date = addDays(startDate, i)
    const current = existing.get(date)
    const patch: Partial<DayLog> = {
      isPeriod: true,
      isPeriodStart: i === 0,
      isPeriodEnd: i === length - 1,
      noBleed: false,
    }
    // Leave a flow the user already chose; only fill a blank one.
    if (!current?.flow) patch.flow = 'medium'
    writes.push({ date, patch })
  }

  // Days that were part of a longer run and are no longer in it.
  for (const date of existingRun(existing, startDate)) {
    if (date <= endDate) continue
    writes.push({ date, patch: { isPeriod: false, isPeriodStart: false, isPeriodEnd: false } })
  }

  // Mis-tapped starts hugging this run. Anything genuinely later is left alone.
  for (const log of liveLogs(logs)) {
    if (!log.isPeriodStart || log.logDate === startDate) continue
    const before = diffDays(log.logDate, startDate)
    const after = diffDays(endDate, log.logDate)
    const nearby = (before > 0 && before <= MISTAP_WINDOW_DAYS) ||
      (after > 0 && after <= MISTAP_WINDOW_DAYS) ||
      (log.logDate > startDate && log.logDate <= endDate)
    if (!nearby) continue
    if (writes.some((w) => w.date === log.logDate)) continue
    writes.push({ date: log.logDate, patch: { isPeriodStart: false } })
  }

  return writes
}

/** Undo a whole logged period, not just the day that was tapped. */
export function planPeriodRemoval(logs: DayLog[], anyDayInRun: IsoDate): DayWrite[] {
  const existing = byDate(logs)
  if (existing.get(anyDayInRun)?.isPeriod !== true) return []

  // Walk back to the first bleeding day of this run, then forward over it.
  let start = anyDayInRun
  while (existing.get(addDays(start, -1))?.isPeriod === true) {
    start = addDays(start, -1)
  }

  return existingRun(existing, start).map((date) => ({
    date,
    patch: { isPeriod: false, isPeriodStart: false, isPeriodEnd: false, flow: null },
  }))
}

/** First day of the logged period containing `date`, if there is one. */
export function periodStartFor(logs: DayLog[], date: IsoDate): IsoDate | null {
  const existing = byDate(logs)
  if (existing.get(date)?.isPeriod !== true) return null
  let start = date
  while (existing.get(addDays(start, -1))?.isPeriod === true) {
    start = addDays(start, -1)
  }
  return start
}

/** Length in days of the logged period containing `date`. */
export function periodLengthFor(logs: DayLog[], date: IsoDate): number {
  const start = periodStartFor(logs, date)
  if (start === null) return 0
  return existingRun(byDate(logs), start).length
}

/** A day filled in as bleeding because the days either side of it were. */
const fillPatch = (current: DayLog | undefined): Partial<DayLog> => ({
  isPeriod: true,
  isPeriodEnd: false,
  noBleed: false,
  ...(current?.flow ? {} : { flow: 'medium' as const }),
})

/**
 * Answer "were you bleeding this day?" for a day of the current period.
 *
 * Yes: the day bleeds, and unreported days back to the start are filled in,
 * because a period is one run. Any end marked before this day was wrong.
 * No: the day before becomes the confirmed last day, and booked days after
 * this one are cleared.
 *
 * Never sets `isPeriodStart`. Setting it here is the false-second-start
 * defect this exists to remove. An explicit "not bleeding" day is never
 * overwritten by a fill — only by an answer about that day itself.
 */
export function planBleedingReport(
  logs: DayLog[],
  cycleStart: IsoDate,
  date: IsoDate,
  bleeding: boolean,
  flow: Flow = 'medium',
): DayWrite[] {
  if (date <= cycleStart) return []

  const existing = byDate(logs)
  const writes: DayWrite[] = []
  const lastBleedingDay = bleeding ? date : addDays(date, -1)
  const alreadyEnded = !bleeding && existing.get(lastBleedingDay)?.noBleed === true

  if (!alreadyEnded) {
    for (let d = cycleStart; d < lastBleedingDay; d = addDays(d, 1)) {
      const current = existing.get(d)
      if (current?.noBleed === true) continue
      if (current?.isPeriod === true) {
        if (current.isPeriodEnd) writes.push({ date: d, patch: { isPeriodEnd: false } })
        continue
      }
      writes.push({ date: d, patch: fillPatch(current) })
    }
  }

  if (bleeding) {
    const current = existing.get(date)
    writes.push({
      date,
      patch: {
        isPeriod: true,
        noBleed: false,
        flow,
        // Keep an end the user booked for this very day; otherwise it is open.
        isPeriodEnd: current?.isPeriod === true ? current.isPeriodEnd : false,
      },
    })
    return writes
  }

  if (!alreadyEnded) {
    const previous = existing.get(lastBleedingDay)
    writes.push({
      date: lastBleedingDay,
      patch:
        previous?.isPeriod === true
          ? { isPeriodEnd: true }
          : { ...fillPatch(previous), isPeriodEnd: true },
    })
  }

  writes.push({
    date,
    patch: { isPeriod: false, isPeriodEnd: false, flow: null, noBleed: true },
  })

  // Booked days after this one belonged to a period that has now ended.
  for (let d = addDays(date, 1); ; d = addDays(d, 1)) {
    const current = existing.get(d)
    if (current?.isPeriod !== true || current.isPeriodStart) break
    writes.push({ date: d, patch: { isPeriod: false, isPeriodEnd: false, flow: null } })
    if (writes.length > MAX_PERIOD_DAYS * 4) break
  }

  return writes
}
