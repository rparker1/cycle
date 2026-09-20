import { describe, expect, test } from 'vitest'
import { analyseCycles, deriveCycles, learnLutealLength } from './cycles'
import {
  aConfirmedOvulation,
  aLog,
  aPeriodDay,
  aPeriodStart,
  aProfile,
  aResolution,
  periodStarts,
} from './__testutils__/fixtures'

describe('deriveCycles', () => {
  test('returns nothing when no period has been logged', () => {
    expect(deriveCycles([], '2026-09-20')).toEqual([])
  })

  test('treats a single period start as the open current cycle', () => {
    const cycles = deriveCycles([aPeriodStart('2026-09-01')], '2026-09-20')

    expect(cycles).toHaveLength(1)
    expect(cycles[0]?.startDate).toBe('2026-09-01')
    expect(cycles[0]?.length).toBeNull()
    expect(cycles[0]?.endDate).toBeNull()
    expect(cycles[0]?.isCurrent).toBe(true)
  })

  test('measures a completed cycle from one start to the next', () => {
    const cycles = deriveCycles(
      [aPeriodStart('2026-08-01'), aPeriodStart('2026-08-29')],
      '2026-09-20',
    )

    expect(cycles).toHaveLength(2)
    expect(cycles[0]?.length).toBe(28)
    expect(cycles[0]?.endDate).toBe('2026-08-28')
    expect(cycles[0]?.isCurrent).toBe(false)
    expect(cycles[1]?.isCurrent).toBe(true)
  })

  test('orders cycles regardless of the order logs arrive in', () => {
    const cycles = deriveCycles(
      [aPeriodStart('2026-08-29'), aPeriodStart('2026-08-01')],
      '2026-09-20',
    )

    expect(cycles[0]?.startDate).toBe('2026-08-01')
    expect(cycles[1]?.startDate).toBe('2026-08-29')
  })

  test('ignores soft-deleted logs', () => {
    const cycles = deriveCycles(
      [
        aPeriodStart('2026-08-01'),
        aPeriodStart('2026-08-29', { deletedAt: '2026-08-30T10:00:00.000Z' }),
      ],
      '2026-09-20',
    )

    expect(cycles).toHaveLength(1)
    expect(cycles[0]?.isCurrent).toBe(true)
  })

  test('records the last bleeding day as the period end', () => {
    const cycles = deriveCycles(
      [
        aPeriodStart('2026-09-01'),
        aPeriodDay('2026-09-02'),
        aPeriodDay('2026-09-03'),
        aPeriodStart('2026-09-29'),
      ],
      '2026-09-30',
    )

    expect(cycles[0]?.periodEndDate).toBe('2026-09-03')
  })

  test('records a confirmed ovulation inside the cycle', () => {
    const cycles = deriveCycles(
      [aPeriodStart('2026-09-01'), aConfirmedOvulation('2026-09-15')],
      '2026-09-20',
    )

    expect(cycles[0]?.confirmedOvulation).toBe('2026-09-15')
  })

  test('ignores an ovulation the user withdrew', () => {
    const cycles = deriveCycles(
      [
        aPeriodStart('2026-09-01'),
        aLog('2026-09-15', { ovulationClaimed: true, ovulationConfidence: 'rejected' }),
      ],
      '2026-09-20',
    )

    expect(cycles[0]?.confirmedOvulation).toBeNull()
  })
})

describe('analyseCycles baseline', () => {
  test('falls back to the onboarding value with no history', () => {
    const { baseline } = analyseCycles([], [], aProfile({ avgCycleLength: 30 }))

    expect(baseline.length).toBe(30)
    expect(baseline.eligibleCount).toBe(0)
    expect(baseline.source).toBe('onboarding')
  })

  test('uses the median of logged cycles once history exists', () => {
    const cycles = deriveCycles(periodStarts('2026-01-01', [30, 30, 31]), '2026-06-01')
    const { baseline } = analyseCycles(cycles, [], aProfile())

    expect(baseline.length).toBe(30)
    expect(baseline.source).toBe('history')
  })

  test('floors the spread at one day so a perfect history is not overconfident', () => {
    const cycles = deriveCycles(periodStarts('2026-01-01', [28, 28, 28]), '2026-06-01')
    const { baseline } = analyseCycles(cycles, [], aProfile())

    expect(baseline.spread).toBe(1)
  })

  test('considers only the most recent six cycles', () => {
    // Eight cycles: two ancient 21s that must not drag the recent 30s.
    const cycles = deriveCycles(
      periodStarts('2025-01-01', [21, 21, 30, 30, 30, 30, 30, 30]),
      '2026-09-01',
    )
    const { baseline } = analyseCycles(cycles, [], aProfile())

    expect(baseline.length).toBe(30)
  })
})

describe('analyseCycles anomaly detection', () => {
  // The defect that motivated the rebuild: one very late period after
  // onboarding with a 28-day cycle made the app predict a 44-day cycle.
  test('REGRESSION: a single 44-day cycle does not become the new baseline', () => {
    const cycles = deriveCycles(periodStarts('2026-08-01', [44]), '2026-09-20')
    const { baseline, anomalies } = analyseCycles(cycles, [], aProfile({ avgCycleLength: 28 }))

    expect(baseline.length).toBe(28)
    expect(baseline.source).toBe('onboarding')
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]?.observedLength).toBe(44)
  })

  test('offers the missed-period explanation when a cycle is half again as long', () => {
    const cycles = deriveCycles(periodStarts('2026-08-01', [44]), '2026-09-20')
    const { anomalies } = analyseCycles(cycles, [], aProfile({ avgCycleLength: 28 }))

    expect(anomalies[0]?.kind).toBe('suspected_missed_period')
    expect(anomalies[0]?.suggestedMissedPeriodDate).toBe('2026-08-29')
  })

  test('flags a moderately long cycle without suggesting a missed period', () => {
    const cycles = deriveCycles(periodStarts('2026-01-01', [28, 28, 28, 37]), '2026-06-01')
    const { anomalies } = analyseCycles(cycles, [], aProfile())

    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]?.kind).toBe('unusually_long')
    expect(anomalies[0]?.suggestedMissedPeriodDate).toBeNull()
  })

  test('flags an unusually short cycle', () => {
    const cycles = deriveCycles(periodStarts('2026-01-01', [28, 28, 28, 18]), '2026-06-01')
    const { anomalies } = analyseCycles(cycles, [], aProfile())

    expect(anomalies[0]?.kind).toBe('unusually_short')
  })

  test('leaves an ordinary run of cycles unflagged', () => {
    const cycles = deriveCycles(periodStarts('2026-01-01', [28, 30, 27, 29]), '2026-06-01')
    const { anomalies } = analyseCycles(cycles, [], aProfile())

    expect(anomalies).toEqual([])
  })

  test('does not flag the open current cycle, however long it has run', () => {
    const cycles = deriveCycles([aPeriodStart('2026-01-01')], '2026-09-20')
    const { anomalies } = analyseCycles(cycles, [], aProfile())

    expect(anomalies).toEqual([])
  })
})

describe('analyseCycles resolutions', () => {
  test('keeps a cycle the user called a one-off out of the baseline', () => {
    const cycles = deriveCycles(periodStarts('2026-01-01', [28, 28, 28, 40]), '2026-06-01')
    const starts = cycles.map((c) => c.startDate)
    const { baseline } = analyseCycles(
      cycles,
      [aResolution(starts[3] as string, 'one_off')],
      aProfile(),
    )

    expect(baseline.length).toBe(28)
  })

  test('takes a cycle the user called their new normal into the baseline', () => {
    const cycles = deriveCycles(periodStarts('2026-01-01', [28, 40, 40, 40]), '2026-06-01')
    const resolutions = cycles
      .filter((c) => c.length === 40)
      .map((c) => aResolution(c.startDate, 'new_normal', { excludedFromBaseline: false }))
    const { baseline } = analyseCycles(cycles, resolutions, aProfile())

    expect(baseline.length).toBe(40)
  })

  test('stops asking about a cycle the user has already answered', () => {
    const cycles = deriveCycles(periodStarts('2026-01-01', [28, 28, 28, 40]), '2026-06-01')
    const last = cycles[3]?.startDate as string
    const { anomalies } = analyseCycles(cycles, [aResolution(last, 'one_off')], aProfile())

    expect(anomalies).toEqual([])
  })
})

describe('analyseCycles baseline shift', () => {
  test('accepts a new normal after two consecutive cycles deviate the same way', () => {
    const cycles = deriveCycles(periodStarts('2026-01-01', [28, 28, 28, 40, 40]), '2026-09-01')
    const { baseline, anomalies } = analyseCycles(cycles, [], aProfile())

    expect(baseline.length).toBe(40)
    expect(baseline.source).toBe('shifted')
    expect(anomalies.every((a) => a.autoAccepted)).toBe(true)
  })

  test('does not shift when the two deviations point opposite ways', () => {
    const cycles = deriveCycles(periodStarts('2026-01-01', [28, 28, 28, 40, 18]), '2026-09-01')
    const { baseline } = analyseCycles(cycles, [], aProfile())

    expect(baseline.length).toBe(28)
    expect(baseline.source).not.toBe('shifted')
  })
})

describe('learnLutealLength', () => {
  test('uses the profile default when no ovulation has been confirmed', () => {
    const cycles = deriveCycles(periodStarts('2026-01-01', [28, 28]), '2026-06-01')

    expect(learnLutealLength(cycles, aProfile({ lutealLength: 14 }))).toBe(14)
  })

  test('measures the luteal phase from a confirmed ovulation to the next period', () => {
    // Ovulation confirmed on 2026-01-17; next period starts 2026-01-29 → 12 days.
    const logs = [
      aPeriodStart('2026-01-01'),
      aConfirmedOvulation('2026-01-17'),
      aPeriodStart('2026-01-29'),
    ]
    const cycles = deriveCycles(logs, '2026-02-10')

    expect(learnLutealLength(cycles, aProfile({ lutealLength: 14 }))).toBe(12)
  })

  test('takes the median across several confirmed cycles', () => {
    const logs = [
      aPeriodStart('2026-01-01'),
      aConfirmedOvulation('2026-01-16'), // 13 days to 2026-01-29
      aPeriodStart('2026-01-29'),
      aConfirmedOvulation('2026-02-13'), // 12 days to 2026-02-25
      aPeriodStart('2026-02-25'),
      aConfirmedOvulation('2026-03-12'), // 13 days to 2026-03-25
      aPeriodStart('2026-03-25'),
    ]
    const cycles = deriveCycles(logs, '2026-04-01')

    expect(learnLutealLength(cycles, aProfile())).toBe(13)
  })

  test('ignores a confirmed ovulation in the open current cycle', () => {
    const logs = [aPeriodStart('2026-09-01'), aConfirmedOvulation('2026-09-15')]
    const cycles = deriveCycles(logs, '2026-09-20')

    expect(learnLutealLength(cycles, aProfile({ lutealLength: 14 }))).toBe(14)
  })

  test('clamps an implausible observation into the physiological range', () => {
    // A "confirmed" ovulation two days before the next period.
    const logs = [
      aPeriodStart('2026-01-01'),
      aConfirmedOvulation('2026-01-27'),
      aPeriodStart('2026-01-29'),
    ]
    const cycles = deriveCycles(logs, '2026-02-10')

    expect(learnLutealLength(cycles, aProfile())).toBe(9)
  })
})
