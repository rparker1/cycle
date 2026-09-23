import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCycleStore } from '@/store/useCycleStore'
import { AuthForm } from '@/components/AuthForm'
import { Icon } from '@/components/Icon'
import { Sheet } from '@/components/Sheet'
import { Stepper } from '@/components/Stepper'
import { syncConfigured } from '@/data/sync'
import { todayIso } from '@/lib/date'
import { DISCLAIMER } from '@/lib/guidance'

const STEPS = 4

export function OnboardingScreen() {
  const completeOnboarding = useCycleStore((s) => s.completeOnboarding)

  const [step, setStep] = useState(0)
  const [displayName, setDisplayName] = useState('')
  const [cycleLength, setCycleLength] = useState(28)
  const [periodLength, setPeriodLength] = useState(5)
  const [lastPeriod, setLastPeriod] = useState('')
  const [saving, setSaving] = useState(false)
  const [signingIn, setSigningIn] = useState(false)

  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  const finish = async () => {
    setSaving(true)
    await completeOnboarding({
      displayName,
      avgCycleLength: cycleLength,
      avgPeriodLength: periodLength,
      lastPeriodStart: lastPeriod,
    })
  }

  return (
    <div className="screen" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
      <div className="stack" style={{ minHeight: '70vh' }}>
        <div className="row" style={{ gap: 6 }}>
          {Array.from({ length: STEPS }, (_, i) => (
            <span
              key={i}
              style={{
                height: 4,
                flex: 1,
                borderRadius: 999,
                background: i <= step ? 'var(--rose)' : 'var(--hairline)',
                transition: 'background .3s var(--ease)',
              }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            className="stack"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.22 }}
            style={{ flex: 1 }}
          >
            {step === 0 && (
              <>
                <span className="success-mark" style={{ background: 'var(--rose-soft)', color: 'var(--rose)' }}>
                  <Icon name="droplet" size={34} filled />
                </span>
                <h1 className="title-lg center">Welcome 🌸</h1>
                <p className="muted center">
                  A gentle tracker for your period, your fertile window, and when to use
                  protection.
                </p>
                <label className="field">
                  <span className="label">What should we call you?</span>
                  <input
                    type="text"
                    value={displayName}
                    placeholder="Optional"
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </label>
              </>
            )}

            {step === 1 && (
              <>
                <h1 className="title-lg">Your usual cycle</h1>
                <p className="muted">
                  A rough answer is fine. Cycle replaces these with what it learns from
                  your logs.
                </p>
                <Stepper
                  label="Average cycle length"
                  suffix="days"
                  value={cycleLength}
                  min={15}
                  max={60}
                  onChange={setCycleLength}
                />
                <Stepper
                  label="Average period length"
                  suffix="days"
                  value={periodLength}
                  min={1}
                  max={15}
                  onChange={setPeriodLength}
                />
              </>
            )}

            {step === 2 && (
              <>
                <h1 className="title-lg">When did your last period start?</h1>
                <p className="muted">
                  The first day of bleeding. This is the one date everything else is built
                  from.
                </p>
                <label className="field">
                  <span className="label">First day of your last period</span>
                  <input
                    type="date"
                    value={lastPeriod}
                    max={todayIso()}
                    onChange={(e) => setLastPeriod(e.target.value)}
                  />
                </label>
              </>
            )}

            {step === 3 && (
              <>
                <h1 className="title-lg">Before you start</h1>
                <div className="card stack">
                  <p style={{ fontWeight: 600 }}>Cycle estimates. It does not know.</p>
                  <p className="muted">
                    Predictions come from the dates you log. Until you've logged three
                    cycles, Cycle will say it doesn't have enough history rather than guess
                    at your safe days.
                  </p>
                  <p className="muted">
                    Calendar-based fertility awareness is not a reliable method of
                    contraception on its own. {DISCLAIMER}
                  </p>
                </div>
                <div className="card stack">
                  <p style={{ fontWeight: 600 }}>Your data stays on this phone.</p>
                  <p className="muted">
                    Nothing is uploaded unless you turn on sync in Settings.
                  </p>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="stack" style={{ gap: 10 }}>
          {step === STEPS - 1 ? (
            <button
              className="btn btn--primary btn--block"
              disabled={saving}
              onClick={() => void finish()}
            >
              {saving ? 'Setting up…' : 'Start tracking'}
            </button>
          ) : (
            <button
              className="btn btn--primary btn--block"
              disabled={step === 2 && !lastPeriod}
              onClick={next}
            >
              Continue
            </button>
          )}
          {step > 0 && (
            <button className="btn btn--ghost btn--block" onClick={back}>
              Back
            </button>
          )}

          {/* Always reachable. Someone part-way through setup may realise they
              already have an account, and nothing is written until the final
              step — so switching costs them nothing. */}
          {syncConfigured() && (
            <button
              className="btn btn--block"
              style={{ background: 'transparent', color: 'var(--ink-soft)', minHeight: 44 }}
              onClick={() => setSigningIn(true)}
            >
              Already have an account? Sign in
            </button>
          )}
        </div>
      </div>

      <Sheet open={signingIn} title="Sign in" onClose={() => setSigningIn(false)}>
        <p className="muted" style={{ marginBottom: 14 }}>
          Signing in restores your cycle history and settings. Nothing you've entered
          here has been saved yet.
        </p>
        <AuthForm onSignedIn={() => setSigningIn(false)} />
      </Sheet>
    </div>
  )
}
