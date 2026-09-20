/**
 * IndexedDB — the source of truth.
 *
 * The app is fully usable with no account and no network. Supabase is backup
 * and second-device sync only, layered on top of this.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { CycleResolution, DayLog, IsoDate, Profile } from '@/engine/types'

const DB_NAME = 'cycle'
const DB_VERSION = 1

export interface SyncMeta {
  key: 'sync'
  deviceId: string
  lastPulledAt: string | null
  lastPushedAt: string | null
}

interface CycleDB extends DBSchema {
  dayLogs: {
    key: IsoDate
    value: DayLog
    indexes: { byUpdatedAt: string }
  }
  resolutions: {
    key: IsoDate
    value: CycleResolution
    indexes: { byUpdatedAt: string }
  }
  profile: {
    key: 'me'
    value: Profile & { key: 'me'; updatedAt: string }
  }
  meta: {
    key: 'sync'
    value: SyncMeta
  }
}

let dbPromise: Promise<IDBPDatabase<CycleDB>> | null = null

export function getDb(): Promise<IDBPDatabase<CycleDB>> {
  dbPromise ??= openDB<CycleDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const logs = db.createObjectStore('dayLogs', { keyPath: 'logDate' })
      logs.createIndex('byUpdatedAt', 'updatedAt')

      const resolutions = db.createObjectStore('resolutions', { keyPath: 'cycleStart' })
      resolutions.createIndex('byUpdatedAt', 'updatedAt')

      db.createObjectStore('profile', { keyPath: 'key' })
      db.createObjectStore('meta', { keyPath: 'key' })
    },
  })
  return dbPromise
}

/**
 * Ask the browser to keep this data.
 *
 * iOS may evict script-writable storage from sites it considers stale. An
 * installed PWA is treated more kindly than a tab, but "more kindly" is not a
 * guarantee, which is why export and cloud sync both exist.
 */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export type { CycleDB }
