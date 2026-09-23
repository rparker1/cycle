/**
 * Email and password, in one place.
 *
 * Used by the start-up gate, the escape hatch in onboarding, and Settings.
 * Three copies of this would be three chances to handle the confirmation
 * case differently.
 */

import { useState } from 'react'
import { useCycleStore } from '@/store/useCycleStore'
import { signIn, signUp } from '@/data/sync'

interface Props {
  /** Called after a session exists and the first sync has finished. */
  onSignedIn?(): void
  /** Which action gets the primary button. */
  emphasis?: 'sign-in' | 'create'
}

export function AuthForm({ onSignedIn, emphasis = 'sign-in' }: Props) {
  const { refreshSession, sync } = useCycleStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const authenticate = async (mode: 'in' | 'up') => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'in') {
        await signIn(email, password)
      } else {
        const { needsConfirmation } = await signUp(email, password)
        if (needsConfirmation) {
          setNotice(
            `Account created. Check ${email} for a confirmation link, then come back and sign in.`,
          )
          setBusy(false)
          return
        }
      }
      await refreshSession()
      await sync()
      setPassword('')
      onSignedIn?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || !email || !password

  const signInButton = (
    <button
      className={`btn btn--block ${emphasis === 'sign-in' ? 'btn--primary' : 'btn--quiet'}`}
      disabled={disabled}
      onClick={() => void authenticate('in')}
    >
      {busy ? 'Just a moment…' : 'Sign in'}
    </button>
  )

  const createButton = (
    <button
      className={`btn btn--block ${emphasis === 'create' ? 'btn--primary' : 'btn--quiet'}`}
      disabled={disabled}
      onClick={() => void authenticate('up')}
    >
      Create account
    </button>
  )

  return (
    <div className="stack" style={{ gap: 12 }}>
      <label className="field">
        <span className="label">Email</span>
        <input
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="field">
        <span className="label">Password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      {error && (
        <p className="fine-print" style={{ color: 'var(--rose-deep)' }}>
          {error}
        </p>
      )}
      {notice && (
        <p className="fine-print" style={{ color: 'var(--green)' }}>
          {notice}
        </p>
      )}

      {emphasis === 'create' ? (
        <>
          {createButton}
          {signInButton}
        </>
      ) : (
        <>
          {signInButton}
          {createButton}
        </>
      )}
    </div>
  )
}
