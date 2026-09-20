import { Icon } from './Icon'
import { DISCLAIMER, guidanceFor } from '@/lib/guidance'
import type { DayAssessment, Prediction } from '@/engine/types'

interface Props {
  day: DayAssessment
  prediction: Prediction
  /** The disclaimer belongs on every guidance surface, but not twice on one screen. */
  showDisclaimer?: boolean
}

export function GuidanceCard({ day, prediction, showDisclaimer = true }: Props) {
  const guidance = guidanceFor(day, prediction)

  return (
    <section className={`guidance guidance--${guidance.tone}`}>
      <span className="guidance__icon">
        <Icon name={guidance.icon} size={22} strokeWidth={2} />
      </span>
      <div style={{ minWidth: 0 }}>
        <p className="guidance__title">{guidance.title}</p>
        <p className="guidance__body">{guidance.body}</p>
        {showDisclaimer && (
          <p className="disclaimer">
            <Icon name="info" size={15} />
            <span>{DISCLAIMER}</span>
          </p>
        )}
      </div>
    </section>
  )
}
