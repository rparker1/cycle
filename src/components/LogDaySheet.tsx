/**
 * The single "Log day" flow.
 *
 * One button, one sheet, three things you might be recording. Ovulation gets
 * an extra step — not a gate, just a gentle check against the usual signs, so
 * a guess can be marked as a guess rather than hardening into data the engine
 * treats as fact.
 */

import { useEffect, useState } from 'react'
import { Sheet } from './Sheet'
import { Icon } from './Icon'
import { useCycleStore } from '@/store/useCycleStore'
import { OVULATION_SIGNS, SYMPTOMS } from '@/lib/guidance'
import type { Flow } from '@/engine/types'

type Step = 'choose' | 'period' | 'fertile' | 'ovulation' | 'done'

interface Props {
  open: boolean
  onClose(): void
}

const FLOWS: Flow[] = ['spotting', 'light', 'medium', 'heavy']

export function LogDaySheet({ open, onClose }: Props) {
  const { today, logs, engine, markPeriodStart, updateDay } = useCycleStore()
  const [step, setStep] = useState<Step>('choose')

  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState('')
  const [flow, setFlow] = useState<Flow>('medium')
  const [symptoms, setSymptoms] = useState<string[]>([])
  const [activity, setActivity] = useState(false)
  const [protection, setProtection] = useState(false)
  const [notes, setNotes] = useState('')
  const [signs, setSigns] = useState<string[]>([])

  const existing = logs.find((l) => l.logDate === today)

  /*
   * Ovulating on day two of a period is not a thing that happens. The old app
   * offered it anyway, which quietly undermines everything else it says. The
   * row stays put rather than disappearing — a layout that rearranges itself
   * is its own kind of confusing — but it explains itself and does nothing.
   */
  const todayAssessment = engine.assessDay(today)
  const ovulationPlausible =
    !todayAssessment.isPeriod &&
    todayAssessment.cycleDay !== null &&
    todayAssessment.cycleDay >= 7

  useEffect(() => {
    if (!open) return
    setStep('choose')
    setStartDate(today)
    setEndDate('')
    setFlow(existing?.flow ?? 'medium')
    setSymptoms(existing?.symptoms ?? [])
    setActivity(existing?.sexualActivity === true)
    setProtection(existing?.protectionUsed === true)
    setNotes(existing?.notes ?? '')
    setSigns(existing?.ovulationSigns ?? [])
    // Only reset when the sheet opens, not on every keystroke elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggle = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  const finish = () => setStep('done')

  const savePeriod = async () => {
    await markPeriodStart(startDate, {
      flow,
      symptoms,
      sexualActivity: activity ? true : null,
      protectionUsed: activity ? protection : null,
      notes: notes.trim() || null,
    })
    if (endDate) {
      await updateDay(endDate, { isPeriod: true, isPeriodEnd: true })
    }
    finish()
  }

  const back = (
    <button
      className="row"
      style={{ color: 'var(--ink-soft)', fontSize: 15, fontWeight: 600, marginBottom: 6 }}
      onClick={() => setStep('choose')}
    >
      <Icon name="chevron-left" size={16} strokeWidth={2.2} />
      Back
    </button>
  )

  const title =
    step === 'choose'
      ? 'Log your day'
      : step === 'period'
        ? 'Log a period'
        : step === 'fertile'
          ? 'Fertility signs'
          : step === 'ovulation'
            ? 'Ovulation check-in'
            : ''

  return (
    <Sheet
      open={open}
      title={step === 'done' ? undefined : title}
      lead={step === 'period' || step === 'fertile' || step === 'ovulation' ? back : undefined}
      onClose={onClose}
    >
      {step === 'choose' && (
        <div className="stack">
          <p className="muted">How does today feel?</p>

          <button className="option" onClick={() => setStep('period')}>
            <span
              className="option__icon"
              style={{ background: 'var(--rose-soft)', color: 'var(--rose)' }}
            >
              <Icon name="droplet" size={24} filled />
            </span>
            <span>
              <span className="option__title">Period day</span>
              <span className="option__sub">I'm bleeding today</span>
            </span>
          </button>

          <button className="option" onClick={() => setStep('fertile')}>
            <span
              className="option__icon"
              style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}
            >
              <Icon name="sun" size={24} />
            </span>
            <span>
              <span className="option__title">Fertility day</span>
              <span className="option__sub">I feel fertile today</span>
            </span>
          </button>

          <button
            className="option"
            disabled={!ovulationPlausible}
            style={ovulationPlausible ? undefined : { opacity: 0.55 }}
            onClick={() => setStep('ovulation')}
          >
            <span
              className="option__icon"
              style={{ background: 'var(--orange-soft)', color: 'var(--orange)' }}
            >
              <Icon name="sparkles" size={24} />
            </span>
            <span>
              <span className="option__title">Ovulating day</span>
              <span className="option__sub">
                {ovulationPlausible
                  ? "I think I'm ovulating"
                  : todayAssessment.isPeriod
                    ? 'Not while you\u2019re bleeding'
                    : `Too early in your cycle (day ${todayAssessment.cycleDay ?? 1})`}
              </span>
            </span>
          </button>
        </div>
      )}

      {step === 'period' && (
        <div className="stack">
          <div className="stat-grid">
            <label className="field">
              <span className="label">Start date</span>
              <input
                type="date"
                value={startDate}
                max={today}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="label">End date (optional)</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>

          <div>
            <p className="label" style={{ marginBottom: 8 }}>
              Flow
            </p>
            <div className="segmented">
              {FLOWS.map((f) => (
                <button
                  key={f}
                  className="chip"
                  aria-pressed={flow === f}
                  onClick={() => setFlow(f)}
                  style={{ textTransform: 'capitalize' }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label" style={{ marginBottom: 8 }}>
              Symptoms
            </p>
            <div className="chip-wrap">
              {SYMPTOMS.map((s) => (
                <button
                  key={s}
                  className="chip"
                  aria-pressed={symptoms.includes(s)}
                  onClick={() => setSymptoms(toggle(symptoms, s))}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <ActivityFields
            activity={activity}
            protection={protection}
            onActivity={setActivity}
            onProtection={setProtection}
          />

          <label className="field">
            <span className="label">Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <button className="btn btn--primary btn--block" onClick={() => void savePeriod()}>
            Save period
          </button>
        </div>
      )}

      {step === 'fertile' && (
        <div className="stack">
          <p className="muted">
            Noticing signs is useful, but on its own it doesn't move your predictions —
            only a confirmed ovulation does that.
          </p>
          <div className="chip-wrap">
            {OVULATION_SIGNS.map((s) => (
              <button
                key={s}
                className="chip chip--amber"
                aria-pressed={signs.includes(s)}
                onClick={() => setSigns(toggle(signs, s))}
              >
                {s}
              </button>
            ))}
          </div>
          <ActivityFields
            activity={activity}
            protection={protection}
            onActivity={setActivity}
            onProtection={setProtection}
          />
          <button
            className="btn btn--primary btn--block"
            onClick={async () => {
              await updateDay(today, {
                feltFertile: true,
                ovulationSigns: signs,
                sexualActivity: activity ? true : null,
                protectionUsed: activity ? protection : null,
              })
              finish()
            }}
          >
            Save
          </button>
        </div>
      )}

      {step === 'ovulation' && (
        <div className="stack">
          <div>
            <p className="title-md">Common signs of ovulation</p>
            <p className="muted" style={{ marginTop: 4 }}>
              Not everyone notices them — tick any you're having today. This is just a
              gentle check-in 🌸
            </p>
          </div>

          <div className="chip-wrap">
            {OVULATION_SIGNS.map((s) => (
              <button
                key={s}
                className="chip chip--amber"
                aria-pressed={signs.includes(s)}
                onClick={() => setSigns(toggle(signs, s))}
              >
                {s}
              </button>
            ))}
          </div>

          <p className="fine-print">
            {signs.length === 0
              ? "No signs ticked. You can still record it — Cycle will treat it as a maybe rather than a certainty."
              : `${signs.length} sign${signs.length === 1 ? '' : 's'} ticked. Confirming will adjust this cycle's predictions.`}
          </p>

          <div className="stat-grid">
            <button
              className="btn btn--quiet"
              onClick={async () => {
                await updateDay(today, {
                  ovulationClaimed: true,
                  ovulationConfidence: 'unsure',
                  ovulationSigns: signs,
                })
                finish()
              }}
            >
              No, maybe not
            </button>
            <button
              className="btn btn--orange"
              onClick={async () => {
                await updateDay(today, {
                  ovulationClaimed: true,
                  ovulationConfidence: 'confident',
                  ovulationSigns: signs,
                })
                finish()
              }}
            >
              <Icon name="heart" size={18} filled />
              Yeah, I am
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="stack center">
          <span className="success-mark">
            <Icon name="check" size={34} strokeWidth={2.6} />
          </span>
          <p className="title-md">Logged 🌸</p>
          <p className="muted">
            Thanks for sharing how you feel — it helps keep your predictions in tune with
            your body.
          </p>
          <button className="btn btn--primary btn--block" onClick={onClose}>
            Done
          </button>
        </div>
      )}
    </Sheet>
  )
}

interface ActivityProps {
  activity: boolean
  protection: boolean
  onActivity(value: boolean): void
  onProtection(value: boolean): void
}

function ActivityFields({ activity, protection, onActivity, onProtection }: ActivityProps) {
  return (
    <div className="stat-grid">
      <button
        className="card card--tight"
        style={{ textAlign: 'left' }}
        aria-pressed={activity}
        onClick={() => {
          const next = !activity
          onActivity(next)
          // "Protected" without "activity" is meaningless, and the database
          // rejects the pair half-filled.
          if (!next) onProtection(false)
        }}
      >
        <div className="stat__label">
          <Icon name="heart" size={17} filled={activity} />
          Sexual activity
        </div>
        <div className="stat__sub" style={{ marginTop: 4 }}>
          {activity ? 'Logged' : 'Tap to log'}
        </div>
      </button>

      <button
        className="card card--tight"
        style={{ textAlign: 'left', opacity: activity ? 1 : 0.5 }}
        aria-pressed={protection}
        disabled={!activity}
        onClick={() => onProtection(!protection)}
      >
        <div className="stat__label">
          <Icon name="shield-check" size={17} />
          Protection used
        </div>
        <div className="stat__sub" style={{ marginTop: 4 }}>
          {!activity ? 'Log activity first' : protection ? 'Yes' : 'No'}
        </div>
      </button>
    </div>
  )
}
