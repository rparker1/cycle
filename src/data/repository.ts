/**
 * The storage boundary.
 *
 * Everything above this line — stores, screens, the engine — knows only this
 * interface. Supabase sits behind it as an optional add-on, so turning sync
 * off is a configuration change rather than a rewrite.
 */

import { todayIso } from '@/lib/date'
import { planPeriodRemoval, planPeriodRun, type DayWrite } from '@/engine/logging'
import type { ProfileRecord } from './profileMerge'
import type { CycleResolution, DayLog, IsoDate, Profile, Resolution } from '@/engine/types'
import { getDb } from './db'

const DEFAULT_PROFILE: Profile = {
  displayName: null,
  appName: 'Cycle',
  avgCycleLength: 28,
  avgPeriodLength: 5,
  lutealLength: 14,
  onboardedAt: null,
}

export interface CycleRepository {
  getProfile(): Promise<Profile>
  /** The profile plus when it last changed, for the sync merge. */
  getProfileRecord(): Promise<ProfileRecord>
  saveProfile(patch: Partial<Profile>): Promise<Profile>
  /** Overwrite wholesale, keeping the timestamp the other side reported. */
  replaceProfile(profile: Profile, updatedAt: string): Promise<void>
  listDayLogs(): Promise<DayLog[]>
  getDayLog(date: IsoDate): Promise<DayLog | null>
  upsertDayLog(date: IsoDate, patch: Partial<DayLog>): Promise<DayLog>
  deleteDayLog(date: IsoDate): Promise<void>
  listResolutions(): Promise<CycleResolution[]>
  resolveCycle(
    cycleStart: IsoDate,
    resolution: Resolution,
    options?: { observedLength?: number; note?: string },
  ): Promise<CycleResolution>
  exportAll(): Promise<ExportBundle>
  importAll(bundle: ExportBundle): Promise<void>
  clearAll(): Promise<void>
}

export interface ExportBundle {
  format: 'cycle-export'
  version: 1
  exportedAt: string
  profile: Profile
  dayLogs: DayLog[]
  resolutions: CycleResolution[]
}

const now = (): string => new Date().toISOString()

/** Stands in for "never edited on this device", so any real profile beats it. */
const EPOCH = '1970-01-01T00:00:00.000Z'

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`

function blankLog(date: IsoDate): DayLog {
  return {
    id: newId(),
    logDate: date,
    isPeriod: false,
    isPeriodStart: false,
    isPeriodEnd: false,
    flow: null,
    feltFertile: false,
    ovulationClaimed: false,
    ovulationConfidence: null,
    ovulationSigns: [],
    symptoms: [],
    mood: null,
    sexualActivity: null,
    protectionUsed: null,
    notes: null,
    predictionFeedback: null,
    updatedAt: now(),
    deletedAt: null,
  }
}

export const localRepository: CycleRepository = {
  async getProfile() {
    const db = await getDb()
    const stored = await db.get('profile', 'me')
    if (!stored) return { ...DEFAULT_PROFILE }
    const { key: _key, updatedAt: _updatedAt, ...profile } = stored
    return profile
  },

  async getProfileRecord() {
    const db = await getDb()
    const stored = await db.get('profile', 'me')
    if (!stored) return { profile: { ...DEFAULT_PROFILE }, updatedAt: EPOCH }
    const { key: _key, updatedAt, ...profile } = stored
    return { profile, updatedAt }
  },

  async saveProfile(patch) {
    const db = await getDb()
    const current = await this.getProfile()
    const next = { ...current, ...patch }
    await db.put('profile', { ...next, key: 'me', updatedAt: now() })
    return next
  },

  async replaceProfile(profile, updatedAt) {
    const db = await getDb()
    await db.put('profile', { ...profile, key: 'me', updatedAt })
  },

  async listDayLogs() {
    const db = await getDb()
    return (await db.getAll('dayLogs')).filter((l) => l.deletedAt === null)
  },

  async getDayLog(date) {
    const db = await getDb()
    const log = await db.get('dayLogs', date)
    return log && log.deletedAt === null ? log : null
  },

  async upsertDayLog(date, patch) {
    const db = await getDb()
    const existing = await db.get('dayLogs', date)
    const base = existing ?? blankLog(date)
    const next: DayLog = { ...base, ...patch, logDate: date, updatedAt: now(), deletedAt: null }
    await db.put('dayLogs', next)
    return next
  },

  /**
   * Soft delete. A hard delete on this phone would be invisible to the other
   * one, and the row would simply resurrect on the next sync.
   */
  async deleteDayLog(date) {
    const db = await getDb()
    const existing = await db.get('dayLogs', date)
    if (!existing) return
    await db.put('dayLogs', { ...existing, deletedAt: now(), updatedAt: now() })
  },

  async listResolutions() {
    const db = await getDb()
    return (await db.getAll('resolutions')).filter((r) => r.deletedAt === null)
  },

  async resolveCycle(cycleStart, resolution, options = {}) {
    const db = await getDb()
    const record: CycleResolution = {
      id: newId(),
      cycleStart,
      observedLength: options.observedLength ?? null,
      resolution,
      excludedFromBaseline: resolution === 'one_off' || resolution === 'mislogged',
      note: options.note ?? null,
      updatedAt: now(),
      deletedAt: null,
    }
    await db.put('resolutions', record)
    return record
  },

  async exportAll() {
    const db = await getDb()
    return {
      format: 'cycle-export',
      version: 1,
      exportedAt: now(),
      profile: await this.getProfile(),
      dayLogs: await db.getAll('dayLogs'),
      resolutions: await db.getAll('resolutions'),
    }
  },

  async importAll(bundle) {
    if (bundle.format !== 'cycle-export') {
      throw new Error('That file is not a Cycle export.')
    }
    const db = await getDb()
    const tx = db.transaction(['dayLogs', 'resolutions', 'profile'], 'readwrite')
    for (const log of bundle.dayLogs) await tx.objectStore('dayLogs').put(log)
    for (const r of bundle.resolutions) await tx.objectStore('resolutions').put(r)
    await tx.objectStore('profile').put({ ...bundle.profile, key: 'me', updatedAt: now() })
    await tx.done
  },

  async clearAll() {
    const db = await getDb()
    const tx = db.transaction(['dayLogs', 'resolutions', 'profile', 'meta'], 'readwrite')
    await Promise.all([
      tx.objectStore('dayLogs').clear(),
      tx.objectStore('resolutions').clear(),
      tx.objectStore('profile').clear(),
      tx.objectStore('meta').clear(),
    ])
    await tx.done
  },
}

/**
 * Record a whole period in one action.
 *
 * Deciding *what* to write lives in `@/engine/logging` and is unit tested;
 * this only performs the writes.
 */
export async function logPeriod(
  repo: CycleRepository,
  startDate: IsoDate,
  lengthDays: number,
): Promise<void> {
  const logs = await repo.listDayLogs()
  await applyDayWrites(repo, planPeriodRun(logs, startDate, lengthDays))
}

/** Undo a logged period — the whole run, not just the day that was tapped. */
export async function removePeriod(repo: CycleRepository, date: IsoDate): Promise<void> {
  const logs = await repo.listDayLogs()
  await applyDayWrites(repo, planPeriodRemoval(logs, date))
}

async function applyDayWrites(repo: CycleRepository, writes: DayWrite[]): Promise<void> {
  for (const write of writes) {
    await repo.upsertDayLog(write.date, write.patch)
  }
}

export { DEFAULT_PROFILE, blankLog, newId, todayIso }
