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

export function App() {
  const { ready, profile, load, refreshToday, sync } = useCycleStore()
  const [tab, setTab] = useState<Tab>('today')
  const [logging, setLogging] = useState(false)

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

  if (!profile.onboardedAt) return <OnboardingScreen />

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
