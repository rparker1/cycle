import { describe, expect, test } from 'vitest'
import { mergeProfile, type ProfileRecord } from './profileMerge'
import { aProfile } from '@/engine/__testutils__/fixtures'

const record = (over: Partial<ProfileRecord['profile']>, updatedAt: string): ProfileRecord => ({
  profile: aProfile(over),
  updatedAt,
})

/** What a device looks like before anyone has been through onboarding. */
const freshDevice = (updatedAt: string): ProfileRecord =>
  record({ onboardedAt: null, displayName: null, avgCycleLength: 28 }, updatedAt)

describe('mergeProfile', () => {
  test('pushes when the account has no profile yet', () => {
    const local = record({ avgCycleLength: 31 }, '2026-09-01T00:00:00.000Z')

    const result = mergeProfile(local, null)

    expect(result.direction).toBe('push')
    expect(result.profile.avgCycleLength).toBe(31)
  })

  test('pulls when this device has only untouched defaults', () => {
    const local = freshDevice('2026-09-20T00:00:00.000Z')
    const remote = record({ avgCycleLength: 31 }, '2026-09-01T00:00:00.000Z')

    const result = mergeProfile(local, remote)

    expect(result.direction).toBe('pull')
    expect(result.profile.avgCycleLength).toBe(31)
  })

  test('takes the more recently edited side', () => {
    const local = record({ avgCycleLength: 30 }, '2026-09-10T00:00:00.000Z')
    const remote = record({ avgCycleLength: 26 }, '2026-09-01T00:00:00.000Z')

    expect(mergeProfile(local, remote).profile.avgCycleLength).toBe(30)
    expect(mergeProfile(remote, local).profile.avgCycleLength).toBe(30)
  })

  /*
   * The important one. Signing in on a new phone must not push that phone's
   * empty defaults over a real profile, however the clocks compare. This is
   * the path that silently resets someone's cycle history.
   */
  test('NEVER lets an un-onboarded device overwrite a real profile', () => {
    const local = freshDevice('2099-01-01T00:00:00.000Z') // absurdly "newer"
    const remote = record(
      { onboardedAt: '2026-01-01T00:00:00.000Z', avgCycleLength: 31, displayName: 'Oriana' },
      '2026-01-01T00:00:00.000Z',
    )

    const result = mergeProfile(local, remote)

    expect(result.direction).toBe('pull')
    expect(result.profile.avgCycleLength).toBe(31)
    expect(result.profile.displayName).toBe('Oriana')
    expect(result.profile.onboardedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  test('still pushes a real profile over an un-onboarded remote', () => {
    const local = record({ onboardedAt: '2026-01-01T00:00:00.000Z' }, '2026-01-01T00:00:00.000Z')
    const remote = freshDevice('2099-01-01T00:00:00.000Z')

    expect(mergeProfile(local, remote).direction).toBe('push')
  })

  test('prefers the remote when both are un-onboarded and it is newer', () => {
    const local = record({ onboardedAt: null, avgCycleLength: 28 }, '2026-09-01T00:00:00.000Z')
    const remote = record({ onboardedAt: null, avgCycleLength: 33 }, '2026-09-10T00:00:00.000Z')

    expect(mergeProfile(local, remote).direction).toBe('pull')
  })

  test('reports no change when both sides already agree', () => {
    const same = record({ avgCycleLength: 29 }, '2026-09-01T00:00:00.000Z')

    expect(mergeProfile(same, { ...same }).direction).toBe('none')
  })
})
