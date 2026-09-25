/**
 * Bring a stored day log up to the current shape.
 *
 * Rows written before a field existed — on this phone, in an old export, or
 * in a Supabase project that has not had the latest migration — arrive
 * without it. Reading them through here keeps the engine's `=== true` checks
 * honest and the "bleeding and not bleeding" pair impossible.
 */

import type { DayLog } from '@/engine/types'

export function normaliseDayLog(log: DayLog): DayLog {
  return { ...log, noBleed: log.noBleed === true && log.isPeriod !== true }
}
