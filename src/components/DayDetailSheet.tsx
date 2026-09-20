import { useMemo } from 'react'
import { Sheet } from './Sheet'
import { Icon } from './Icon'
import { GuidanceCard } from './GuidanceCard'
import { useCycleStore } from '@/store/useCycleStore'
import { PHASE_ICON, PHASE_LABEL } from '@/lib/guidance'
import { formatLong } from '@/lib/format'
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
  const { engine, logs, today, markPeriodStart, updateDay, clearDay } = useCycleStore()

  const log = useMemo(
    () => (date === null ? null : (logs.find((l) => l.logDate === date) ?? null)),
    [date, logs],
  )

  if (date === null) return null

  const day = engine.assessDay(date)
  const isFuture = date > today

  /*
   * Ovulation logging only where it makes sense. The old app offered
   * "I think I ovulated this day" on day one of a period, which is not a
   * thing that happens and undermines trust in everything else it says.
   */
  const ovulationPlausible =
    !isFuture && !day.isPeriod && day.cycleDay !== null && day.cycleDay >= 7

  const alreadyClaimed = log?.ovulationClaimed === true && log.ovulationConfidence !== 'rejected'

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

        {day.isPeriod ? (
          <button className="btn btn--ghost btn--block" onClick={() => void clearDay(date)}>
            <Icon name="trash" size={18} />
            Remove period from this date
          </button>
        ) : (
          !isFuture && (
            <button
              className="btn btn--primary btn--block"
              onClick={async () => {
                await markPeriodStart(date)
                onClose()
              }}
            >
              <Icon name="droplet" size={18} filled />
              Log period starting this date
            </button>
          )
        )}

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

        {!isFuture && (
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
              Noted against this day so you can spot patterns in History. Only logged
              periods and confirmed ovulation change the predictions themselves.
            </p>
          </section>
        )}
      </div>
    </Sheet>
  )
}
