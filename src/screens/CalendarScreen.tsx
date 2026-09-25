import { useMemo, useState } from 'react'
import { useCycleStore } from '@/store/useCycleStore'
import { Icon } from '@/components/Icon'
import { DayDetailSheet } from '@/components/DayDetailSheet'
import { bandColour } from '@/components/CycleWheel'
import { addDays, parseIso, toIso } from '@/lib/date'
import { formatMonthYear } from '@/lib/format'
import { isSpottingOnly } from '@/engine/logging'
import type { IsoDate } from '@/engine/types'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** The 42 cells of a month grid, padded into whole weeks starting Sunday. */
function monthGrid(anchor: IsoDate): IsoDate[] {
  const d = parseIso(anchor)
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const start = addDays(toIso(first), -first.getDay())
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export function CalendarScreen() {
  const { engine, today, logs } = useCycleStore()
  const [anchor, setAnchor] = useState<IsoDate>(today)
  const [selected, setSelected] = useState<IsoDate | null>(null)

  const grid = useMemo(() => monthGrid(anchor), [anchor])
  const logsByDate = useMemo(() => new Map(logs.map((l) => [l.logDate, l])), [logs])
  const anchorMonth = parseIso(anchor).getMonth()

  const shiftMonth = (by: number) => {
    const d = parseIso(anchor)
    setAnchor(toIso(new Date(d.getFullYear(), d.getMonth() + by, 1)))
  }

  return (
    <div className="screen screen--flush">
      <h1 className="title-lg" style={{ marginBottom: 16 }}>
        Calendar
      </h1>

      <div className="cal__head">
        <button className="cal__nav" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          <Icon name="chevron-left" size={19} strokeWidth={2.2} />
        </button>
        <span className="title-md">{formatMonthYear(anchor)}</span>
        <button className="cal__nav" onClick={() => shiftMonth(1)} aria-label="Next month">
          <Icon name="chevron-right" size={19} strokeWidth={2.2} />
        </button>
      </div>

      <div className="cal__weekdays" aria-hidden="true">
        {WEEKDAYS.map((w, i) => (
          <span className="cal__weekday" key={`${w}-${i}`}>
            {w}
          </span>
        ))}
      </div>

      <div className="cal__grid" role="grid">
        {grid.map((date) => {
          const day = engine.assessDay(date)
          const spotting = isSpottingOnly(logsByDate.get(date))
          const outside = parseIso(date).getMonth() !== anchorMonth

          const classes = ['day']
          if (outside) classes.push('day--outside')
          if (day.isPeriod) classes.push('day--period')
          else if (day.isOvulation) classes.push('day--ovulation')
          else if (day.isFertile) classes.push('day--fertile')
          else if (day.isPredictedPeriod) classes.push('day--predicted')
          if (date === today) classes.push('day--today')

          return (
            <button
              key={date}
              className={classes.join(' ')}
              onClick={() => setSelected(date)}
              aria-label={date}
            >
              {parseIso(date).getDate()}
              {day.isFertile && !day.isOvulation && <span className="day__dot" />}
              {spotting && <span className="day__spot" aria-label="Spotting" />}
              {day.isOvulation && (
                <span className="day__spark">
                  <Icon name="sparkles" size={11} strokeWidth={2.4} />
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="legend-row">
        {(
          [
            ['period', 'Period'],
            ['fertile', 'Fertile'],
            ['ovulation', 'Ovulation'],
          ] as const
        ).map(([band, label]) => (
          <span className="legend-item" key={band}>
            <span
              className="legend-dot"
              style={{ background: bandColour(band), width: 11, height: 11 }}
            />
            {label}
          </span>
        ))}
        {/* Only offered once the engine has enough history to rate a day
            lower risk. Advertising a colour no day can earn is a small lie. */}
        {engine.prediction.confidence !== 'learning' && (
          <span className="legend-item">
            <span
              className="legend-dot"
              style={{ background: 'var(--green-soft)', width: 11, height: 11 }}
            />
            Lower risk
          </span>
        )}
        <span className="legend-item">
          <span className="legend-dot" style={{ background: 'var(--rose)', width: 7, height: 7 }} />
          Spotting
        </span>
        <span className="legend-item">
          <span
            className="legend-dot"
            style={{
              width: 11,
              height: 11,
              border: '1.5px dashed var(--rose-deep)',
              background: 'transparent',
            }}
          />
          Predicted period
        </span>
      </div>

      <DayDetailSheet date={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
