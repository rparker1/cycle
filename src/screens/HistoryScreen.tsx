import { useMemo } from 'react'
import { useCycleStore } from '@/store/useCycleStore'
import { AnomalyPrompt } from '@/components/AnomalyPrompt'
import { formatDayMonth, formatShort } from '@/lib/format'
import { CONFIDENCE_LABEL, confidenceNote } from '@/lib/guidance'

export function HistoryScreen() {
  const { engine, resolutions } = useCycleStore()
  const { prediction } = engine

  const completed = useMemo(
    () => engine.cycles.filter((c) => c.length !== null).reverse(),
    [engine.cycles],
  )

  const resolutionFor = (start: string) => resolutions.find((r) => r.cycleStart === start)
  const anomalyFor = (start: string) => prediction.anomalies.find((a) => a.cycleStart === start)

  return (
    <div className="screen screen--flush">
      <div className="stack">
        <h1 className="title-lg">History</h1>

        {prediction.anomalies
          .filter((a) => !a.autoAccepted)
          .map((a) => (
            <AnomalyPrompt key={a.cycleStart} anomaly={a} />
          ))}

        <section className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="label">{CONFIDENCE_LABEL[prediction.confidence]}</span>
            <span className="label">
              {Math.round(prediction.baseline.length)} ± {Math.round(prediction.baseline.spread)}{' '}
              days
            </span>
          </div>
          <p className="fine-print" style={{ marginTop: 6 }}>
            {confidenceNote(prediction)}
          </p>
        </section>

        {completed.length >= 2 ? (
          <section className="card">
            <p className="title-md" style={{ marginBottom: 10 }}>
              Cycle length
            </p>
            <TrendChart
              lengths={[...completed].reverse().map((c) => c.length as number)}
              baseline={prediction.baseline.length}
            />
            <p className="fine-print" style={{ marginTop: 8 }}>
              The dashed line is your baseline — the median of your recent cycles, which is
              why one unusual month doesn't move it.
            </p>
          </section>
        ) : (
          <section className="card">
            <p className="muted">
              Two logged cycles are needed before there's a trend worth drawing.
            </p>
          </section>
        )}

        <section className="card">
          <p className="title-md" style={{ marginBottom: 4 }}>
            Your cycles
          </p>
          {completed.length === 0 && <p className="muted">Nothing completed yet.</p>}
          {completed.map((cycle) => {
            const resolution = resolutionFor(cycle.startDate)
            const anomaly = anomalyFor(cycle.startDate)
            return (
              <div className="history-row" key={cycle.startDate}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {formatDayMonth(cycle.startDate)}
                    {cycle.endDate && (
                      <span className="muted"> – {formatShort(cycle.endDate)}</span>
                    )}
                  </div>
                  <div className="fine-print">
                    {cycle.confirmedOvulation
                      ? `Ovulation logged ${formatShort(cycle.confirmedOvulation)}`
                      : 'No ovulation logged'}
                  </div>
                </div>
                <div className="row" style={{ gap: 8, flex: 'none' }}>
                  {anomaly && !anomaly.autoAccepted && <span className="badge">Unusual</span>}
                  {anomaly?.autoAccepted && <span className="badge">New normal</span>}
                  {resolution?.excludedFromBaseline && (
                    <span className="badge badge--excluded">Excluded</span>
                  )}
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {cycle.length}d
                  </span>
                </div>
              </div>
            )
          })}
        </section>
      </div>
    </div>
  )
}

/**
 * Cycle length over time.
 *
 * Hand-drawn SVG rather than a charting library — one series, six points, and
 * a dependency would cost more than the chart.
 */
function TrendChart({ lengths, baseline }: { lengths: number[]; baseline: number }) {
  const W = 320
  const H = 150
  const PAD = { top: 12, right: 10, bottom: 24, left: 30 }

  const min = Math.min(...lengths, baseline) - 3
  const max = Math.max(...lengths, baseline) + 3
  const span = Math.max(1, max - min)

  const x = (i: number) =>
    PAD.left +
    (lengths.length === 1 ? 0 : (i / (lengths.length - 1)) * (W - PAD.left - PAD.right))
  const y = (v: number) => PAD.top + (1 - (v - min) / span) * (H - PAD.top - PAD.bottom)

  const line = lengths.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ')
  const area = `${line} L ${x(lengths.length - 1)} ${H - PAD.bottom} L ${x(0)} ${H - PAD.bottom} Z`

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Cycle lengths: ${lengths.join(', ')} days`}
    >
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--rose)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--rose)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <line
        x1={PAD.left}
        x2={W - PAD.right}
        y1={y(baseline)}
        y2={y(baseline)}
        stroke="var(--ink-faint)"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      <text x={2} y={y(baseline) + 4} fontSize="10" fill="var(--ink-faint)" fontWeight="600">
        {Math.round(baseline)}d
      </text>

      <path d={area} fill="url(#trendFill)" />
      <path
        d={line}
        fill="none"
        stroke="var(--rose)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {lengths.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r="3.4" fill="var(--surface)" stroke="var(--rose)" strokeWidth="2" />
          <text
            x={x(i)}
            y={H - 8}
            fontSize="10"
            textAnchor="middle"
            fill="var(--ink-faint)"
            fontWeight="600"
          >
            {v}
          </text>
        </g>
      ))}
    </svg>
  )
}
