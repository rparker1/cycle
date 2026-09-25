/**
 * The cycle wheel.
 *
 * One ring, one revolution per cycle, segments coloured by what each day
 * means. The marker shows where today sits. It is the first thing on the Home
 * screen because "where am I?" is the question the app exists to answer.
 */

import { useMemo } from 'react'
import type { Prediction } from '@/engine/types'
import { addDays, diffDays } from '@/lib/date'

type Band = 'period' | 'fertile' | 'ovulation' | 'low'

const BAND_COLOUR: Record<Band, string> = {
  period: '#cc5e74',
  fertile: '#e0a83f',
  ovulation: '#dd7526',
  low: '#a5cda8',
}

/**
 * Below three logged cycles the engine reports risk as `unknown`, so the wheel
 * must not paint those days a reassuring green. A neutral band and an honest
 * label keep the picture and the words saying the same thing.
 */
const UNKNOWN_COLOUR = '#cfc4c7'

export const bandColour = (band: Band, learning = false): string =>
  band === 'low' && learning ? UNKNOWN_COLOUR : BAND_COLOUR[band]

export function wheelLegend(learning: boolean): { band: Band; label: string }[] {
  return [
    { band: 'period', label: 'Period' },
    { band: 'fertile', label: 'Fertile' },
    { band: 'ovulation', label: 'Ovulation' },
    { band: 'low', label: learning ? 'Not yet known' : 'Lower risk' },
  ]
}

interface Props {
  prediction: Prediction
  cycleStart: string
  periodLength: number
  size?: number
}

const CENTRE = 50
const RADIUS = 40
const THICKNESS = 9
/** Degrees of empty space between colour runs, so bands read as distinct. */
const GAP = 2.2

function polar(angleDeg: number, radius: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return [CENTRE + radius * Math.cos(rad), CENTRE + radius * Math.sin(rad)]
}

function arcPath(startDeg: number, endDeg: number): string {
  const sweep = endDeg - startDeg
  // A full circle cannot be drawn as one arc; nudge it just short.
  const safeEnd = sweep >= 360 ? startDeg + 359.9 : endDeg
  const [x1, y1] = polar(startDeg, RADIUS)
  const [x2, y2] = polar(safeEnd, RADIUS)
  const largeArc = safeEnd - startDeg > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x2} ${y2}`
}

export function CycleWheel({ prediction, cycleStart, periodLength, size = 224 }: Props) {
  const length = Math.max(1, Math.round(prediction.baseline.length))
  const cycleDay = prediction.cycleDay ?? 1

  const runs = useMemo(() => {
    const bandFor = (dayIndex: number): Band => {
      const date = addDays(cycleStart, dayIndex)
      if (dayIndex < periodLength) return 'period'
      if (prediction.ovulation && date === prediction.ovulation.likely) return 'ovulation'
      if (
        prediction.fertileWindow &&
        date >= prediction.fertileWindow.start &&
        date <= prediction.fertileWindow.end
      ) {
        return 'fertile'
      }
      return 'low'
    }

    const out: { band: Band; from: number; to: number }[] = []
    for (let i = 0; i < length; i++) {
      const band = bandFor(i)
      const last = out[out.length - 1]
      if (last && last.band === band) last.to = i
      else out.push({ band, from: i, to: i })
    }
    return out
  }, [cycleStart, length, periodLength, prediction.fertileWindow, prediction.ovulation])

  const learning = prediction.confidence === 'learning'
  const degPerDay = 360 / length
  const markerAngle = ((cycleDay - 0.5) * degPerDay) % 360
  const [mx, my] = polar(markerAngle, RADIUS)

  const ovulationDay = prediction.ovulation
    ? diffDays(cycleStart, prediction.ovulation.likely)
    : null
  const ovulationMarker =
    ovulationDay !== null && ovulationDay >= 0 && ovulationDay < length
      ? polar((ovulationDay + 0.5) * degPerDay, RADIUS)
      : null

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Cycle day ${cycleDay} of about ${length}`}
      style={{ display: 'block', margin: '0 auto' }}
    >
      <circle
        cx={CENTRE}
        cy={CENTRE}
        r={RADIUS}
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth={THICKNESS}
      />

      {runs.map((run, i) => {
        const start = run.from * degPerDay + GAP / 2
        const end = (run.to + 1) * degPerDay - GAP / 2
        if (end <= start) return null
        return (
          <path
            key={`${run.band}-${run.from}`}
            className="wheel__run"
            // Normalised length, so the draw-in animation works for any arc.
            pathLength={1}
            d={arcPath(start, end)}
            fill="none"
            stroke={bandColour(run.band, learning)}
            strokeWidth={THICKNESS}
            strokeLinecap="round"
            style={{ animationDelay: `${i * 90}ms` }}
          />
        )
      })}

      {ovulationMarker && (
        <circle cx={ovulationMarker[0]} cy={ovulationMarker[1]} r={2} fill="#fff" />
      )}

      <circle cx={CENTRE} cy={CENTRE} r={RADIUS - THICKNESS / 2 - 3.5} fill="#fff" />

      <circle className="wheel__pulse" cx={mx} cy={my} r={4.6} fill="#fff" />

      <circle
        cx={mx}
        cy={my}
        r={4.6}
        fill="#fff"
        stroke="rgba(62,48,52,0.85)"
        strokeWidth={1.4}
        style={{ transition: 'all .5s cubic-bezier(.32,.72,0,1)' }}
      />

      <text
        x={CENTRE}
        y={CENTRE - 9}
        textAnchor="middle"
        fill="#7c6b70"
        fontSize="5.6"
        fontWeight="700"
        letterSpacing="0.9"
        fontFamily="inherit"
      >
        CYCLE DAY
      </text>
      <text
        x={CENTRE}
        y={CENTRE + 8}
        textAnchor="middle"
        fill="#3e3034"
        fontSize="21"
        fontWeight="700"
        fontFamily="inherit"
      >
        {cycleDay}
      </text>
      <text
        x={CENTRE}
        y={CENTRE + 17}
        textAnchor="middle"
        fill="#7c6b70"
        fontSize="5.4"
        fontWeight="600"
        fontFamily="inherit"
      >
        of about {length}
      </text>
    </svg>
  )
}
