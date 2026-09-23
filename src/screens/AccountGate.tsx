/**
 * The first screen on a device that has nothing stored.
 *
 * It exists because onboarding used to come first, which meant someone
 * reinstalling — or whose iOS storage had been cleared — was made to invent a
 * period start before they could reach the sign-in buried in Settings. That
 * invented date then synced up into their real history.
 *
 * Signing in is offered before anything is written.
 */

import { AuthForm } from '@/components/AuthForm'
import { Icon } from '@/components/Icon'

interface Props {
  /** Chosen "continue without an account" — go on to onboarding, local only. */
  onSkip(): void
}

export function AccountGate({ onSkip }: Props) {
  return (
    <div
      className="screen"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
    >
      <div className="stack" style={{ minHeight: '70vh' }}>
        <span
          className="success-mark"
          style={{ background: 'var(--rose-soft)', color: 'var(--rose)' }}
        >
          <Icon name="droplet" size={34} filled />
        </span>

        <h1 className="title-lg center">Welcome 🌸</h1>
        <p className="muted center">
          Sign in to pick up where you left off, or start fresh on this phone.
        </p>

        <section className="card stack">
          <AuthForm />
        </section>

        <button className="btn btn--ghost btn--block" onClick={onSkip}>
          Continue without an account
        </button>

        <p className="fine-print center">
          Without an account everything stays on this phone. Nothing is uploaded, and
          nothing comes back if you lose it.
        </p>
      </div>
    </div>
  )
}
