import { useCycleStore } from '@/store/useCycleStore'
import { CycleWheel, bandColour, wheelLegend } from '@/components/CycleWheel'
import { Icon } from '@/components/Icon'
import { AnomalyPrompt } from '@/components/AnomalyPrompt'
import { GuidanceCard } from '@/components/GuidanceCard'
import {
  CONFIDENCE_LABEL,
  PHASE_ICON,
  PHASE_LABEL,
  confidenceNote,
} from '@/lib/guidance'
import { dayCount, formatLong, formatRange, formatShort, greeting } from '@/lib/format'
import { diffDays } from '@/lib/date'

export function TodayScreen() {
  const { engine, profile, today } = useCycleStore()
  const { prediction } = engine
  const day = engine.assessDay(today)
  const currentCycle = engine.cycles.find((c) => c.isCurrent)

  const name = profile.displayName?.trim()
  const phase = prediction.phase

  return (
    <div className="screen">
      <div className="stack stagger">
        <header>
          <p className="greeting">
            {greeting()}
            {name ? `, ${name}` : ''} 🌸
          </p>
          <h1 className="title-lg">{formatLong(today)}</h1>
        </header>

        {prediction.anomalies
          .filter((a) => !a.autoAccepted)
          .map((anomaly) => (
            <AnomalyPrompt key={anomaly.cycleStart} anomaly={anomaly} />
          ))}

        {currentCycle && phase ? (
          <section className="hero">
            <span className="hero__blob hero__blob--tr" />
            <span className="hero__blob hero__blob--bl" />

            <div className="hero__phase">
              <Icon name={PHASE_ICON[phase] ?? 'sun'} size={22} />
              <span className="eyebrow">{PHASE_LABEL[phase]}</span>
            </div>

            <div style={{ position: 'relative', marginTop: 10 }}>
              <CycleWheel
                prediction={prediction}
                cycleStart={currentCycle.startDate}
                periodLength={prediction.periodLength}
              />
            </div>

            <div className="hero__legend">
              {wheelLegend(prediction.confidence === 'learning').map(({ band, label }) => (
                <span className="legend-item" key={band}>
                  <span
                    className="legend-dot"
                    style={{
                      background: bandColour(band, prediction.confidence === 'learning'),
                    }}
                  />
                  {label}
                </span>
              ))}
            </div>
          </section>
        ) : (
          <section className="card center stack">
            <p className="title-md">Nothing logged yet</p>
            <p className="muted">
              Tap Log day and record when your period started. Cycle needs that one date
              before it can tell you anything.
            </p>
          </section>
        )}

        {prediction.nextPeriod && prediction.ovulation && (
          <div className="stat-grid">
            <div className="card card--tight">
              <div className="stat__label">
                <Icon name="calendar-clock" size={17} />
                Next period
              </div>
              <div className="stat__value">
                {dayCount(Math.max(0, diffDays(today, prediction.nextPeriod.likely)))}
              </div>
              <div className="stat__sub">
                {formatRange(prediction.nextPeriod.earliest, prediction.nextPeriod.latest)}
              </div>
            </div>

            <div className="card card--tight">
              <div className="stat__label">
                <Icon name="sparkles" size={17} />
                Ovulation
              </div>
              <div className="stat__value">
                {prediction.ovulationConfirmed
                  ? 'Logged'
                  : dayCount(Math.max(0, diffDays(today, prediction.ovulation.likely)))}
              </div>
              <div className="stat__sub">{formatShort(prediction.ovulation.likely)}</div>
            </div>
          </div>
        )}

        <GuidanceCard day={day} prediction={prediction} />

        {prediction.protectionWindow && prediction.ovulation && (
          <section className="card">
            <div className="stat__label">
              <Icon name="sparkles" size={17} />
              Use protection this cycle
            </div>
            <p className="title-md" style={{ marginTop: 6 }}>
              {formatRange(
                prediction.protectionWindow.start,
                prediction.protectionWindow.end,
              )}
            </p>
            <p className="muted">
              Ovulation {prediction.ovulationConfirmed ? 'logged' : 'estimated'}{' '}
              {formatShort(prediction.ovulation.likely)}
              {!prediction.ovulationConfirmed && (
                <>
                  {' '}
                  ({formatRange(prediction.ovulation.earliest, prediction.ovulation.latest)})
                </>
              )}
            </p>
            <p className="fine-print" style={{ marginTop: 10 }}>
              This window is wider than the biological fertile window on purpose — it
              includes how uncertain the estimate currently is.
            </p>
          </section>
        )}

        <section className="card card--tight">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="label">{CONFIDENCE_LABEL[prediction.confidence]}</span>
            <span className="label">
              {Math.round(prediction.baseline.length)}-day cycle · {prediction.lutealLength}-day
              luteal
            </span>
          </div>
          <p className="fine-print" style={{ marginTop: 6 }}>
            {confidenceNote(prediction)}
          </p>
        </section>
      </div>
    </div>
  )
}
