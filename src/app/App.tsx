import { useEffect, useState } from 'react'
import { useCycleStore } from '@/store/useCycleStore'
import { BottomNav, type Tab } from '@/components/BottomNav'
import { LogDaySheet } from '@/components/LogDaySheet'
import { Icon } from '@/components/Icon'
import { TodayScreen } from '@/screens/TodayScreen'
import { CalendarScreen } from '@/screens/CalendarScreen'
import { HistoryScreen } from '@/screens/HistoryScreen'
import { SettingsScreen } from '@/screens/SettingsScreen'
import { OnboardingScreen } from '@/screens/OnboardingScreen'
import { AccountGate } from '@/screens/AccountGate'
import { syncConfigured } from '@/data/sync'

const GATE_SKIPPED_KEY = 'cycle.gateSkipped'

export function App() {
  const { ready, profile, load, refreshToday, sync } = useCycleStore()
  const [tab, setTab] = useState<Tab>('today')
  const [logging, setLogging] = useState(false)

  /*
   * Whether the account gate has been dismissed on this device. Persisted, so
   * choosing "continue without an account" survives the reload that the
   * service worker performs when a new build lands mid-setup.
   */
  const [gateSkipped, setGateSkipped] = useState(() => {
    try {
      return localStorage.getItem(GATE_SKIPPED_KEY) === 'yes'
    } catch {
      return false
    }
  })

  const skipGate = () => {
    setGateSkipped(true)
    try {
      localStorage.setItem(GATE_SKIPPED_KEY, 'yes')
    } catch {
      /* Private browsing refuses writes; the gate simply reappears. */
    }
  }

  useEffect(() => {
    void load()
  }, [load])

  /*
   * An installed PWA is not reloaded between uses — it can sit in the app
   * switcher for a week. Without this, "today" would be whatever day it was
   * when the app last cold-started, and every prediction would be stale.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      refreshToday()
      void sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [refreshToday, sync])

  if (!ready) {
    return (
      <div className="screen center" style={{ display: 'grid', placeItems: 'center' }}>
        <span className="muted">Loading…</span>
      </div>
    )
  }

  /*
   * Order matters. Onboarding used to come first, which forced anyone
   * reinstalling to invent a period start before they could reach sign-in —
   * and that invented date then synced into their real history. Signing in is
   * now offered before anything is written.
   */
  if (!profile.onboardedAt) {
    if (syncConfigured() && !gateSkipped) return <AccountGate onSkip={skipGate} />
    return <OnboardingScreen />
  }

  return (
    <div className="app">
      {tab === 'today' && <TodayScreen />}
      {tab === 'calendar' && <CalendarScreen />}
      {tab === 'history' && <HistoryScreen />}
      {tab === 'settings' && <SettingsScreen />}

      {tab === 'today' && (
        <div className="fab-dock">
          <button className="btn btn--primary" onClick={() => setLogging(true)}>
            <Icon name="plus" size={20} strokeWidth={2.4} />
            Log day
          </button>
        </div>
      )}

      <BottomNav active={tab} onChange={setTab} />
      <LogDaySheet open={logging} onClose={() => setLogging(false)} />
    </div>
  )
}
