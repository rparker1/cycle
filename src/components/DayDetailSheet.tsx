import { useEffect, useMemo, useState } from 'react'
import { Sheet } from './Sheet'
import { Icon } from './Icon'
import { Stepper } from './Stepper'
import { GuidanceCard } from './GuidanceCard'
import { BleedingQuestion, SpottingToggle, StartedQuestion, SymptomChips } from './DayReport'
import { useCycleStore } from '@/store/useCycleStore'
import {
  MAX_PERIOD_DAYS,
  isSpottingOnly,
  periodLengthFor,
  periodStartFor,
  spottingPatch,
} from '@/engine/logging'
import { dayPrompt } from '@/engine/dayPrompt'
import { PHASE_ICON, PHASE_LABEL } from '@/lib/guidance'
import { formatLong, formatRange } from '@/lib/format'
import { addDays } from '@/lib/date'
import type { IsoDate, PredictionFeedback } from '@/engine/types'

interface Props {
  date: IsoDate | null
  onClose(): void
}

const FEEDBACK: { value: PredictionFeedback; label: string }[] = [
  { value: 'accurate', label: 'Spot on' },
  { value: 'early', label: 'Too early' },
  { value: 'late', label: 'Too late' },
  { value: 'wrong', label: 'Way off' },
]

export function DayDetailSheet({ date, onClose }: Props) {
  const { engine, logs, today, logPeriod, removePeriod, updateDay, reportBleeding } = useCycleStore()

  const log = useMemo(
    () => (date === null ? null : (logs.find((l) => l.logDate === date) ?? null)),
    [date, logs],
  )

  const loggedStart = useMemo(
    () => (date === null ? null : periodStartFor(logs, date)),
    [date, logs],
  )
  const loggedLength = useMemo(
    () => (date === null ? 0 : periodLengthFor(logs, date)),
    [date, logs],
  )

  // `editing` holds the length being chosen; null means the stepper is closed.
  const [editing, setEditing] = useState<number | null>(null)

  useEffect(() => {
    setEditing(null)
  }, [date])

  if (date === null) return null

  const day = engine.assessDay(date)
  const isFuture = date > today
  const isLoggedPeriod = loggedStart !== null
  const prompt = dayPrompt(date, today, engine)
  const currentStart = engine.cycles.find((c) => c.isCurrent)?.startDate ?? null
  // Spotting can happen on any day of the running cycle outside the period.
  const offerSpotting =
    !isLoggedPeriod &&
    (prompt === 'spotting' ||
      (prompt === 'logStart' && currentStart !== null && date > currentStart))
  const spotting = isSpottingOnly(log)
  const periodLength = engine.prediction.periodLength

  /*
   * Ovulation logging only where it makes sense. The old app offered
   * "I think I ovulated this day" on day one of a period, which is not a
   * thing that happens and undermines trust in everything else it says.
   */
  const ovulationPlausible =
    !isFuture && !day.isPeriod && day.cycleDay !== null && day.cycleDay >= 7

  const alreadyClaimed = log?.ovulationClaimed === true && log.ovulationConfidence !== 'rejected'

  // Editing an existing period changes its length from its real first day,
  // not from whichever day happened to be tapped.
  const runStart = loggedStart ?? date
  const previewLength = editing ?? (isLoggedPeriod ? loggedLength : periodLength)
  const previewEnd = addDays(runStart, Math.max(1, previewLength) - 1)

  const commit = async () => {
    await logPeriod(runStart, previewLength)
    setEditing(null)
    onClose()
  }

  return (
    <Sheet open title={formatLong(date)} onClose={onClose}>
      <div className="stack">
        {day.cycleDay !== null && day.phase && (
          <div className="row">
            <span
              className="option__icon"
              style={{
                background: day.isPeriod
                  ? 'var(--rose-deep)'
                  : day.isOvulation
                    ? 'var(--orange)'
                    : day.isFertile
                      ? 'var(--amber)'
                      : 'var(--surface-sunken)',
                color: day.isPeriod || day.isOvulation || day.isFertile ? '#fff' : 'var(--ink)',
              }}
            >
              <Icon name={PHASE_ICON[day.phase] ?? 'sun'} size={24} />
            </span>
            <span>
              <span className="title-md" style={{ display: 'block' }}>
                Cycle day {day.cycleDay}
              </span>
              <span className="muted">{PHASE_LABEL[day.phase]}</span>
            </span>
          </div>
        )}

        <GuidanceCard day={day} prediction={engine.prediction} />

        {/* ---------------------------------------------------- period -- */}
        {editing !== null ? (
          <section className="card stack">
            <div>
              <p className="option__title">
                {isLoggedPeriod ? 'Change the length' : 'Period started this day'}
              </p>
              <p className="option__sub">
                {formatRange(runStart, previewEnd)} · {previewLength}{' '}
                {previewLength === 1 ? 'day' : 'days'}
              </p>
            </div>
            <Stepper
              label="How many days did it last?"
              suffix="days"
              value={previewLength}
              min={1}
              max={MAX_PERIOD_DAYS}
              onChange={setEditing}
            />
            <button className="btn btn--primary btn--block" onClick={() => void commit()}>
              <Icon name="check" size={18} strokeWidth={2.4} />
              {isLoggedPeriod ? 'Update period' : `Log ${previewLength} days`}
            </button>
            <button className="btn btn--ghost btn--block" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </section>
        ) : (
          <>
            {prompt === 'bleeding' && (
              <BleedingQuestion
                isToday={date === today}
                log={log}
                onBleeding={(flow) => void reportBleeding(date, true, flow)}
                onNotBleeding={() => void reportBleeding(date, false)}
              />
            )}

            {prompt === 'started' && !isLoggedPeriod && engine.prediction.nextPeriodExpected && (
              <StartedQuestion
                log={log}
                expected={engine.prediction.nextPeriodExpected}
                onNotYet={() =>
                  void updateDay(
                    date,
                    log?.noBleed === true && !spotting
                      ? { noBleed: false }
                      : { noBleed: true, flow: null },
                  )
                }
                onSpotting={() => void updateDay(date, spottingPatch(!spotting))}
                onStarted={() => setEditing(periodLength)}
              />
            )}

            {isLoggedPeriod && (
              <section className="card stack">
                <div>
                  <p className="option__title">Period logged</p>
                  <p className="option__sub">
                    {formatRange(runStart, addDays(runStart, loggedLength - 1))} · {loggedLength}{' '}
                    {loggedLength === 1 ? 'day' : 'days'}
                  </p>
                </div>
                <div className="stat-grid">
                  <button className="btn btn--quiet" onClick={() => setEditing(loggedLength)}>
                    Change length
                  </button>
                  <button
                    className="btn btn--danger"
                    onClick={async () => {
                      await removePeriod(date)
                      onClose()
                    }}
                  >
                    Remove
                  </button>
                </div>
              </section>
            )}

            {offerSpotting && (
              <SpottingToggle
                isToday={date === today}
                log={log}
                onToggle={() => void updateDay(date, spottingPatch(!spotting))}
              />
            )}

            {prompt === 'logStart' && !isLoggedPeriod && (
              <button
                className="btn btn--primary btn--block"
                onClick={() => setEditing(periodLength)}
              >
                <Icon name="droplet" size={18} filled />
                My period started this day
              </button>
            )}
          </>
        )}

        {/* ------------------------------------------------- ovulation -- */}
        {ovulationPlausible && !alreadyClaimed && (
          <button
            className="btn btn--quiet btn--block"
            style={{ color: 'var(--orange-ink)' }}
            onClick={async () => {
              await updateDay(date, {
                ovulationClaimed: true,
                ovulationConfidence: 'confident',
              })
              onClose()
            }}
          >
            <Icon name="heart" size={18} />
            I think I ovulated this day
          </button>
        )}

        {alreadyClaimed && (
          <button
            className="btn btn--ghost btn--block"
            onClick={() =>
              void updateDay(date, { ovulationClaimed: false, ovulationConfidence: 'rejected' })
            }
          >
            <Icon name="close" size={18} />
            Actually, I didn't ovulate this day
          </button>
        )}

        {/* -------------------------------------------------- symptoms -- */}
        {!isFuture && editing === null && (
          <SymptomChips
            selected={log?.symptoms ?? []}
            onChange={(symptoms) => void updateDay(date, { symptoms })}
          />
        )}

        {/* -------------------------------------------------- feedback -- */}
        {!isFuture && editing === null && (
          <section>
            <p className="label" style={{ marginBottom: 8 }}>
              Did this day match how you felt?
            </p>
            <div className="chip-wrap">
              {FEEDBACK.map(({ value, label }) => (
                <button
                  key={value}
                  className="chip"
                  aria-pressed={log?.predictionFeedback === value}
                  onClick={() =>
                    void updateDay(date, {
                      predictionFeedback: log?.predictionFeedback === value ? null : value,
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="fine-print" style={{ marginTop: 8 }}>
              Symptoms and feedback are noted against this day so you can spot patterns.
              Only period days, 'not yet' answers and confirmed ovulation change the
              predictions.
            </p>
          </section>
        )}
      </div>
    </Sheet>
  )
}
