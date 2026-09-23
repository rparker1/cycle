import { useRef, useState } from 'react'
import { useCycleStore } from '@/store/useCycleStore'
import { AuthForm } from '@/components/AuthForm'
import { Icon } from '@/components/Icon'
import { Stepper } from '@/components/Stepper'
import { syncConfigured, signOut } from '@/data/sync'
import { requestPersistence } from '@/data/db'
import { DISCLAIMER } from '@/lib/guidance'

type Theme = 'system' | 'light' | 'dark'

export function SettingsScreen() {
  const {
    profile,
    saveProfile,
    signedInAs,
    syncStatus,
    syncMessage,
    sync,
    refreshSession,
    exportAll,
    importAll,
    clearAll,
  } = useCycleStore()

  const fileInput = useRef<HTMLInputElement>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [theme, setTheme] = useState<Theme>(
    (localStorage.getItem('cycle.theme') as Theme | null) ?? 'system',
  )

  const applyTheme = (next: Theme) => {
    setTheme(next)
    try {
      localStorage.setItem('cycle.theme', next)
    } catch {
      /* Private browsing can refuse writes; the setting simply won't persist. */
    }
    if (next === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', next)
  }

  const doExport = async () => {
    const bundle = await exportAll()
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cycle-backup-${bundle.exportedAt.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const doImport = async (file: File) => {
    try {
      await importAll(JSON.parse(await file.text()))
    } catch (error) {
      alert(error instanceof Error ? error.message : 'That file could not be read.')
    }
  }

  return (
    <div className="screen screen--flush">
      <div className="stack">
        <h1 className="title-lg">Settings</h1>

        <section className="card stack">
          <p className="title-md">You</p>
          <label className="field">
            <span className="label">Your name</span>
            <input
              type="text"
              value={profile.displayName ?? ''}
              placeholder="Optional"
              onChange={(e) => void saveProfile({ displayName: e.target.value || null })}
            />
          </label>
        </section>

        <section className="card stack">
          <div>
            <p className="title-md">Your cycle</p>
            <p className="fine-print">
              Starting points only. Once you've logged three cycles these stop being used
              for predictions.
            </p>
          </div>
          <Stepper
            label="Average cycle length"
            suffix="days"
            value={profile.avgCycleLength}
            min={15}
            max={60}
            onChange={(v) => void saveProfile({ avgCycleLength: v })}
          />
          <Stepper
            label="Average period length"
            suffix="days"
            value={profile.avgPeriodLength}
            min={1}
            max={15}
            onChange={(v) => void saveProfile({ avgPeriodLength: v })}
          />
        </section>

        <section className="card stack">
          <p className="title-md">Appearance</p>
          <div className="segmented">
            {(['system', 'light', 'dark'] as Theme[]).map((t) => (
              <button
                key={t}
                className="chip"
                aria-pressed={theme === t}
                onClick={() => applyTheme(t)}
                style={{ textTransform: 'capitalize' }}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        <section className="card stack">
          <div>
            <p className="title-md">Backup and sync</p>
            <p className="fine-print">
              Your data lives on this phone. Signing in copies it to your own private
              Supabase project so a lost phone doesn't mean lost history.
            </p>
          </div>

          {!syncConfigured() ? (
            <p className="muted">
              Sync isn't configured in this build. Add your Supabase URL and publishable
              key and rebuild to enable it.
            </p>
          ) : signedInAs ? (
            <>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="row" style={{ gap: 8 }}>
                  <Icon name="cloud" size={18} />
                  <span style={{ fontWeight: 600 }}>{signedInAs}</span>
                </span>
                <span className="label">
                  {syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'error' ? 'Failed' : 'Synced'}
                </span>
              </div>
              {syncMessage && <p className="fine-print">{syncMessage}</p>}
              <div className="stat-grid">
                <button className="btn btn--quiet" onClick={() => void sync()}>
                  Sync now
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={async () => {
                    await signOut()
                    await refreshSession()
                  }}
                >
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <AuthForm />
          )}
        </section>

        <section className="card stack">
          <div>
            <p className="title-md">Your data</p>
            <p className="fine-print">
              A JSON export is the backstop. iOS can clear a web app's storage, so keep
              one somewhere safe even if you also sync.
            </p>
          </div>
          <div className="stat-grid">
            <button className="btn btn--quiet" onClick={() => void doExport()}>
              <Icon name="download" size={18} />
              Export
            </button>
            <button className="btn btn--quiet" onClick={() => fileInput.current?.click()}>
              <Icon name="upload" size={18} />
              Import
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void doImport(file)
              e.target.value = ''
            }}
          />
          <button className="btn btn--ghost btn--block" onClick={() => void requestPersistence()}>
            Ask iOS to keep this data
          </button>

          {confirmClear ? (
            <div className="stat-grid">
              <button className="btn btn--quiet" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
              <button
                className="btn btn--danger"
                onClick={async () => {
                  await clearAll()
                  setConfirmClear(false)
                }}
              >
                Erase everything
              </button>
            </div>
          ) : (
            <button className="btn btn--danger btn--block" onClick={() => setConfirmClear(true)}>
              <Icon name="trash" size={18} />
              Delete all data on this device
            </button>
          )}
        </section>

        <section className="card stack">
          <p className="title-md">About</p>
          <p className="fine-print">{DISCLAIMER}</p>
          <p className="fine-print">
            Cycle estimates fertile days from the dates you log. Calendar-based fertility
            awareness is not a reliable method of contraception on its own. For advice on
            contraception that suits you, see{' '}
            <a
              href="https://www.nhs.uk/contraception/"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--rose)' }}
            >
              NHS contraception guidance
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  )
}
