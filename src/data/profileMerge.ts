/**
 * Deciding which profile wins.
 *
 * Pure, and tested, because getting this wrong silently resets someone's
 * cycle settings. Last-write-wins on `updatedAt`, with one override that
 * matters more than the timestamps:
 *
 *   A device that has never been through onboarding must never overwrite a
 *   profile that has. Clocks disagree, a fresh install writes defaults with
 *   a current timestamp, and "newest wins" would hand victory to the empty
 *   side — wiping the real settings on first sign-in.
 */

import type { Profile } from '@/engine/types'

export interface ProfileRecord {
  profile: Profile
  updatedAt: string
}

export type MergeDirection = 'push' | 'pull' | 'none'

export interface MergeResult {
  profile: Profile
  updatedAt: string
  direction: MergeDirection
}

const onboarded = (record: ProfileRecord): boolean => record.profile.onboardedAt !== null

const same = (a: Profile, b: Profile): boolean =>
  a.displayName === b.displayName &&
  a.appName === b.appName &&
  a.avgCycleLength === b.avgCycleLength &&
  a.avgPeriodLength === b.avgPeriodLength &&
  a.lutealLength === b.lutealLength &&
  a.onboardedAt === b.onboardedAt

/**
 * `local` is always present — the repository hands back defaults when nothing
 * has been stored — so only the remote side can be missing.
 */
export function mergeProfile(local: ProfileRecord, remote: ProfileRecord | null): MergeResult {
  if (remote === null) return { ...local, direction: 'push' }

  if (same(local.profile, remote.profile)) {
    return { ...local, direction: 'none' }
  }

  // The safety override, before any timestamp comparison.
  if (!onboarded(local) && onboarded(remote)) return { ...remote, direction: 'pull' }
  if (onboarded(local) && !onboarded(remote)) return { ...local, direction: 'push' }

  return remote.updatedAt > local.updatedAt
    ? { ...remote, direction: 'pull' }
    : { ...local, direction: 'push' }
}
