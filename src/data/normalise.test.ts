import { describe, expect, test } from 'vitest'
import { normaliseDayLog } from './normalise'
import { aLog } from '@/engine/__testutils__/fixtures'
import type { DayLog } from '@/engine/types'

describe('normaliseDayLog', () => {
  test('reads a row written before noBleed existed as not reported', () => {
    const { noBleed: _dropped, ...legacy } = aLog('2026-09-20')
    const log = normaliseDayLog(legacy as unknown as DayLog)
    expect(log.noBleed).toBe(false)
  })

  test('keeps an explicit noBleed', () => {
    expect(normaliseDayLog(aLog('2026-09-20', { noBleed: true })).noBleed).toBe(true)
  })

  test('never lets a stored row claim bleeding and not bleeding at once', () => {
    const log = normaliseDayLog(aLog('2026-09-20', { isPeriod: true, noBleed: true }))
    expect(log.noBleed).toBe(false)
  })
})
