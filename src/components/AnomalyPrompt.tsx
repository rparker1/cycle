/**
 * The "something out of the ordinary happened" prompt.
 *
 * This is the user-facing half of the fix for a single late period wrecking
 * every prediction after it. The engine has already set the odd cycle aside;
 * this asks what it was, so the baseline can be right rather than merely
 * cautious.
 */

import { useState } from 'react'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { useCycleStore } from '@/store/useCycleStore'
import { formatDayMonth, formatShort } from '@/lib/format'
import type { Anomaly } from '@/engine/types'

interface Props {
  anomaly: Anomaly
}

export function AnomalyPrompt({ anomaly }: Props) {
  const resolveCycle = useCycleStore((s) => s.resolveCycle)
  const insertMissedPeriod = useCycleStore((s) => s.insertMissedPeriod)
  const [open, setOpen] = useState(false)
  const [missedDate, setMissedDate] = useState(anomaly.suggestedMissedPeriodDate ?? '')

  const longer = anomaly.observedLength > anomaly.baselineAtDetection
  const usual = Math.round(anomaly.baselineAtDetection)

  return (
    <>
      <section className="notice">
        <Icon name="alert" size={22} strokeWidth={2} />
        <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 700 }}>
            That cycle ran {anomaly.observedLength} days
          </p>
          <p style={{ fontSize: 15, marginTop: 2 }}>
            {longer ? 'Longer' : 'Shorter'} than your usual {usual}. It's been left out of
            your predictions until you tell us what happened.
          </p>
          <button
            className="btn btn--quiet"
            style={{ marginTop: 12, minHeight: 44 }}
            onClick={() => setOpen(true)}
          >
            Sort this out
          </button>
        </div>
      </section>

      <Sheet open={open} title="What happened?" onClose={() => setOpen(false)}>
        <p className="muted" style={{ marginBottom: 16 }}>
          The cycle starting {formatDayMonth(anomaly.cycleStart)} was{' '}
          {anomaly.observedLength} days instead of about {usual}.
        </p>

        <div className="stack">
          {anomaly.kind === 'suspected_missed_period' && (
            <div className="card stack">
              <div>
                <p className="option__title">I missed logging a period</p>
                <p className="option__sub">
                  A {anomaly.observedLength}-day gap often means one period went
                  unrecorded. Adding it splits this into two normal cycles.
                </p>
              </div>
              <label className="field">
                <span className="label">When did it start?</span>
                <input
                  type="date"
                  value={missedDate}
                  max={anomaly.cycleStart}
                  onChange={(e) => setMissedDate(e.target.value)}
                />
              </label>
              <button
                className="btn btn--primary btn--block"
                disabled={!missedDate}
                onClick={async () => {
                  await insertMissedPeriod(missedDate, anomaly.cycleStart)
                  setOpen(false)
                }}
              >
                Add period on {missedDate ? formatShort(missedDate) : '—'}
              </button>
            </div>
          )}

          <button
            className="option"
            onClick={async () => {
              await resolveCycle(anomaly.cycleStart, 'one_off', {
                observedLength: anomaly.observedLength,
              })
              setOpen(false)
            }}
          >
            <span
              className="option__icon"
              style={{ background: 'var(--surface-sunken)', color: 'var(--ink-soft)' }}
            >
              <Icon name="moon" size={22} />
            </span>
            <span>
              <span className="option__title">That was a one-off</span>
              <span className="option__sub">
                Stress, illness, travel. Keep it out of my predictions.
              </span>
            </span>
          </button>

          <button
            className="option"
            onClick={async () => {
              await resolveCycle(anomaly.cycleStart, 'new_normal', {
                observedLength: anomaly.observedLength,
              })
              setOpen(false)
            }}
          >
            <span
              className="option__icon"
              style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
            >
              <Icon name="chart" size={22} />
            </span>
            <span>
              <span className="option__title">This is my new normal</span>
              <span className="option__sub">
                My cycles really have changed. Use this going forward.
              </span>
            </span>
          </button>

          <button
            className="option"
            onClick={async () => {
              await resolveCycle(anomaly.cycleStart, 'mislogged', {
                observedLength: anomaly.observedLength,
              })
              setOpen(false)
            }}
          >
            <span
              className="option__icon"
              style={{ background: 'var(--surface-sunken)', color: 'var(--ink-soft)' }}
            >
              <Icon name="close" size={22} />
            </span>
            <span>
              <span className="option__title">I logged it wrong</span>
              <span className="option__sub">
                Ignore this cycle. You can fix the dates in the calendar.
              </span>
            </span>
          </button>
        </div>
      </Sheet>
    </>
  )
}
