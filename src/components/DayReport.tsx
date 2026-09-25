/**
 * The questions a day sheet asks. Presentational: each takes the day's log
 * and callbacks, and the sheet decides which one to show via `dayPrompt`.
 */

import { Icon } from './Icon'
import { SYMPTOMS } from '@/lib/guidance'
import { isSpottingOnly } from '@/engine/logging'
import { formatRange } from '@/lib/format'
import type { DateRange, DayLog, Flow } from '@/engine/types'

const FLOWS: Flow[] = ['spotting', 'light', 'medium', 'heavy']

interface BleedingProps {
  isToday: boolean
  log: DayLog | null
  onBleeding(flow: Flow): void
  onNotBleeding(): void
}

/** "Were you bleeding this day?" Tapping a flow is the yes. */
export function BleedingQuestion({ isToday, log, onBleeding, onNotBleeding }: BleedingProps) {
  const bleeding = log?.isPeriod === true
  const notBleeding = log?.noBleed === true
  return (
    <section className="card stack">
      <div>
        <p className="option__title">
          {isToday ? 'Are you bleeding today?' : 'Were you bleeding this day?'}
        </p>
        <p className="option__sub">
          {bleeding
            ? 'Logged as a period day.'
            : notBleeding
              ? 'Logged as not bleeding.'
              : isToday
                ? 'Tap a flow if you are.'
                : 'Tap a flow if you were.'}
        </p>
      </div>
      <div className="chip-wrap">
        {FLOWS.map((f) => (
          <button
            key={f}
            className="chip"
            aria-pressed={bleeding && log?.flow === f}
            onClick={() => onBleeding(f)}
            style={{ textTransform: 'capitalize' }}
          >
            {f}
          </button>
        ))}
      </div>
      <button className="btn btn--quiet btn--block" aria-pressed={notBleeding} onClick={onNotBleeding}>
        <Icon name="close" size={18} />
        {isToday ? 'No, not bleeding today' : 'No, not bleeding'}
      </button>
    </section>
  )
}

interface StartedProps {
  log: DayLog | null
  expected: DateRange
  onNotYet(): void
  onSpotting(): void
  onStarted(): void
}

/** "Has your period started?" on days the next period is due or late. */
export function StartedQuestion({ log, expected, onNotYet, onSpotting, onStarted }: StartedProps) {
  const spotting = isSpottingOnly(log)
  const notYet = log?.noBleed === true && !spotting
  return (
    <section className="card stack">
      <div>
        <p className="option__title">Has your period started?</p>
        <p className="option__sub">
          {spotting
            ? 'You said just spotting on this day.'
            : notYet
              ? 'You said not yet on this day.'
              : `Expected ${formatRange(expected.earliest, expected.latest)}.`}
        </p>
      </div>
      <div className="stat-grid">
        <button className="btn btn--quiet" aria-pressed={notYet} onClick={onNotYet}>
          Not yet
        </button>
        <button className="btn btn--primary" onClick={onStarted}>
          <Icon name="droplet" size={18} filled />
          It started this day
        </button>
      </div>
      <button className="btn btn--quiet btn--block" aria-pressed={spotting} onClick={onSpotting}>
        Just spotting
      </button>
    </section>
  )
}

interface SpottingProps {
  isToday: boolean
  log: DayLog | null
  onToggle(): void
}

/**
 * Spotting on a day too early in the cycle for a new period. Recorded against
 * the day for patterns; it never becomes a period day or a start.
 */
export function SpottingToggle({ isToday, log, onToggle }: SpottingProps) {
  const spotting = isSpottingOnly(log)
  return (
    <section className="card stack">
      <div>
        <p className="option__title">{isToday ? 'Spotting today?' : 'Spotting this day?'}</p>
        <p className="option__sub">
          {spotting
            ? 'Logged as spotting. It does not change your predictions.'
            : "Light bleeding that isn't a period. Noted for patterns only."}
        </p>
      </div>
      <button className="btn btn--quiet btn--block" aria-pressed={spotting} onClick={onToggle}>
        <Icon name="droplet" size={18} />
        {spotting ? 'Spotting logged' : 'Log spotting'}
      </button>
    </section>
  )
}

interface SymptomProps {
  selected: string[]
  onChange(next: string[]): void
}

/** Symptoms for the day. Each tap saves; nothing here moves the forecast. */
export function SymptomChips({ selected, onChange }: SymptomProps) {
  const toggle = (s: string) =>
    onChange(selected.includes(s) ? selected.filter((v) => v !== s) : [...selected, s])
  return (
    <section>
      <p className="label" style={{ marginBottom: 8 }}>
        Symptoms
      </p>
      <div className="chip-wrap">
        {SYMPTOMS.map((s) => (
          <button key={s} className="chip" aria-pressed={selected.includes(s)} onClick={() => toggle(s)}>
            {s}
          </button>
        ))}
      </div>
    </section>
  )
}
