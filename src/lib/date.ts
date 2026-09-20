/**
 * Calendar-date helpers.
 *
 * The entire app works in local calendar days expressed as `YYYY-MM-DD`
 * strings. Arithmetic goes through local `Date` objects set to local midnight
 * and is read back through local getters, so a daylight-saving transition
 * never shifts a date by a day.
 */

import type { IsoDate } from '@/engine/types'

const MS_PER_DAY = 86_400_000

const pad = (n: number): string => String(n).padStart(2, '0')

/** Parse `YYYY-MM-DD` to a `Date` at *local* midnight. */
export function parseIso(iso: IsoDate): Date {
  const { year, month, day } = isoToParts(iso)
  return new Date(year, month - 1, day)
}

/** Format a `Date` as its *local* calendar day. */
export function toIso(date: Date): IsoDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function isoToParts(iso: IsoDate): {
  year: number
  month: number
  day: number
} {
  const [y, m, d] = iso.split('-')
  return { year: Number(y), month: Number(m), day: Number(d) }
}

/** Today as a local calendar date. */
export function todayIso(): IsoDate {
  return toIso(new Date())
}

export function addDays(iso: IsoDate, count: number): IsoDate {
  const date = parseIso(iso)
  date.setDate(date.getDate() + count)
  return toIso(date)
}

/**
 * Whole days from `from` to `to`. Negative when `to` is earlier.
 *
 * Rounded, because a DST transition makes one of these "days" 23 or 25 hours
 * long and an unrounded division would report 4.96 days as 4.
 */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / MS_PER_DAY)
}

export const minIso = (a: IsoDate, b: IsoDate): IsoDate => (a <= b ? a : b)
export const maxIso = (a: IsoDate, b: IsoDate): IsoDate => (a >= b ? a : b)

export const isBefore = (a: IsoDate, b: IsoDate): boolean => a < b
export const isAfter = (a: IsoDate, b: IsoDate): boolean => a > b

/** Inclusive on both ends. */
export function isWithin(date: IsoDate, start: IsoDate, end: IsoDate): boolean {
  return date >= start && date <= end
}

/** Every date from `start` to `end` inclusive. */
export function eachDay(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}
