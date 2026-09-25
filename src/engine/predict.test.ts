import { describe, expect, test } from 'vitest'
import { createEngine } from './predict'
import {
  aConfirmedOvulation,
  aLog,
  aPeriodDay,
  aPeriodStart,
  aProfile,
  periodStarts,
} from './__testutils__/fixtures'
import type { DayLog, EngineInput, Profile } from './types'

const input = (
  logs: DayLog[],
  today: string,
  profile: Profile = aProfile(),
): EngineInput => ({ today, logs, resolutions: [], profile })

/** Four regular 28-day cycles, currently on cycle day 9. */
const regular = () =>
  createEngine(input(periodStarts('2026-01-01', [28, 28, 28, 28]), '2026-05-01'))

describe('predict with no history', () => {
  test('reports nothing rather than guessing when nothing is logged', () => {
    const { prediction } = createEngine(input([], '2026-09-20'))

    expect(prediction.cycleDay).toBeNull()
    expect(prediction.phase).toBeNull()
    expect(prediction.nextPeriod).toBeNull()
    expect(prediction.ovulation).toBeNull()
    expect(prediction.confidence).toBe('learning')
  })

  test('predicts from the onboarding answer after a single logged period', () => {
    const { prediction } = createEngine(
      input([aPeriodStart('2026-09-01')], '2026-09-01', aProfile({ avgCycleLength: 28 })),
    )

    expect(prediction.cycleDay).toBe(1)
    expect(prediction.nextPeriod?.likely).toBe('2026-09-29')
  })
})

describe('cycle day', () => {
  test('counts the first day of bleeding as day one', () => {
    const { prediction } = createEngine(input([aPeriodStart('2026-09-01')], '2026-09-01'))
    expect(prediction.cycleDay).toBe(1)
  })

  test('counts forward from the period start', () => {
    const { prediction } = createEngine(input([aPeriodStart('2026-09-01')], '2026-09-20'))
    expect(prediction.cycleDay).toBe(20)
  })
})

describe('ovulation prediction', () => {
  // Anchored backwards from the next period by the luteal length, not
  // forwards as cycleLength − 14. The luteal phase is the stabler half.
  test('sits one luteal length before the predicted next period', () => {
    const { prediction } = createEngine(
      input(periodStarts('2026-01-01', [28, 28, 28, 28]), '2026-05-01'),
    )

    expect(prediction.nextPeriod?.likely).toBe('2026-05-21')
    expect(prediction.ovulation?.likely).toBe('2026-05-07')
  })

  test('uses a learned luteal length rather than the default', () => {
    const logs = [
      aPeriodStart('2026-01-01'),
      aConfirmedOvulation('2026-01-17'), // 12-day luteal phase
      aPeriodStart('2026-01-29'),
      aConfirmedOvulation('2026-02-14'), // 12-day luteal phase
      aPeriodStart('2026-02-26'),
    ]
    const { prediction } = createEngine(input(logs, '2026-03-01'))

    expect(prediction.lutealLength).toBe(12)
    expect(prediction.nextPeriod?.likely).toBe('2026-03-26')
    expect(prediction.ovulation?.likely).toBe('2026-03-14')
  })

  test('a confirmed ovulation this cycle overrides the prediction', () => {
    const logs = [...periodStarts('2026-01-01', [28, 28, 28, 28]), aConfirmedOvulation('2026-05-01')]
    const { prediction } = createEngine(input(logs, '2026-05-02'))

    expect(prediction.ovulationConfirmed).toBe(true)
    expect(prediction.ovulation?.likely).toBe('2026-05-01')
  })
})

describe('prediction ranges', () => {
  test('reports the next period as a window, not a single date', () => {
    const { prediction } = regular()
    const next = prediction.nextPeriod

    expect(next?.earliest).toBe('2026-05-20')
    expect(next?.likely).toBe('2026-05-21')
    expect(next?.latest).toBe('2026-05-22')
  })

  test('widens the window when the history is more variable', () => {
    const { prediction } = createEngine(
      input(periodStarts('2026-01-01', [26, 31, 27, 32]), '2026-05-01'),
    )
    const next = prediction.nextPeriod

    expect(next).not.toBeNull()
    expect(next?.earliest).not.toBe(next?.likely)
    expect(prediction.baseline.spread).toBeGreaterThan(1)
  })
})

describe('fertile and protection windows', () => {
  test('the biological window runs from five days before ovulation to one after', () => {
    const { prediction } = regular()

    expect(prediction.fertileWindow).toEqual({ start: '2026-05-02', end: '2026-05-08' })
  })

  // Uncertainty must always widen caution and never narrow it.
  test('the protection window is wider than the biological one while unconfirmed', () => {
    const { prediction } = regular()

    expect(prediction.protectionWindow).toEqual({ start: '2026-05-01', end: '2026-05-09' })
  })

  test('confirming ovulation narrows the protection window to the biological one', () => {
    const logs = [...periodStarts('2026-01-01', [28, 28, 28, 28]), aConfirmedOvulation('2026-05-07')]
    const { prediction } = createEngine(input(logs, '2026-05-08'))

    expect(prediction.ovulationConfirmed).toBe(true)
    expect(prediction.protectionWindow).toEqual(prediction.fertileWindow)
  })

  test('a more variable history widens the protection window further', () => {
    const steady = regular().prediction.protectionWindow
    const erratic = createEngine(
      input(periodStarts('2026-01-01', [24, 32, 25, 33]), '2026-05-01'),
    ).prediction.protectionWindow

    const span = (w: typeof steady) =>
      w === null ? 0 : new Date(w.end).getTime() - new Date(w.start).getTime()

    expect(span(erratic)).toBeGreaterThan(span(steady))
  })
})

describe('confidence', () => {
  test('is learning below three cycles of history', () => {
    const { prediction } = createEngine(input(periodStarts('2026-01-01', [28]), '2026-02-01'))
    expect(prediction.confidence).toBe('learning')
  })

  test('is fair between three and five cycles', () => {
    const { prediction } = createEngine(
      input(periodStarts('2026-01-01', [28, 28, 28, 28]), '2026-05-01'),
    )
    expect(prediction.confidence).toBe('fair')
  })

  test('is good at six cycles or more', () => {
    const { prediction } = createEngine(
      input(periodStarts('2025-09-01', [28, 28, 28, 28, 28, 28]), '2026-03-15'),
    )
    expect(prediction.confidence).toBe('good')
  })
})

describe('assessDay risk', () => {
  test('is high inside the biological fertile window', () => {
    expect(regular().assessDay('2026-05-05').risk).toBe('high')
  })

  test('is elevated inside the uncertainty buffer', () => {
    expect(regular().assessDay('2026-05-01').risk).toBe('elevated')
  })

  test('is lower outside both, once there is enough history', () => {
    expect(regular().assessDay('2026-05-15').risk).toBe('lower')
  })

  // With one or two cycles the model genuinely cannot distinguish. Showing a
  // green day here would be a fabrication, so it refuses instead.
  test('is unknown rather than lower when history is too thin', () => {
    const engine = createEngine(input([aPeriodStart('2026-09-01')], '2026-09-20'))

    expect(engine.prediction.confidence).toBe('learning')
    expect(engine.assessDay('2026-09-20').risk).toBe('unknown')
  })

  test('still warns inside the fertile window even with thin history', () => {
    const engine = createEngine(input([aPeriodStart('2026-09-01')], '2026-09-20'))

    expect(engine.assessDay('2026-09-15').risk).toBe('high')
  })
})

describe('assessDay phases', () => {
  test('marks the early days of a cycle as menstrual', () => {
    expect(regular().assessDay('2026-04-24').phase).toBe('menstrual')
  })

  test('marks the run-up to ovulation as follicular', () => {
    expect(regular().assessDay('2026-05-01').phase).toBe('follicular')
  })

  test('marks the predicted ovulation day distinctly', () => {
    const day = regular().assessDay('2026-05-07')

    expect(day.phase).toBe('ovulation')
    expect(day.isOvulation).toBe(true)
  })

  test('marks the days after ovulation as luteal', () => {
    expect(regular().assessDay('2026-05-15').phase).toBe('luteal')
  })

  test('reports nothing for a date before any cycle began', () => {
    const day = regular().assessDay('2025-12-01')

    expect(day.cycleDay).toBeNull()
    expect(day.phase).toBeNull()
  })
})

describe('assessDay logged versus predicted', () => {
  test('marks a logged bleeding day as a period day', () => {
    const logs = [aPeriodStart('2026-09-01'), aPeriodDay('2026-09-02')]
    const engine = createEngine(input(logs, '2026-09-10'))

    expect(engine.assessDay('2026-09-02').isPeriod).toBe(true)
    expect(engine.assessDay('2026-09-06').isPeriod).toBe(false)
  })

  test('shades the predicted next period without claiming it happened', () => {
    const day = regular().assessDay('2026-05-21')

    expect(day.isPredictedPeriod).toBe(true)
    expect(day.isPeriod).toBe(false)
  })
})

describe('assessDay current period shading', () => {
  // Logging day one and getting on with your life is the normal case. The
  // calendar should still show the days the period is expected to run.
  test('shades the rest of the expected period as predicted', () => {
    const engine = createEngine(input([aPeriodStart('2026-09-20')], '2026-09-20'))

    expect(engine.assessDay('2026-09-20').isPeriod).toBe(true)
    expect(engine.assessDay('2026-09-22').isPredictedPeriod).toBe(true)
    expect(engine.assessDay('2026-09-24').isPredictedPeriod).toBe(true)
    expect(engine.assessDay('2026-09-25').isPredictedPeriod).toBe(false)
  })

  test('stops shading once the user marks the period finished', () => {
    const logs = [
      aPeriodStart('2026-09-20'),
      aPeriodDay('2026-09-22', { isPeriodEnd: true }),
    ]
    const engine = createEngine(input(logs, '2026-09-25'))

    expect(engine.assessDay('2026-09-24').isPredictedPeriod).toBe(false)
  })

  test('does not shade a logged day as predicted', () => {
    const logs = [aPeriodStart('2026-09-20'), aPeriodDay('2026-09-21')]
    const engine = createEngine(input(logs, '2026-09-25'))

    expect(engine.assessDay('2026-09-21').isPeriod).toBe(true)
    expect(engine.assessDay('2026-09-21').isPredictedPeriod).toBe(false)
  })
})

describe('learned period length', () => {
  test('is reported and used for the assumed period', () => {
    // Two confirmed 3-day periods, then a start-only current cycle.
    const logs = [
      aPeriodStart('2026-07-01'), aPeriodDay('2026-07-02'), aPeriodDay('2026-07-03', { isPeriodEnd: true }),
      aPeriodStart('2026-07-29'), aPeriodDay('2026-07-30'), aPeriodDay('2026-07-31', { isPeriodEnd: true }),
      aPeriodStart('2026-08-26'),
    ]
    const engine = createEngine(input(logs, '2026-08-29', aProfile({ avgPeriodLength: 5 })))
    expect(engine.prediction.periodLength).toBe(3)
    // Day 3 is still menstrual, day 4 is not — with 5 it would be day 5.
    expect(engine.assessDay('2026-08-28').phase).toBe('menstrual')
    expect(engine.assessDay('2026-08-29').phase).toBe('follicular')
  })
})

describe('not-yet answers', () => {
  // Four regular 28-day cycles; the current one started 2026-04-23, so the
  // next period is most likely 2026-05-21 (earliest 05-20, latest 05-22).
  // Spread is 1: the MAD of identical lengths is 0, floored at 1.
  const logs = periodStarts('2026-01-01', [28, 28, 28, 28])

  test('without one, the estimate is unchanged', () => {
    const { prediction } = createEngine(input(logs, '2026-05-20'))
    expect(prediction.nextPeriod).toEqual(prediction.nextPeriodExpected)
  })

  test('moves the earliest and likely dates past the answered day', () => {
    const answered = [...logs, aLog('2026-05-21', { noBleed: true })]
    const { prediction } = createEngine(input(answered, '2026-05-21'))
    expect(prediction.nextPeriodExpected?.likely).toBe('2026-05-21')
    expect(prediction.nextPeriod?.earliest).toBe('2026-05-22')
    expect(prediction.nextPeriod?.likely).toBe('2026-05-22')
    expect(prediction.nextPeriod?.latest).toBe('2026-05-22')
  })

  test('never leaves latest before likely', () => {
    const answered = [...logs, aLog('2026-05-25', { noBleed: true })]
    const { prediction } = createEngine(input(answered, '2026-05-25'))
    expect(prediction.nextPeriod?.likely).toBe('2026-05-26')
    const next = prediction.nextPeriod
    expect(next && next.latest >= next.likely).toBe(true)
  })

  test('does not move ovulation, the fertile window or the protection window', () => {
    const before = createEngine(input(logs, '2026-05-21')).prediction
    const after = createEngine(
      input([...logs, aLog('2026-05-21', { noBleed: true })], '2026-05-21'),
    ).prediction
    expect(after.ovulation).toEqual(before.ovulation)
    expect(after.fertileWindow).toEqual(before.fertileWindow)
    expect(after.protectionWindow).toEqual(before.protectionWindow)
  })

  test('ignores a not-bleeding day from the end of the current period', () => {
    const answered = [...logs, aLog('2026-04-28', { noBleed: true })]
    const { prediction } = createEngine(input(answered, '2026-05-02'))
    expect(prediction.nextPeriod).toEqual(prediction.nextPeriodExpected)
  })
})

describe('late period', () => {
  const logs = periodStarts('2026-01-01', [28, 28, 28, 28])

  test('is not late on the latest expected day', () => {
    const { prediction } = createEngine(input(logs, '2026-05-22'))
    expect(prediction.nextPeriodExpected?.latest).toBe('2026-05-22')
    expect(prediction.periodLate).toBe(false)
  })

  test('is late the day after, and later days become uncertain', () => {
    const engine = createEngine(input(logs, '2026-05-23'))
    expect(engine.prediction.periodLate).toBe(true)
    expect(engine.assessDay('2026-05-23')).toMatchObject({ risk: 'unknown', periodLate: true })
    expect(engine.assessDay('2026-05-28')).toMatchObject({ risk: 'unknown', periodLate: true })
  })

  test('leaves days up to the latest expected day as they were', () => {
    const onTime = createEngine(input(logs, '2026-05-22'))
    const late = createEngine(input(logs, '2026-05-23'))
    for (const d of ['2026-05-02', '2026-05-12', '2026-05-22']) {
      expect(late.assessDay(d)).toEqual(onTime.assessDay(d))
    }
  })
})

describe('spotting', () => {
  const logs = periodStarts('2026-01-01', [28, 28, 28, 28])

  test('mid-cycle spotting changes nothing', () => {
    const before = createEngine(input(logs, '2026-05-02')).prediction
    const after = createEngine(
      input([...logs, aLog('2026-05-02', { flow: 'spotting', noBleed: true })], '2026-05-02'),
    ).prediction
    expect(after).toEqual(before)
  })

  test('spotting when the period is due moves the estimate on, like not yet', () => {
    const { prediction } = createEngine(
      input([...logs, aLog('2026-05-21', { flow: 'spotting', noBleed: true })], '2026-05-21'),
    )
    expect(prediction.nextPeriod?.likely).toBe('2026-05-22')
    expect(prediction.fertileWindow).toEqual(
      createEngine(input(logs, '2026-05-21')).prediction.fertileWindow,
    )
  })
})
