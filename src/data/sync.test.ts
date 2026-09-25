import { describe, expect, test } from 'vitest'
import { fromDayLog, toDayLog, type DayLogRow } from './sync'
import { aLog } from '@/engine/__testutils__/fixtures'

describe('day log row mapping', () => {
  test('round-trips noBleed', () => {
    const log = aLog('2026-09-24', { noBleed: true })
    const row = { id: log.id, ...fromDayLog(log, 'user-1') } as DayLogRow
    expect(row.no_bleed).toBe(true)
    expect(toDayLog(row).noBleed).toBe(true)
  })

  test('reads a row from a database without the column as not reported', () => {
    const log = aLog('2026-09-24')
    const { no_bleed: _dropped, ...row } = { id: log.id, ...fromDayLog(log, 'user-1') }
    expect(toDayLog(row as unknown as DayLogRow).noBleed).toBe(false)
  })
})
