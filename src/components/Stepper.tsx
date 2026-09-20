import { Icon } from './Icon'

interface Props {
  label: string
  value: number
  min: number
  max: number
  suffix?: string
  onChange(value: number): void
}

/**
 * A number stepper rather than a text input.
 *
 * Cycle length is a small integer in a known range, and a stepper cannot
 * produce "2 8" or an empty string at 6am.
 */
export function Stepper({ label, value, min, max, suffix, onChange }: Props) {
  const step = (by: number) => onChange(Math.min(max, Math.max(min, value + by)))

  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="stepper">
        <button
          className="stepper__btn"
          onClick={() => step(-1)}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
        >
          <Icon name="minus" size={18} strokeWidth={2.4} />
        </button>
        <span className="stepper__value" aria-live="polite">
          {value}
          {suffix ? ` ${suffix}` : ''}
        </span>
        <button
          className="stepper__btn"
          onClick={() => step(1)}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
        >
          <Icon name="plus" size={18} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  )
}
