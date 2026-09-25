/**
 * Application state.
 *
 * Holds the raw records and derives the engine from them. Nothing derived is
 * ever stored — recomputing is cheap and a cached prediction that disagrees
 * with the logs is worse than no cache at all.
 */

import { create } from 'zustand'
import { createEngine, type Engine } from '@/engine/predict'
import type { CycleResolution, DayLog, Flow, IsoDate, Profile, Resolution } from '@/engine/types'
import { todayIso } from '@/lib/date'
import { requestPersistence } from '@/data/db'
import {
  localRepository,
  logPeriod,
  removePeriod,
  reportBleeding,
  type ExportBundle,
} from '@/data/repository'
import { getSession, syncConfigured, syncNow, type SyncResult } from '@/data/sync'

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error' | 'off'

interface State {
  ready: boolean
  today: IsoDate
  profile: Profile
  logs: DayLog[]
  resolutions: CycleResolution[]
  engine: Engine
  signedInAs: string | null
  syncStatus: SyncStatus
  syncMessage: string | null

  load(): Promise<void>
  refreshToday(): void
  saveProfile(patch: Partial<Profile>): Promise<void>
  completeOnboarding(input: {
    displayName: string
    avgCycleLength: number
    avgPeriodLength: number
    lastPeriodStart: IsoDate
  }): Promise<void>
  updateDay(date: IsoDate, patch: Partial<DayLog>): Promise<void>
  /** Record a whole period: a start date and how many days it ran. */
  logPeriod(startDate: IsoDate, lengthDays: number): Promise<void>
  /** Undo a logged period — the whole run, not just one day. */
  removePeriod(date: IsoDate): Promise<void>
  /** "Were you bleeding this day?" for a day of the current period. */
  reportBleeding(date: IsoDate, bleeding: boolean, flow?: Flow): Promise<void>
  resolveCycle(
    cycleStart: IsoDate,
    resolution: Resolution,
    options?: { observedLength?: number; note?: string },
  ): Promise<void>
  insertMissedPeriod(date: IsoDate, cycleStart: IsoDate): Promise<void>
  sync(): Promise<SyncResult>
  refreshSession(): Promise<void>
  exportAll(): Promise<ExportBundle>
  importAll(bundle: ExportBundle): Promise<void>
  clearAll(): Promise<void>
}

const EMPTY_PROFILE: Profile = {
  displayName: null,
  appName: 'Cycle',
  avgCycleLength: 28,
  avgPeriodLength: 5,
  lutealLength: 14,
  onboardedAt: null,
}

const buildEngine = (
  today: IsoDate,
  logs: DayLog[],
  resolutions: CycleResolution[],
  profile: Profile,
): Engine => createEngine({ today, logs, resolutions, profile })

export const useCycleStore = create<State>((set, get) => ({
  ready: false,
  today: todayIso(),
  profile: EMPTY_PROFILE,
  logs: [],
  resolutions: [],
  engine: buildEngine(todayIso(), [], [], EMPTY_PROFILE),
  signedInAs: null,
  syncStatus: syncConfigured() ? 'idle' : 'off',
  syncMessage: null,

  async load() {
    const [profile, logs, resolutions] = await Promise.all([
      localRepository.getProfile(),
      localRepository.listDayLogs(),
      localRepository.listResolutions(),
    ])
    const today = todayIso()
    set({
      ready: true,
      today,
      profile,
      logs,
      resolutions,
      engine: buildEngine(today, logs, resolutions, profile),
    })
    await get().refreshSession()
    if (syncConfigured()) void get().sync()
  },

  /** Called when the app returns to the foreground; a PWA can be open for days. */
  refreshToday() {
    const today = todayIso()
    if (today === get().today) return
    const { logs, resolutions, profile } = get()
    set({ today, engine: buildEngine(today, logs, resolutions, profile) })
  },

  async saveProfile(patch) {
    const profile = await localRepository.saveProfile(patch)
    const { today, logs, resolutions } = get()
    set({ profile, engine: buildEngine(today, logs, resolutions, profile) })
  },

  async completeOnboarding(input) {
    await localRepository.saveProfile({
      displayName: input.displayName.trim() || null,
      avgCycleLength: input.avgCycleLength,
      avgPeriodLength: input.avgPeriodLength,
      onboardedAt: new Date().toISOString(),
    })
    await logPeriod(localRepository, input.lastPeriodStart, input.avgPeriodLength)
    void requestPersistence()
    await reload(set, get)
  },

  async updateDay(date, patch) {
    await localRepository.upsertDayLog(date, patch)
    await reload(set, get)
  },

  async logPeriod(startDate, lengthDays) {
    await logPeriod(localRepository, startDate, lengthDays)
    await reload(set, get)
  },

  async removePeriod(date) {
    await removePeriod(localRepository, date)
    await reload(set, get)
  },

  async reportBleeding(date, bleeding, flow) {
    const current = get().engine.cycles.find((c) => c.isCurrent)
    if (!current) return
    await reportBleeding(localRepository, current.startDate, date, bleeding, flow)
    await reload(set, get)
  },

  async resolveCycle(cycleStart, resolution, options) {
    await localRepository.resolveCycle(cycleStart, resolution, options)
    await reload(set, get)
  },

  /**
   * Record a period the user forgot to log, splitting an over-long cycle.
   * Also files the resolution, so the original cycle is not queried again.
   */
  async insertMissedPeriod(date, cycleStart) {
    await logPeriod(localRepository, date, get().engine.prediction.periodLength)
    await localRepository.resolveCycle(cycleStart, 'missed_period', {
      note: `Missed period recorded on ${date}.`,
    })
    await reload(set, get)
  },

  async sync() {
    if (!syncConfigured()) return { status: 'skipped' as const, pulled: 0, pushed: 0 }
    set({ syncStatus: 'syncing', syncMessage: null })
    const result = await syncNow(localRepository)
    if (result.status === 'ok') {
      await reload(set, get)
      set({ syncStatus: 'ok', syncMessage: null })
    } else if (result.status === 'error') {
      set({ syncStatus: 'error', syncMessage: result.message ?? 'Sync failed.' })
    } else {
      set({ syncStatus: 'idle' })
    }
    return result
  },

  async refreshSession() {
    const session = await getSession()
    set({ signedInAs: session?.user.email ?? null })
  },

  exportAll: () => localRepository.exportAll(),

  async importAll(bundle) {
    await localRepository.importAll(bundle)
    await reload(set, get)
  },

  async clearAll() {
    await localRepository.clearAll()
    await reload(set, get)
  },
}))

async function reload(
  set: (partial: Partial<State>) => void,
  get: () => State,
): Promise<void> {
  const [profile, logs, resolutions] = await Promise.all([
    localRepository.getProfile(),
    localRepository.listDayLogs(),
    localRepository.listResolutions(),
  ])
  set({
    profile,
    logs,
    resolutions,
    engine: buildEngine(get().today, logs, resolutions, profile),
  })
}
