/**
 * Optional Supabase sync.
 *
 * Backup and second-device only. Nothing here is on the critical path: if the
 * project is not configured, the network is down, or the user never signs in,
 * the app carries on unchanged against IndexedDB.
 *
 * Conflict resolution is last-write-wins on `updated_at`. For one person with
 * two devices that is genuinely sufficient; anything cleverer would be
 * machinery that never gets exercised.
 */

import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { CycleResolution, DayLog, IsoDate, Profile } from '@/engine/types'
import { getDb } from './db'
import type { CycleRepository } from './repository'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

let client: SupabaseClient | null = null

export const syncConfigured = (): boolean => Boolean(URL && KEY)

/**
 * Loaded on demand.
 *
 * The Supabase client is the single largest thing this app could ship, and
 * most sessions never touch it — the app works entirely offline. Importing it
 * dynamically keeps it out of the first paint, which is what a phone on a bad
 * connection actually feels.
 */
export async function getSupabase(): Promise<SupabaseClient | null> {
  if (!syncConfigured()) return null
  if (client) return client
  const { createClient } = await import('@supabase/supabase-js')
  client = createClient(URL as string, KEY as string, {
    auth: { persistSession: true, autoRefreshToken: true },
  })
  return client
}

export async function getSession(): Promise<Session | null> {
  const sb = await getSupabase()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  return data.session
}

export async function signIn(email: string, password: string): Promise<void> {
  const sb = await getSupabase()
  if (!sb) throw new Error('Sync is not configured in this build.')
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw error
}

/**
 * Create an account.
 *
 * Supabase confirms email addresses by default, and when it does, sign-up
 * returns no session — the account exists but cannot be used until a link in
 * an email is clicked. Reporting that back is the difference between a clear
 * instruction and a screen that appears to have ignored you.
 */
export async function signUp(
  email: string,
  password: string,
): Promise<{ needsConfirmation: boolean }> {
  const sb = await getSupabase()
  if (!sb) throw new Error('Sync is not configured in this build.')
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      // Where the confirmation link should land. Without this, Supabase
      // falls back to the project's Site URL, which defaults to
      // http://localhost:3000 — so the link dumps you on a dead page.
      // The address must also be allow-listed in the dashboard under
      // Authentication → URL Configuration.
      emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
    },
  })
  if (error) throw error
  return { needsConfirmation: data.session === null }
}

export async function signOut(): Promise<void> {
  const sb = await getSupabase()
  await sb?.auth.signOut()
}

// ---------------------------------------------------------------------------
// Row mapping. The database is snake_case; the app is camelCase.
// ---------------------------------------------------------------------------

interface DayLogRow {
  id: string
  user_id: string
  log_date: IsoDate
  is_period: boolean
  is_period_start: boolean
  is_period_end: boolean
  flow: DayLog['flow']
  felt_fertile: boolean
  ovulation_claimed: boolean
  ovulation_confidence: DayLog['ovulationConfidence']
  ovulation_signs: string[]
  symptoms: string[]
  mood: string | null
  sexual_activity: boolean | null
  protection_used: boolean | null
  notes: string | null
  prediction_feedback: DayLog['predictionFeedback']
  updated_at: string
  deleted_at: string | null
}

const toDayLog = (r: DayLogRow): DayLog => ({
  id: r.id,
  logDate: r.log_date,
  isPeriod: r.is_period,
  isPeriodStart: r.is_period_start,
  isPeriodEnd: r.is_period_end,
  flow: r.flow,
  feltFertile: r.felt_fertile,
  ovulationClaimed: r.ovulation_claimed,
  ovulationConfidence: r.ovulation_confidence,
  ovulationSigns: r.ovulation_signs ?? [],
  symptoms: r.symptoms ?? [],
  mood: r.mood,
  sexualActivity: r.sexual_activity,
  protectionUsed: r.protection_used,
  notes: r.notes,
  predictionFeedback: r.prediction_feedback,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
})

const fromDayLog = (l: DayLog, userId: string): Omit<DayLogRow, 'id'> & { id?: string } => ({
  user_id: userId,
  log_date: l.logDate,
  is_period: l.isPeriod,
  is_period_start: l.isPeriodStart,
  is_period_end: l.isPeriodEnd,
  flow: l.flow,
  felt_fertile: l.feltFertile,
  ovulation_claimed: l.ovulationClaimed,
  ovulation_confidence: l.ovulationConfidence,
  ovulation_signs: l.ovulationSigns,
  symptoms: l.symptoms,
  mood: l.mood,
  // The database rejects "protected" without "activity", so never send the
  // pair half-filled.
  sexual_activity: l.sexualActivity,
  protection_used: l.sexualActivity === true ? l.protectionUsed : null,
  notes: l.notes,
  prediction_feedback: l.predictionFeedback,
  updated_at: l.updatedAt,
  deleted_at: l.deletedAt,
})

interface ResolutionRow {
  id: string
  user_id: string
  cycle_start: IsoDate
  observed_length: number | null
  resolution: CycleResolution['resolution']
  excluded_from_baseline: boolean
  note: string | null
  updated_at: string
  deleted_at: string | null
}

const toResolution = (r: ResolutionRow): CycleResolution => ({
  id: r.id,
  cycleStart: r.cycle_start,
  observedLength: r.observed_length,
  resolution: r.resolution,
  excludedFromBaseline: r.excluded_from_baseline,
  note: r.note,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
})

const fromResolution = (r: CycleResolution, userId: string) => ({
  user_id: userId,
  cycle_start: r.cycleStart,
  observed_length: r.observedLength,
  resolution: r.resolution,
  excluded_from_baseline: r.excludedFromBaseline,
  note: r.note,
  updated_at: r.updatedAt,
  deleted_at: r.deletedAt,
})

// ---------------------------------------------------------------------------

export interface SyncResult {
  status: 'ok' | 'skipped' | 'error'
  pulled: number
  pushed: number
  message?: string
}

const EPOCH = '1970-01-01T00:00:00.000Z'

export async function syncNow(repo: CycleRepository): Promise<SyncResult> {
  const sb = await getSupabase()
  const session = await getSession()
  if (!sb || !session) return { status: 'skipped', pulled: 0, pushed: 0 }

  const userId = session.user.id
  const db = await getDb()
  const meta = (await db.get('meta', 'sync')) ?? {
    key: 'sync' as const,
    deviceId: crypto.randomUUID(),
    lastPulledAt: null,
    lastPushedAt: null,
  }

  try {
    let pulled = 0
    let pushed = 0
    const since = meta.lastPulledAt ?? EPOCH
    const startedAt = new Date().toISOString()

    // --- pull -------------------------------------------------------------
    const { data: remoteLogs, error: pullLogsError } = await sb
      .from('day_logs')
      .select('*')
      .gt('updated_at', since)
    if (pullLogsError) throw pullLogsError

    for (const row of (remoteLogs ?? []) as DayLogRow[]) {
      const remote = toDayLog(row)
      const local = await db.get('dayLogs', remote.logDate)
      if (!local || remote.updatedAt > local.updatedAt) {
        await db.put('dayLogs', remote)
        pulled++
      }
    }

    const { data: remoteRes, error: pullResError } = await sb
      .from('cycle_resolutions')
      .select('*')
      .gt('updated_at', since)
    if (pullResError) throw pullResError

    for (const row of (remoteRes ?? []) as ResolutionRow[]) {
      const remote = toResolution(row)
      const local = await db.get('resolutions', remote.cycleStart)
      if (!local || remote.updatedAt > local.updatedAt) {
        await db.put('resolutions', remote)
        pulled++
      }
    }

    // --- push -------------------------------------------------------------
    const pushSince = meta.lastPushedAt ?? EPOCH
    const localLogs = (await db.getAll('dayLogs')).filter((l) => l.updatedAt > pushSince)
    if (localLogs.length > 0) {
      const { error } = await sb
        .from('day_logs')
        .upsert(
          localLogs.map((l) => fromDayLog(l, userId)),
          { onConflict: 'user_id,log_date' },
        )
      if (error) throw error
      pushed += localLogs.length
    }

    const localRes = (await db.getAll('resolutions')).filter((r) => r.updatedAt > pushSince)
    if (localRes.length > 0) {
      const { error } = await sb
        .from('cycle_resolutions')
        .upsert(
          localRes.map((r) => fromResolution(r, userId)),
          { onConflict: 'user_id,cycle_start' },
        )
      if (error) throw error
      pushed += localRes.length
    }

    await pushProfile(sb, repo, userId)

    await db.put('meta', { ...meta, lastPulledAt: startedAt, lastPushedAt: startedAt })
    return { status: 'ok', pulled, pushed }
  } catch (error) {
    return {
      status: 'error',
      pulled: 0,
      pushed: 0,
      message: error instanceof Error ? error.message : 'Sync failed.',
    }
  }
}

async function pushProfile(
  sb: SupabaseClient,
  repo: CycleRepository,
  userId: string,
): Promise<void> {
  const profile: Profile = await repo.getProfile()
  await sb.from('profiles').upsert(
    {
      user_id: userId,
      display_name: profile.displayName,
      app_name: profile.appName,
      avg_cycle_length: profile.avgCycleLength,
      avg_period_length: profile.avgPeriodLength,
      luteal_length: profile.lutealLength,
      onboarded_at: profile.onboardedAt,
    },
    { onConflict: 'user_id' },
  )
}
