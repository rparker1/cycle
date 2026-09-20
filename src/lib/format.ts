/**
 * Display formatting.
 *
 * Uses `Intl` rather than a date library: the app needs half a dozen formats
 * and the platform already has them, which keeps the bundle small enough to
 * open instantly on a phone.
 */

import type { IsoDate } from '@/engine/types'
import { diffDays, parseIso, todayIso } from './date'

const LOCALE = 'en-GB'

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, opts)

const longDate = fmt({ weekday: 'long', day: 'numeric', month: 'long' })
const shortDate = fmt({ day: 'numeric', month: 'short' })
const dayMonth = fmt({ day: 'numeric', month: 'long' })
const monthYear = fmt({ month: 'long', year: 'numeric' })
const weekdayShort = fmt({ weekday: 'short' })

export const formatLong = (iso: IsoDate): string => longDate.format(parseIso(iso))
export const formatShort = (iso: IsoDate): string => shortDate.format(parseIso(iso))
export const formatDayMonth = (iso: IsoDate): string => dayMonth.format(parseIso(iso))
export const formatMonthYear = (iso: IsoDate): string => monthYear.format(parseIso(iso))
export const formatWeekday = (iso: IsoDate): string => weekdayShort.format(parseIso(iso))

/** "1–6 Oct", collapsing the month when both ends share one. */
export function formatRange(start: IsoDate, end: IsoDate): string {
  const a = parseIso(start)
  const b = parseIso(end)
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()}–${shortDate.format(b)}`
  }
  return `${shortDate.format(a)} – ${shortDate.format(b)}`
}

/** "today", "tomorrow", "in 6 days", "3 days ago". */
export function relativeDay(iso: IsoDate, from: IsoDate = todayIso()): string {
  const days = diffDays(from, iso)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days > 0) return `in ${days} days`
  return `${Math.abs(days)} days ago`
}

export function dayCount(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}
