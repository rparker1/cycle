# Daily Period Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn each day in the day sheet into a report ("still bleeding?", "has it started?", symptoms) that feeds the prediction engine, and stop the sheet creating a false second period start.

**Architecture:** One new stored field, `noBleed`, gives the app a way to record "explicitly not bleeding". Pure engine functions do the thinking, and each is unit tested:
- `learnPeriodLength`
- the "not yet" floor and late-period logic in `createEngine`
- `planBleedingReport` for writes
- `dayPrompt` to choose the question

The React sheets only render what `dayPrompt` returns and call store actions.

**Tech Stack:** React 18, TypeScript 5, zustand, idb (IndexedDB), Supabase JS v2, Vitest 2, Vite 5 PWA.

**Spec:** `docs/superpowers/specs/2026-09-25-daily-period-reports-design.md`

**Deviations from the spec, deliberate:**
- `learnPeriodLength(cycles, today, profile)` takes no `logs`. `Cycle` already carries `periodEndDate` and `periodEndConfirmed`, derived from the logs, so this avoids a second derivation.
- `Prediction` gains `nextPeriodExpected`, the estimate *before* "not yet" answers. `dayPrompt` and the late test both need the unshifted values, and the spec says "unshifted" throughout.
- A late day inside the fertile or buffer window keeps `high` / `elevated` rather than dropping to `unknown`. Both advise protection; this keeps the stricter one. In practice the windows fall before the period, so they do not overlap.

## Global Constraints

- Every calendar date is an `IsoDate` (`YYYY-MM-DD` local string). Never a `Date` or timestamp in domain code.
- The engine (`src/engine/`) stays pure: no storage, no network, no clock. `today` is an argument.
- Uncertainty widens caution, never narrows it. "Not yet" answers must not move ovulation, the fertile window or the protection window.
- User-facing copy: the word "safe" never appears; no effectiveness figures; no medical advice; UK English.
- `isPeriod` and `noBleed` are never both true on one day, and every planner that sets `isPeriod: true` also sets `noBleed: false`.
- No planner in this plan ever sets `isPeriodStart: true`, except the existing `planPeriodRun` on its first day.
- `learnPeriodLength` needs at least 2 counting periods (`MIN_PERIODS_FOR_HISTORY = 2`), and uses the last 6 (`PERIOD_HISTORY_WINDOW = 6`).
- The `logStart` prompt is never offered on current-cycle days before cycle day 15 (`LOG_START_FROM_CYCLE_DAY = 15`).
- Commits: conventional subject, author `Ross Parker <rossp318@gmail.com>` (set repo-locally already), trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work on branch `feat/daily-period-reports`. Never push `main`: merging to `main` deploys to GitHub Pages.

## Review Focus

1. **The screenshot case.** The current cycle has only a start-day log (older data, no end), and the user taps day 5. They expect "Were you bleeding this day?", and that answering fills days 2–4 without adding a second start. *(Task 4 and Task 5 tests.)*
2. **Changing their mind on the same day.** "No", then a flow chip, on the same date. They expect the day to end up bleeding, `noBleed` cleared, and the end flag moved off the day before. *(Task 4 test "a later Yes overrides an earlier No on the same day".)*
3. **"Not yet", then "It started this day" on the same date.** They expect the start to be logged and `noBleed` cleared, with no constraint violation when syncing. *(Task 1 test "planPeriodRun clears noBleed".)*
4. **Answering "Not yet" today.** They expect the question to stay on screen, so they can change the answer, rather than vanish because the estimate moved to tomorrow. *(Task 5 test "still asks after a not-yet answer today".)*
5. **Old data without the field.** IndexedDB rows written before this change, old exports, and Supabase rows fetched before migration 0002 is applied must all read as `noBleed: false`. *(Task 1 tests for `normaliseDayLog` and `toDayLog`.)*

---

### Task 1: The `noBleed` field end to end

**Files:**
- Create: `supabase/migrations/0002_no_bleed.sql`
- Create: `src/data/normalise.ts`
- Create: `src/data/normalise.test.ts`
- Create: `src/data/sync.test.ts`
- Modify: `src/engine/types.ts` (`DayLog`)
- Modify: `src/engine/__testutils__/fixtures.ts` (`aLog`)
- Modify: `src/data/repository.ts` (`blankLog`, `listDayLogs`, `getDayLog`, `importAll`)
- Modify: `src/data/sync.ts:100-161` (`DayLogRow`, `toDayLog`, `fromDayLog`; export the two mappers)
- Modify: `src/engine/logging.ts` (`planPeriodRun`)
- Test: `src/engine/logging.test.ts`

**Interfaces:**
- Produces: `DayLog.noBleed: boolean`; `normaliseDayLog(log: DayLog): DayLog`; exported `toDayLog(r: DayLogRow): DayLog` and `fromDayLog(l: DayLog, userId: string)` from `src/data/sync.ts`; exported type `DayLogRow`.

- [ ] **Step 1: Add the field to the type and fixture**

In `src/engine/types.ts`, inside `interface DayLog`, directly after `isPeriodEnd: boolean`:

```ts
  /**
   * The user explicitly said they were not bleeding this day. Distinct from
   * "nothing logged", which means we do not know. Never true with `isPeriod`.
   */
  noBleed: boolean
```

In `src/engine/__testutils__/fixtures.ts`, inside `aLog`'s returned object, after `isPeriodEnd: false,`:

```ts
    noBleed: false,
```

In `src/data/repository.ts`, inside `blankLog`'s returned object, after `isPeriodEnd: false,`:

```ts
    noBleed: false,
```

- [ ] **Step 2: Run the typecheck to find every other constructor**

Run: `npm run typecheck`
Expected: errors only in `src/data/sync.ts` (`toDayLog` is missing `noBleed`). Fix them in Step 6. If any other file errors, add `noBleed: false` there in the same way.

- [ ] **Step 3: Write failing tests for normalising and syncing**

Create `src/data/normalise.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { normaliseDayLog } from './normalise'
import { aLog } from '@/engine/__testutils__/fixtures'
import type { DayLog } from '@/engine/types'

describe('normaliseDayLog', () => {
  test('reads a row written before noBleed existed as not reported', () => {
    const { noBleed: _dropped, ...legacy } = aLog('2026-09-20')
    const log = normaliseDayLog(legacy as unknown as DayLog)
    expect(log.noBleed).toBe(false)
  })

  test('keeps an explicit noBleed', () => {
    expect(normaliseDayLog(aLog('2026-09-20', { noBleed: true })).noBleed).toBe(true)
  })

  test('never lets a stored row claim bleeding and not bleeding at once', () => {
    const log = normaliseDayLog(aLog('2026-09-20', { isPeriod: true, noBleed: true }))
    expect(log.noBleed).toBe(false)
  })
})
```

Create `src/data/sync.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { fromDayLog, toDayLog, type DayLogRow } from './sync'
import { aLog } from '@/engine/__testutils__/fixtures'

describe('day log row mapping', () => {
  test('round-trips noBleed', () => {
    const log = aLog('2026-09-24', { noBleed: true })
    const row = { id: log.id, ...fromDayLog(log, 'user-1') } as DayLogRow
    expect(row.no_bleed).toBe(true)
    expect(toDayLog(row).noBleed).toBe(true)
  })

  test('reads a row from a database without the column as not reported', () => {
    const log = aLog('2026-09-24')
    const { no_bleed: _dropped, ...row } = { id: log.id, ...fromDayLog(log, 'user-1') }
    expect(toDayLog(row as unknown as DayLogRow).noBleed).toBe(false)
  })
})
```

Add to `src/engine/logging.test.ts`, inside `describe('planPeriodRun', …)`:

```ts
  test('clears a not-yet answer on every day it books', () => {
    const logs = [aLog('2026-09-24', { noBleed: true })]
    const writes = planPeriodRun(logs, '2026-09-24', 3)
    expect(writes.filter((w) => w.patch.isPeriod === true).every((w) => w.patch.noBleed === false))
      .toBe(true)
  })
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/data src/engine/logging.test.ts`
Expected: FAIL. The `normalise` module is not found, `fromDayLog`/`toDayLog` are not exported, and `noBleed` is undefined in the `planPeriodRun` patch.

- [ ] **Step 5: Implement `normaliseDayLog` and use it on every read path**

Create `src/data/normalise.ts`:

```ts
/**
 * Bring a stored day log up to the current shape.
 *
 * Rows written before a field existed — on this phone, in an old export, or
 * in a Supabase project that has not had the latest migration — arrive
 * without it. Reading them through here keeps the engine's `=== true` checks
 * honest and the "bleeding and not bleeding" pair impossible.
 */

import type { DayLog } from '@/engine/types'

export function normaliseDayLog(log: DayLog): DayLog {
  return { ...log, noBleed: log.noBleed === true && log.isPeriod !== true }
}
```

In `src/data/repository.ts`, add `import { normaliseDayLog } from './normalise'` beside the other imports, then change:

```ts
  async listDayLogs() {
    const db = await getDb()
    return (await db.getAll('dayLogs'))
      .filter((l) => l.deletedAt === null)
      .map(normaliseDayLog)
  },

  async getDayLog(date) {
    const db = await getDb()
    const log = await db.get('dayLogs', date)
    return log && log.deletedAt === null ? normaliseDayLog(log) : null
  },
```

and in `upsertDayLog`, normalise the base so a legacy row gains the field on its first write:

```ts
    const base = existing ? normaliseDayLog(existing) : blankLog(date)
```

and in `importAll`:

```ts
    for (const log of bundle.dayLogs) await tx.objectStore('dayLogs').put(normaliseDayLog(log))
```

- [ ] **Step 6: Map the column in sync and export the mappers**

In `src/data/sync.ts`:
- Change `interface DayLogRow` to `export interface DayLogRow`, and add `no_bleed: boolean` after `is_period_end: boolean`.
- Change `const toDayLog` to `export const toDayLog`, and add after `isPeriodEnd: r.is_period_end,`:

```ts
  // Absent until migration 0002 has been applied to the project.
  noBleed: r.no_bleed === true && r.is_period !== true,
```

- Change `const fromDayLog` to `export const fromDayLog`, and add after `is_period_end: l.isPeriodEnd,`:

```ts
  // The database rejects the pair together, so never send it.
  no_bleed: l.noBleed === true && l.isPeriod !== true,
```

- [ ] **Step 7: Clear `noBleed` in `planPeriodRun`**

In `src/engine/logging.ts`, inside `planPeriodRun`'s first loop, change the patch to:

```ts
    const patch: Partial<DayLog> = {
      isPeriod: true,
      isPeriodStart: i === 0,
      isPeriodEnd: i === length - 1,
      noBleed: false,
    }
```

- [ ] **Step 8: Write the migration**

Create `supabase/migrations/0002_no_bleed.sql`:

```sql
-- Cycle — "not bleeding" reports
--
-- A day with no row, or a row with is_period false, means "not reported".
-- no_bleed records that the user explicitly said they were not bleeding,
-- which is what lets "has your period started? — not yet" move a forecast.

alter table public.day_logs
  add column if not exists no_bleed boolean not null default false;

alter table public.day_logs
  drop constraint if exists day_logs_no_bleed_excludes_period;

alter table public.day_logs
  add constraint day_logs_no_bleed_excludes_period
  check (not (no_bleed and is_period));
```

- [ ] **Step 9: Run all tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS (110 existing + 6 new), typecheck clean.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/0002_no_bleed.sql src/data src/engine/types.ts src/engine/__testutils__/fixtures.ts src/engine/logging.ts src/engine/logging.test.ts
git commit -m "feat: record days the user was explicitly not bleeding

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Learn period length from confirmed periods

**Files:**
- Modify: `src/engine/cycles.ts` (add `learnPeriodLength`)
- Test: `src/engine/cycles.test.ts`

**Interfaces:**
- Consumes: `Cycle` (`startDate`, `periodEndDate`, `periodEndConfirmed`), `MAX_PERIOD_DAYS` from `./logging`.
- Produces: `learnPeriodLength(cycles: Cycle[], today: IsoDate, profile: Profile): number`.

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/cycles.test.ts`. Change line 2 to `import { analyseCycles, deriveCycles, learnLutealLength, learnPeriodLength } from './cycles'`. Make sure the fixture import includes `aPeriodDay`, `aPeriodStart` and `aProfile`, and the type import includes `DayLog`. Then add:

```ts
/** A booked period: start, bleeding days, and a confirmed last day. */
const bookedPeriod = (start: string, days: number): DayLog[] => {
  const logs: DayLog[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(`${start}T00:00:00`)
    d.setDate(d.getDate() + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    logs.push(
      i === 0
        ? aPeriodStart(iso, { isPeriodEnd: days === 1 })
        : aPeriodDay(iso, { isPeriodEnd: i === days - 1 }),
    )
  }
  return logs
}

describe('learnPeriodLength', () => {
  const profile = aProfile({ avgPeriodLength: 5 })

  test('keeps the onboarding answer with no confirmed periods', () => {
    const cycles = deriveCycles([aPeriodStart('2026-09-01')], '2026-09-20')
    expect(learnPeriodLength(cycles, '2026-09-20', profile)).toBe(5)
  })

  test('keeps the onboarding answer with only one confirmed period', () => {
    const logs = [...bookedPeriod('2026-08-01', 3), aPeriodStart('2026-08-29')]
    expect(learnPeriodLength(deriveCycles(logs, '2026-09-10'), '2026-09-10', profile)).toBe(5)
  })

  test('uses the median once two periods are confirmed', () => {
    const logs = [...bookedPeriod('2026-07-01', 3), ...bookedPeriod('2026-07-29', 4)]
    // median of 3 and 4 is 3.5, rounded to 4
    expect(learnPeriodLength(deriveCycles(logs, '2026-08-20'), '2026-08-20', profile)).toBe(4)
  })

  test('does not count a booked end that has not happened yet', () => {
    const logs = [...bookedPeriod('2026-07-01', 3), ...bookedPeriod('2026-07-29', 7)]
    // Today is day 3 of the second period; its booked end (4 Aug) is ahead.
    expect(learnPeriodLength(deriveCycles(logs, '2026-07-31'), '2026-07-31', profile)).toBe(5)
  })

  test('uses only the six most recent confirmed periods', () => {
    const logs = [
      ...bookedPeriod('2026-01-01', 9),
      ...bookedPeriod('2026-01-29', 9),
      ...bookedPeriod('2026-02-26', 3),
      ...bookedPeriod('2026-03-26', 3),
      ...bookedPeriod('2026-04-23', 3),
      ...bookedPeriod('2026-05-21', 3),
      ...bookedPeriod('2026-06-18', 3),
      ...bookedPeriod('2026-07-16', 3),
    ]
    expect(learnPeriodLength(deriveCycles(logs, '2026-08-01'), '2026-08-01', profile)).toBe(3)
  })

  test('ignores an unconfirmed period', () => {
    const logs = [
      ...bookedPeriod('2026-07-01', 3),
      aPeriodStart('2026-07-29'),
      aPeriodDay('2026-07-30'),
      ...bookedPeriod('2026-08-26', 3),
    ]
    // Only two confirmed (3 and 3); the unconfirmed 2-day run is ignored.
    expect(learnPeriodLength(deriveCycles(logs, '2026-09-10'), '2026-09-10', profile)).toBe(3)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/engine/cycles.test.ts`
Expected: FAIL, `learnPeriodLength is not a function` (or not exported).

- [ ] **Step 3: Implement**

In `src/engine/cycles.ts`, add `import { MAX_PERIOD_DAYS } from './logging'` beside the other imports. Add constants beside the others:

```ts
/** How many recent confirmed periods inform the learned period length. */
const PERIOD_HISTORY_WINDOW = 6

/** One confirmed period is an anecdote; two is the least that is a pattern. */
const MIN_PERIODS_FOR_HISTORY = 2
```

Then add, after `learnLutealLength`:

```ts
/**
 * Learn how long the user's periods actually last.
 *
 * A period counts once its last day has been confirmed — by a "no, not
 * bleeding" the day after, or by booking a length — and that day is in the
 * past. A length booked on day one for days that have not happened yet is a
 * guess, not an observation, and must not teach the model anything.
 */
export function learnPeriodLength(cycles: Cycle[], today: IsoDate, profile: Profile): number {
  const observations = cycles
    .filter((c) => c.periodEndConfirmed && c.periodEndDate !== null && c.periodEndDate < today)
    .map((c) => clamp(diffDays(c.startDate, c.periodEndDate as IsoDate) + 1, 1, MAX_PERIOD_DAYS))
    .slice(-PERIOD_HISTORY_WINDOW)

  if (observations.length < MIN_PERIODS_FOR_HISTORY) return profile.avgPeriodLength
  return Math.round(median(observations))
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/engine/cycles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/cycles.ts src/engine/cycles.test.ts
git commit -m "feat: learn period length from confirmed periods

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Engine uses learned length, "not yet" answers and late periods

**Files:**
- Modify: `src/engine/types.ts` (`Prediction`, `DayAssessment`)
- Modify: `src/engine/predict.ts`
- Modify: `src/lib/guidance.ts` (`guidanceFor`)
- Test: `src/engine/predict.test.ts`
- Create: `src/lib/guidance.test.ts`

**Interfaces:**
- Consumes: `learnPeriodLength` (Task 2); `DayLog.noBleed` (Task 1).
- Produces:
  - `Prediction.periodLength: number`
  - `Prediction.nextPeriodExpected: DateRange | null` (the estimate before "not yet" answers)
  - `Prediction.periodLate: boolean`
  - `DayAssessment.periodLate: boolean`
  - exported `periodEndFor(cycle: Cycle, periodLength: number): IsoDate` from `src/engine/predict.ts`

- [ ] **Step 1: Write the failing engine tests**

Add to `src/engine/predict.test.ts`, extending the fixture imports with `aLog`:

```ts
describe('learned period length', () => {
  test('is reported and used for the assumed period', () => {
    // Two confirmed 3-day periods, then a start-only current cycle.
    const logs = [
      aPeriodStart('2026-07-01'), aPeriodDay('2026-07-02'), aPeriodDay('2026-07-03', { isPeriodEnd: true }),
      aPeriodStart('2026-07-29'), aPeriodDay('2026-07-30'), aPeriodDay('2026-07-31', { isPeriodEnd: true }),
      aPeriodStart('2026-08-26'),
    ]
    const engine = createEngine(input(logs, '2026-08-29', aProfile({ avgPeriodLength: 5 })))
    expect(engine.prediction.periodLength).toBe(3)
    // Day 3 is still menstrual, day 4 is not — with 5 it would be day 5.
    expect(engine.assessDay('2026-08-28').phase).toBe('menstrual')
    expect(engine.assessDay('2026-08-29').phase).toBe('follicular')
  })
})

describe('not-yet answers', () => {
  // Four regular 28-day cycles; the current one started 2026-04-23, so the
  // next period is most likely 2026-05-21 (earliest 05-20, latest 05-22).
  // Spread is 1: the MAD of identical lengths is 0, floored at 1.
  const logs = periodStarts('2026-01-01', [28, 28, 28, 28])

  test('without one, the estimate is unchanged', () => {
    const { prediction } = createEngine(input(logs, '2026-05-20'))
    expect(prediction.nextPeriod).toEqual(prediction.nextPeriodExpected)
  })

  test('moves the earliest and likely dates past the answered day', () => {
    const answered = [...logs, aLog('2026-05-21', { noBleed: true })]
    const { prediction } = createEngine(input(answered, '2026-05-21'))
    expect(prediction.nextPeriodExpected?.likely).toBe('2026-05-21')
    expect(prediction.nextPeriod?.earliest).toBe('2026-05-22')
    expect(prediction.nextPeriod?.likely).toBe('2026-05-22')
    expect(prediction.nextPeriod?.latest).toBe('2026-05-22')
  })

  test('never leaves latest before likely', () => {
    const answered = [...logs, aLog('2026-05-25', { noBleed: true })]
    const { prediction } = createEngine(input(answered, '2026-05-25'))
    expect(prediction.nextPeriod?.likely).toBe('2026-05-26')
    const next = prediction.nextPeriod
    expect(next && next.latest >= next.likely).toBe(true)
  })

  test('does not move ovulation, the fertile window or the protection window', () => {
    const before = createEngine(input(logs, '2026-05-21')).prediction
    const after = createEngine(
      input([...logs, aLog('2026-05-21', { noBleed: true })], '2026-05-21'),
    ).prediction
    expect(after.ovulation).toEqual(before.ovulation)
    expect(after.fertileWindow).toEqual(before.fertileWindow)
    expect(after.protectionWindow).toEqual(before.protectionWindow)
  })

  test('ignores a not-bleeding day from the end of the current period', () => {
    const answered = [...logs, aLog('2026-04-28', { noBleed: true })]
    const { prediction } = createEngine(input(answered, '2026-05-02'))
    expect(prediction.nextPeriod).toEqual(prediction.nextPeriodExpected)
  })
})

describe('late period', () => {
  const logs = periodStarts('2026-01-01', [28, 28, 28, 28])

  test('is not late on the latest expected day', () => {
    const { prediction } = createEngine(input(logs, '2026-05-22'))
    expect(prediction.nextPeriodExpected?.latest).toBe('2026-05-22')
    expect(prediction.periodLate).toBe(false)
  })

  test('is late the day after, and later days become uncertain', () => {
    const engine = createEngine(input(logs, '2026-05-23'))
    expect(engine.prediction.periodLate).toBe(true)
    expect(engine.assessDay('2026-05-23')).toMatchObject({ risk: 'unknown', periodLate: true })
    expect(engine.assessDay('2026-05-28')).toMatchObject({ risk: 'unknown', periodLate: true })
  })

  test('leaves days up to the latest expected day as they were', () => {
    const onTime = createEngine(input(logs, '2026-05-22'))
    const late = createEngine(input(logs, '2026-05-23'))
    for (const d of ['2026-05-02', '2026-05-12', '2026-05-22']) {
      expect(late.assessDay(d)).toEqual(onTime.assessDay(d))
    }
  })
})
```

Create `src/lib/guidance.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { guidanceFor } from './guidance'
import { createEngine } from '@/engine/predict'
import { aProfile, periodStarts } from '@/engine/__testutils__/fixtures'

describe('late period guidance', () => {
  test('says the period is late and advises protection, without the word safe', () => {
    const engine = createEngine({
      today: '2026-05-23',
      logs: periodStarts('2026-01-01', [28, 28, 28, 28]),
      resolutions: [],
      profile: aProfile(),
    })
    const g = guidanceFor(engine.assessDay('2026-05-23'), engine.prediction)
    expect(g.title).toBe('Your period is later than expected')
    expect(g.tone).toBe('unknown')
    expect(g.body).toMatch(/use protection/)
    expect(`${g.title} ${g.body}`.toLowerCase()).not.toContain('safe')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/engine/predict.test.ts src/lib/guidance.test.ts`
Expected: FAIL. `periodLength`, `nextPeriodExpected` and `periodLate` are undefined; the guidance title does not match.

- [ ] **Step 3: Extend the types**

In `src/engine/types.ts`, inside `interface Prediction`, after `nextPeriod: DateRange | null`:

```ts
  /** The next-period estimate before any "not yet" answers moved it. */
  nextPeriodExpected: DateRange | null
  /** Learned from confirmed periods, or the onboarding answer. */
  periodLength: number
  /** Today is past the latest expected start and no new period is logged. */
  periodLate: boolean
```

Inside `interface DayAssessment`, after `isFertile: boolean`:

```ts
  /** This day falls after the latest expected start of a late period. */
  periodLate: boolean
```

- [ ] **Step 4: Implement in `predict.ts`**

In `src/engine/predict.ts`:

(a) Change the import from `./cycles` to include `learnPeriodLength`:

```ts
import { analyseCycles, deriveCycles, learnLutealLength, learnPeriodLength } from './cycles'
```

(b) After `const lutealLength = learnLutealLength(cycles, profile)`:

```ts
  const periodLength = learnPeriodLength(cycles, today, profile)
```

(c) In the `current === null` early return, add to the prediction object after `nextPeriod: null,`:

```ts
        nextPeriodExpected: null,
        periodLength,
        periodLate: false,
```

(d) Replace the block from `const nextPeriodLikely = …` through the closing of the `nextPeriod` object with:

```ts
  const expectedLikely = addDays(current.startDate, cycleLength)
  const nextPeriodExpected = {
    earliest: addDays(expectedLikely, -spread),
    likely: expectedLikely,
    latest: addDays(expectedLikely, spread),
  }

  /*
   * "Has your period started? — Not yet." Each answer on or after the
   * earliest expected day rules that day out, so the estimate cannot sit on
   * a day the user has already lived through without bleeding. Only the
   * period estimate moves: ovulation stays anchored to the original
   * expectation, because moving it could only pull caution earlier.
   */
  const lastNotYet = liveLogs
    .filter(
      (l) =>
        l.noBleed === true &&
        l.logDate >= nextPeriodExpected.earliest &&
        l.logDate <= today,
    )
    .map((l) => l.logDate)
    .sort()
    .pop()
  const floor = lastNotYet === undefined ? null : addDays(lastNotYet, 1)

  const nextPeriodLikely = floor === null ? expectedLikely : maxIso(expectedLikely, floor)
  const nextPeriod = {
    earliest:
      floor === null ? nextPeriodExpected.earliest : maxIso(nextPeriodExpected.earliest, floor),
    likely: nextPeriodLikely,
    latest: maxIso(nextPeriodExpected.latest, nextPeriodLikely),
  }

  const periodLate = today > nextPeriodExpected.latest
```

(e) Change the unconfirmed ovulation anchor to use the expected date:

```ts
  const ovulationLikely = ovulationConfirmed
    ? (current.confirmedOvulation as IsoDate)
    : addDays(expectedLikely, -lutealLength)
```

(f) In the `prediction` object:
- change `phase: phaseFor(today, current, ovulationLikely, profile.avgPeriodLength),` to `phase: phaseFor(today, current, ovulationLikely, periodLength),`
- add after `nextPeriod,`:

```ts
    nextPeriodExpected,
    periodLength,
    periodLate,
```

(g) Change `predictedPeriodEnd` and `currentPeriodEnd` to use the learned length:

```ts
  const predictedPeriodEnd = addDays(nextPeriodLikely, periodLength - 1)
```

```ts
  const currentPeriodEnd = periodEndFor(current, periodLength)
```

Delete the now-unused `const currentStart = current.startDate` line, and replace `currentStart` in `assessDay` with `current.startDate`.

(h) In `assessDay`, replace the `risk` computation and add `periodLate` to the return:

```ts
    const lateDay = periodLate && date > nextPeriodExpected.latest

    const risk: RiskLevel = isFertile
      ? 'high'
      : inBuffer
        ? 'elevated'
        : lateDay
          ? 'unknown'
          : baseline.eligibleCount >= CONFIDENCE_FAIR_AT
            ? 'lower'
            : 'unknown'
```

Pass `periodLength` instead of `profile.avgPeriodLength` to `phaseFor`. Change the `isWithin(date, currentStart, currentPeriodEnd)` term to `isWithin(date, current.startDate, currentPeriodEnd)`, and add `periodLate: lateDay,` after `isFertile,`.

(i) Replace `phaseFor`'s first two statements, so it and the day sheet share one definition of "where this period ends":

```ts
/**
 * Last day of a cycle's period, as the engine understands it.
 *
 * The explicitly marked end where the user set one. Otherwise whichever is
 * later: the last day they happened to log, or the period length.
 */
export function periodEndFor(cycle: Cycle, periodLength: number): IsoDate {
  if (cycle.periodEndConfirmed && cycle.periodEndDate !== null) return cycle.periodEndDate
  const assumedEnd = addDays(cycle.startDate, Math.max(1, periodLength) - 1)
  return maxIso(cycle.periodEndDate ?? cycle.startDate, assumedEnd)
}

function phaseFor(
  date: IsoDate,
  cycle: Cycle,
  ovulationDate: IsoDate,
  periodLength: number,
): Phase {
  if (date <= periodEndFor(cycle, periodLength)) return 'menstrual'
  if (date === ovulationDate) return 'ovulation'
  if (date < ovulationDate) return 'follicular'
  return 'luteal'
}
```

Keep the existing doc comment above `phaseFor`, but change its wording from "stated average period length" to "period length".

(j) In `emptyAssessment`, add `periodLate: false,` after `isFertile: false,`.

- [ ] **Step 5: Add the guidance branch**

In `src/lib/guidance.ts`, inside `guidanceFor`, directly before `if (day.risk === 'unknown') {`:

```ts
  if (day.periodLate) {
    return {
      tone: 'unknown',
      title: 'Your period is later than expected',
      body: "Cycle's estimates are unreliable until it arrives, so treat every day as uncertain and use protection.",
      icon: 'help',
    }
  }
```

- [ ] **Step 6: Run everything**

Run: `npm test && npm run typecheck`
Expected: all PASS. The existing tests that compare `nextPeriod` or phases should be unaffected: with no `noBleed` rows and fewer than 2 confirmed periods, behaviour is identical to before. If an existing test fails, check first whether its fixture has two or more confirmed periods, which would legitimately change `periodLength`. Do not edit an existing assertion without reporting it.

- [ ] **Step 7: Commit**

```bash
git add src/engine/types.ts src/engine/predict.ts src/engine/predict.test.ts src/lib/guidance.ts src/lib/guidance.test.ts
git commit -m "feat: learned period length, not-yet answers and late periods in the forecast

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Plan the writes for a bleeding report

**Files:**
- Modify: `src/engine/logging.ts` (add `planBleedingReport`)
- Test: `src/engine/logging.test.ts`
- Modify: `src/data/repository.ts` (add `reportBleeding`)
- Modify: `src/store/useCycleStore.ts` (add `reportBleeding` action)

**Interfaces:**
- Consumes: `DayLog.noBleed` (Task 1).
- Produces:
  - `planBleedingReport(logs: DayLog[], cycleStart: IsoDate, date: IsoDate, bleeding: boolean, flow?: Flow): DayWrite[]`
  - `reportBleeding(repo: CycleRepository, cycleStart: IsoDate, date: IsoDate, bleeding: boolean, flow?: Flow): Promise<void>` in `src/data/repository.ts`
  - store action `reportBleeding(date: IsoDate, bleeding: boolean, flow?: Flow): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/logging.test.ts`. Extend the import from `./logging` with `planBleedingReport`:

```ts
/** Apply a plan to a set of logs, as the repository would. */
const apply = (logs: DayLog[], writes: { date: IsoDate; patch: Partial<DayLog> }[]): DayLog[] => {
  const byDate = new Map(logs.map((l) => [l.logDate, { ...l }]))
  for (const { date, patch } of writes) {
    byDate.set(date, { ...(byDate.get(date) ?? aLog(date)), ...patch })
  }
  return [...byDate.values()].sort((a, b) => a.logDate.localeCompare(b.logDate))
}

const invariantsHold = (logs: DayLog[], cycleStart: IsoDate) => {
  expect(logs.filter((l) => l.isPeriodStart).map((l) => l.logDate)).toEqual([cycleStart])
  expect(logs.some((l) => l.isPeriod && l.noBleed)).toBe(false)
}

describe('planBleedingReport', () => {
  // The screenshot case: an older start-only log, then day 5 is tapped.
  const startOnly = [aPeriodStart('2026-09-20')]

  test('yes on day 5 fills days 2-4 and never adds a start', () => {
    const after = apply(startOnly, planBleedingReport(startOnly, '2026-09-20', '2026-09-24', true, 'light'))
    expect(after.filter((l) => l.isPeriod).map((l) => l.logDate)).toEqual([
      '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24',
    ])
    expect(after.find((l) => l.logDate === '2026-09-24')?.flow).toBe('light')
    expect(after.some((l) => l.isPeriodEnd)).toBe(false)
    invariantsHold(after, '2026-09-20')
  })

  test('no on day 5 confirms day 4 as the last day', () => {
    const after = apply(startOnly, planBleedingReport(startOnly, '2026-09-20', '2026-09-24', false))
    expect(after.filter((l) => l.isPeriod).map((l) => l.logDate)).toEqual([
      '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23',
    ])
    expect(after.find((l) => l.logDate === '2026-09-23')?.isPeriodEnd).toBe(true)
    expect(after.find((l) => l.logDate === '2026-09-24')?.noBleed).toBe(true)
    invariantsHold(after, '2026-09-20')
  })

  test('no on day 3 of a booked 5-day period trims the rest', () => {
    const booked = apply([], planPeriodRun([], '2026-09-20', 5))
    const after = apply(booked, planBleedingReport(booked, '2026-09-20', '2026-09-22', false))
    expect(after.filter((l) => l.isPeriod).map((l) => l.logDate)).toEqual(['2026-09-20', '2026-09-21'])
    expect(after.filter((l) => l.isPeriodEnd).map((l) => l.logDate)).toEqual(['2026-09-21'])
    invariantsHold(after, '2026-09-20')
  })

  test('yes past a booked end extends the period and unconfirms the end', () => {
    const booked = apply([], planPeriodRun([], '2026-09-20', 5))
    const after = apply(booked, planBleedingReport(booked, '2026-09-20', '2026-09-25', true, 'light'))
    expect(after.filter((l) => l.isPeriod)).toHaveLength(6)
    expect(after.some((l) => l.isPeriodEnd)).toBe(false)
    invariantsHold(after, '2026-09-20')
  })

  test('yes inside a booked period keeps its end', () => {
    const booked = apply([], planPeriodRun([], '2026-09-20', 5))
    const after = apply(booked, planBleedingReport(booked, '2026-09-20', '2026-09-22', true, 'heavy'))
    expect(after.filter((l) => l.isPeriodEnd).map((l) => l.logDate)).toEqual(['2026-09-24'])
    expect(after.find((l) => l.logDate === '2026-09-22')?.flow).toBe('heavy')
  })

  test('a later Yes overrides an earlier No on the same day', () => {
    const saidNo = apply(startOnly, planBleedingReport(startOnly, '2026-09-20', '2026-09-24', false))
    const after = apply(saidNo, planBleedingReport(saidNo, '2026-09-20', '2026-09-24', true, 'light'))
    const day = after.find((l) => l.logDate === '2026-09-24')
    expect(day).toMatchObject({ isPeriod: true, noBleed: false })
    expect(after.some((l) => l.isPeriodEnd)).toBe(false)
    invariantsHold(after, '2026-09-20')
  })

  test('yes fill leaves an explicit not-bleeding day alone', () => {
    const logs = [aPeriodStart('2026-09-20'), aLog('2026-09-22', { noBleed: true })]
    const after = apply(logs, planBleedingReport(logs, '2026-09-20', '2026-09-24', true))
    expect(after.find((l) => l.logDate === '2026-09-22')).toMatchObject({ isPeriod: false, noBleed: true })
    invariantsHold(after, '2026-09-20')
  })

  test('a second No after a No only records the day', () => {
    const logs = [aPeriodStart('2026-09-20', { isPeriodEnd: true }), aLog('2026-09-21', { noBleed: true })]
    const writes = planBleedingReport(logs, '2026-09-20', '2026-09-22', false)
    expect(writes.map((w) => w.date)).toEqual(['2026-09-22'])
  })

  test('does nothing on the start day itself', () => {
    expect(planBleedingReport(startOnly, '2026-09-20', '2026-09-20', false)).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/engine/logging.test.ts`
Expected: FAIL, `planBleedingReport is not a function`.

- [ ] **Step 3: Implement the planner**

In `src/engine/logging.ts`, change the type import to `import type { DayLog, Flow, IsoDate } from './types'` and add at the end of the file:

```ts
/** A day filled in as bleeding because the days either side of it were. */
const fillPatch = (current: DayLog | undefined): Partial<DayLog> => ({
  isPeriod: true,
  isPeriodEnd: false,
  noBleed: false,
  ...(current?.flow ? {} : { flow: 'medium' as const }),
})

/**
 * Answer "were you bleeding this day?" for a day of the current period.
 *
 * Yes: the day bleeds, and unreported days back to the start are filled in,
 * because a period is one run. Any end marked before this day was wrong.
 * No: the day before becomes the confirmed last day, and booked days after
 * this one are cleared.
 *
 * Never sets `isPeriodStart`. Setting it here is the false-second-start
 * defect this exists to remove. An explicit "not bleeding" day is never
 * overwritten by a fill — only by an answer about that day itself.
 */
export function planBleedingReport(
  logs: DayLog[],
  cycleStart: IsoDate,
  date: IsoDate,
  bleeding: boolean,
  flow: Flow = 'medium',
): DayWrite[] {
  if (date <= cycleStart) return []

  const existing = byDate(logs)
  const writes: DayWrite[] = []
  const lastBleedingDay = bleeding ? date : addDays(date, -1)
  const alreadyEnded = !bleeding && existing.get(lastBleedingDay)?.noBleed === true

  if (!alreadyEnded) {
    for (let d = cycleStart; d < lastBleedingDay; d = addDays(d, 1)) {
      const current = existing.get(d)
      if (current?.noBleed === true) continue
      if (current?.isPeriod === true) {
        if (current.isPeriodEnd) writes.push({ date: d, patch: { isPeriodEnd: false } })
        continue
      }
      writes.push({ date: d, patch: fillPatch(current) })
    }
  }

  if (bleeding) {
    const current = existing.get(date)
    writes.push({
      date,
      patch: {
        isPeriod: true,
        noBleed: false,
        flow,
        // Keep an end the user booked for this very day; otherwise it is open.
        isPeriodEnd: current?.isPeriod === true ? current.isPeriodEnd : false,
      },
    })
    return writes
  }

  if (!alreadyEnded) {
    const previous = existing.get(lastBleedingDay)
    writes.push({
      date: lastBleedingDay,
      patch:
        previous?.isPeriod === true
          ? { isPeriodEnd: true }
          : { ...fillPatch(previous), isPeriodEnd: true },
    })
  }

  writes.push({
    date,
    patch: { isPeriod: false, isPeriodEnd: false, flow: null, noBleed: true },
  })

  // Booked days after this one belonged to a period that has now ended.
  for (let d = addDays(date, 1); ; d = addDays(d, 1)) {
    const current = existing.get(d)
    if (current?.isPeriod !== true || current.isPeriodStart) break
    writes.push({ date: d, patch: { isPeriod: false, isPeriodEnd: false, flow: null } })
    if (writes.length > MAX_PERIOD_DAYS * 4) break
  }

  return writes
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/engine/logging.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it through the repository and store**

In `src/data/repository.ts`, extend the import from `@/engine/logging` with `planBleedingReport`, extend the type import with `Flow`, and add after `removePeriod`:

```ts
/** Answer "were you bleeding this day?" for a day of the current period. */
export async function reportBleeding(
  repo: CycleRepository,
  cycleStart: IsoDate,
  date: IsoDate,
  bleeding: boolean,
  flow?: Flow,
): Promise<void> {
  const logs = await repo.listDayLogs()
  await applyDayWrites(repo, planBleedingReport(logs, cycleStart, date, bleeding, flow))
}
```

In `src/store/useCycleStore.ts`:
- Add `reportBleeding` to the import from `@/data/repository` (the same import block that brings `logPeriod` and `removePeriod`), and `Flow` to the engine type import.
- In `interface State`, after `removePeriod(date: IsoDate): Promise<void>`:

```ts
  /** "Were you bleeding this day?" for a day of the current period. */
  reportBleeding(date: IsoDate, bleeding: boolean, flow?: Flow): Promise<void>
```

- In the store body, after the `removePeriod` action:

```ts
  async reportBleeding(date, bleeding, flow) {
    const current = get().engine.cycles.find((c) => c.isCurrent)
    if (!current) return
    await reportBleeding(localRepository, current.startDate, date, bleeding, flow)
    await reload(set, get)
  },
```

(Follow the exact shape of the neighbouring `removePeriod` action, including whatever it calls after the write, if that differs from `reload(set, get)`.)

- Change `insertMissedPeriod` to book the learned length:

```ts
    await logPeriod(localRepository, date, get().engine.prediction.periodLength)
```

- [ ] **Step 6: Typecheck and test**

Run: `npm test && npm run typecheck`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/engine/logging.ts src/engine/logging.test.ts src/data/repository.ts src/store/useCycleStore.ts
git commit -m "feat: plan and store still-bleeding and stopped answers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Decide which question a day asks

**Files:**
- Create: `src/engine/dayPrompt.ts`
- Create: `src/engine/dayPrompt.test.ts`

**Interfaces:**
- Consumes: `Engine` (`cycles`, `prediction.periodLength`, `prediction.nextPeriodExpected`), and `periodEndFor` from `./predict` (Task 3).
- Produces: `type DayPrompt = 'bleeding' | 'started' | 'logStart' | 'none'`; `dayPrompt(date: IsoDate, today: IsoDate, engine: Engine): DayPrompt`.

- [ ] **Step 1: Write the failing tests**

Create `src/engine/dayPrompt.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { dayPrompt } from './dayPrompt'
import { createEngine } from './predict'
import { aLog, aPeriodStart, aProfile, periodStarts } from './__testutils__/fixtures'
import type { DayLog } from './types'

const engineFor = (logs: DayLog[], today: string) =>
  createEngine({ today, logs, resolutions: [], profile: aProfile({ avgPeriodLength: 5 }) })

describe('dayPrompt — the screenshot case', () => {
  // Start-only log on 20 Sep, today 24 Sep (cycle day 5).
  const engine = engineFor([aPeriodStart('2026-09-20')], '2026-09-24')

  test('asks about bleeding on day 5, not about a new start', () => {
    expect(dayPrompt('2026-09-24', '2026-09-24', engine)).toBe('bleeding')
  })

  test('asks nothing on the start day itself', () => {
    expect(dayPrompt('2026-09-20', '2026-09-24', engine)).toBe('none')
  })

  test('asks nothing about the future', () => {
    expect(dayPrompt('2026-09-25', '2026-09-24', engine)).toBe('none')
  })
})

describe('dayPrompt — zones', () => {
  test('asks about bleeding on the day after the period end', () => {
    // Assumed end is day 5 (24 Sep); the day after is 25 Sep.
    const engine = engineFor([aPeriodStart('2026-09-20')], '2026-09-26')
    expect(dayPrompt('2026-09-25', '2026-09-26', engine)).toBe('bleeding')
    expect(dayPrompt('2026-09-26', '2026-09-26', engine)).toBe('none')
  })

  test('offers no new start before cycle day 15', () => {
    const engine = engineFor([aPeriodStart('2026-09-01')], '2026-09-20')
    expect(dayPrompt('2026-09-14', '2026-09-20', engine)).toBe('none')
    expect(dayPrompt('2026-09-15', '2026-09-20', engine)).toBe('logStart')
  })

  test('asks whether it has started from the earliest expected day', () => {
    // Regular 28-day history, current cycle from 23 Apr: expected 21 May,
    // earliest 20 May.
    const engine = engineFor(periodStarts('2026-01-01', [28, 28, 28, 28]), '2026-05-21')
    expect(dayPrompt('2026-05-19', '2026-05-21', engine)).toBe('logStart')
    expect(dayPrompt('2026-05-20', '2026-05-21', engine)).toBe('started')
    expect(dayPrompt('2026-05-21', '2026-05-21', engine)).toBe('started')
  })

  test('still asks after a not-yet answer today', () => {
    const logs = [...periodStarts('2026-01-01', [28, 28, 28, 28]), aLog('2026-05-21', { noBleed: true })]
    const engine = engineFor(logs, '2026-05-21')
    expect(dayPrompt('2026-05-21', '2026-05-21', engine)).toBe('started')
  })

  test('keeps asking while the period is late', () => {
    const engine = engineFor(periodStarts('2026-01-01', [28, 28, 28, 28]), '2026-05-28')
    expect(dayPrompt('2026-05-28', '2026-05-28', engine)).toBe('started')
  })

  test('offers a start on days in past cycles, as before', () => {
    const engine = engineFor(periodStarts('2026-01-01', [28, 28, 28, 28]), '2026-05-10')
    expect(dayPrompt('2026-02-10', '2026-05-10', engine)).toBe('logStart')
  })

  test('offers a start when nothing has been logged', () => {
    expect(dayPrompt('2026-09-20', '2026-09-20', engineFor([], '2026-09-20'))).toBe('logStart')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/engine/dayPrompt.test.ts`
Expected: FAIL, module `./dayPrompt` not found.

- [ ] **Step 3: Implement**

Create `src/engine/dayPrompt.ts`:

```ts
/**
 * Which question the day sheet asks about a given day.
 *
 * Pure, so the rule that stops a false second period start is tested rather
 * than buried in a component. The sheet renders whatever this returns.
 */

import { addDays, diffDays } from '@/lib/date'
import { periodEndFor, type Engine } from './predict'
import type { IsoDate } from './types'

export type DayPrompt =
  /** "Were you bleeding this day?" — inside the current period, or the day after it. */
  | 'bleeding'
  /** "Has your period started?" — the next period is due or late. */
  | 'started'
  /** The existing "My period started this day". */
  | 'logStart'
  | 'none'

/**
 * The shortest cycle the app accepts. A "start" before this cycle day is a
 * mis-tap or spotting, not a new period.
 */
const LOG_START_FROM_CYCLE_DAY = 15

export function dayPrompt(date: IsoDate, today: IsoDate, engine: Engine): DayPrompt {
  if (date > today) return 'none'

  const current = engine.cycles.find((c) => c.isCurrent) ?? null
  if (current === null || date < current.startDate) return 'logStart'
  if (date === current.startDate) return 'none'

  const { periodLength, nextPeriodExpected } = engine.prediction
  const bleedingZoneEnd = addDays(periodEndFor(current, periodLength), 1)
  if (date <= bleedingZoneEnd) return 'bleeding'

  if (nextPeriodExpected !== null && date >= nextPeriodExpected.earliest) return 'started'

  const cycleDay = diffDays(current.startDate, date) + 1
  return cycleDay < LOG_START_FROM_CYCLE_DAY ? 'none' : 'logStart'
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/engine/dayPrompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/dayPrompt.ts src/engine/dayPrompt.test.ts
git commit -m "feat: choose the day sheet's question from where the day falls

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Day sheet asks the right question and takes symptoms

**Files:**
- Create: `src/components/DayReport.tsx`
- Modify: `src/components/DayDetailSheet.tsx`
- Modify: `src/screens/TodayScreen.tsx:55`

**Interfaces:**
- Consumes: `dayPrompt` (Task 5); store `reportBleeding`, `updateDay`, `logPeriod`; `engine.prediction.periodLength` and `nextPeriodExpected` (Task 3); `SYMPTOMS` from `@/lib/guidance`.
- Produces: components `BleedingQuestion`, `StartedQuestion` and `SymptomChips` from `src/components/DayReport.tsx`.

- [ ] **Step 1: Create the report components**

Create `src/components/DayReport.tsx`:

```tsx
/**
 * The questions a day sheet asks. Presentational: each takes the day's log
 * and callbacks, and the sheet decides which one to show via `dayPrompt`.
 */

import { Icon } from './Icon'
import { SYMPTOMS } from '@/lib/guidance'
import { formatRange } from '@/lib/format'
import type { DateRange, DayLog, Flow } from '@/engine/types'

const FLOWS: Flow[] = ['spotting', 'light', 'medium', 'heavy']

interface BleedingProps {
  isToday: boolean
  log: DayLog | null
  onBleeding(flow: Flow): void
  onNotBleeding(): void
}

/** "Were you bleeding this day?" Tapping a flow is the yes. */
export function BleedingQuestion({ isToday, log, onBleeding, onNotBleeding }: BleedingProps) {
  const bleeding = log?.isPeriod === true
  const notBleeding = log?.noBleed === true
  return (
    <section className="card stack">
      <div>
        <p className="option__title">
          {isToday ? 'Are you bleeding today?' : 'Were you bleeding this day?'}
        </p>
        <p className="option__sub">
          {bleeding
            ? 'Logged as a period day.'
            : notBleeding
              ? 'Logged as not bleeding.'
              : 'Tap a flow if you were.'}
        </p>
      </div>
      <div className="chip-wrap">
        {FLOWS.map((f) => (
          <button
            key={f}
            className="chip"
            aria-pressed={bleeding && log?.flow === f}
            onClick={() => onBleeding(f)}
            style={{ textTransform: 'capitalize' }}
          >
            {f}
          </button>
        ))}
      </div>
      <button className="btn btn--quiet btn--block" aria-pressed={notBleeding} onClick={onNotBleeding}>
        <Icon name="close" size={18} />
        {isToday ? 'No, not bleeding today' : 'No, not bleeding'}
      </button>
    </section>
  )
}

interface StartedProps {
  log: DayLog | null
  expected: DateRange
  onNotYet(): void
  onStarted(): void
}

/** "Has your period started?" on days the next period is due or late. */
export function StartedQuestion({ log, expected, onNotYet, onStarted }: StartedProps) {
  const notYet = log?.noBleed === true
  return (
    <section className="card stack">
      <div>
        <p className="option__title">Has your period started?</p>
        <p className="option__sub">
          {notYet
            ? 'You said not yet on this day.'
            : `Expected ${formatRange(expected.earliest, expected.latest)}.`}
        </p>
      </div>
      <div className="stat-grid">
        <button className="btn btn--quiet" aria-pressed={notYet} onClick={onNotYet}>
          Not yet
        </button>
        <button className="btn btn--primary" onClick={onStarted}>
          <Icon name="droplet" size={18} filled />
          It started this day
        </button>
      </div>
    </section>
  )
}

interface SymptomProps {
  selected: string[]
  onChange(next: string[]): void
}

/** Symptoms for the day. Each tap saves; nothing here moves the forecast. */
export function SymptomChips({ selected, onChange }: SymptomProps) {
  const toggle = (s: string) =>
    onChange(selected.includes(s) ? selected.filter((v) => v !== s) : [...selected, s])
  return (
    <section>
      <p className="label" style={{ marginBottom: 8 }}>
        Symptoms
      </p>
      <div className="chip-wrap">
        {SYMPTOMS.map((s) => (
          <button key={s} className="chip" aria-pressed={selected.includes(s)} onClick={() => toggle(s)}>
            {s}
          </button>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Rework the period section of `DayDetailSheet`**

In `src/components/DayDetailSheet.tsx`:

(a) Imports: add `import { BleedingQuestion, StartedQuestion, SymptomChips } from './DayReport'` and `import { dayPrompt } from '@/engine/dayPrompt'`.

(b) Pull `reportBleeding` from the store:

```ts
  const { engine, logs, today, logPeriod, removePeriod, updateDay, reportBleeding } = useCycleStore()
```

(`profile` is no longer needed in this component once (d) is done. Remove it from the destructure if the typecheck reports it unused.)

(c) After `const isLoggedPeriod = loggedStart !== null`:

```ts
  const prompt = dayPrompt(date, today, engine)
  const periodLength = engine.prediction.periodLength
```

(d) Replace both uses of `profile.avgPeriodLength` with `periodLength`: the `previewLength` fallback, and the `setEditing(…)` on the start button.

(e) Replace the whole `{/* ---- period -- */}` block, from `{editing !== null ? (` to its matching closing `)}` before the ovulation comment, with:

```tsx
        {/* ---------------------------------------------------- period -- */}
        {editing !== null ? (
          <section className="card stack">
            <div>
              <p className="option__title">
                {isLoggedPeriod ? 'Change the length' : 'Period started this day'}
              </p>
              <p className="option__sub">
                {formatRange(runStart, previewEnd)} · {previewLength}{' '}
                {previewLength === 1 ? 'day' : 'days'}
              </p>
            </div>
            <Stepper
              label="How many days did it last?"
              suffix="days"
              value={previewLength}
              min={1}
              max={MAX_PERIOD_DAYS}
              onChange={setEditing}
            />
            <button className="btn btn--primary btn--block" onClick={() => void commit()}>
              <Icon name="check" size={18} strokeWidth={2.4} />
              {isLoggedPeriod ? 'Update period' : `Log ${previewLength} days`}
            </button>
            <button className="btn btn--ghost btn--block" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </section>
        ) : (
          <>
            {prompt === 'bleeding' && (
              <BleedingQuestion
                isToday={date === today}
                log={log}
                onBleeding={(flow) => void reportBleeding(date, true, flow)}
                onNotBleeding={() => void reportBleeding(date, false)}
              />
            )}

            {prompt === 'started' && !isLoggedPeriod && engine.prediction.nextPeriodExpected && (
              <StartedQuestion
                log={log}
                expected={engine.prediction.nextPeriodExpected}
                onNotYet={() => void updateDay(date, { noBleed: true })}
                onStarted={() => setEditing(periodLength)}
              />
            )}

            {isLoggedPeriod && (
              <section className="card stack">
                <div>
                  <p className="option__title">Period logged</p>
                  <p className="option__sub">
                    {formatRange(runStart, addDays(runStart, loggedLength - 1))} · {loggedLength}{' '}
                    {loggedLength === 1 ? 'day' : 'days'}
                  </p>
                </div>
                <div className="stat-grid">
                  <button className="btn btn--quiet" onClick={() => setEditing(loggedLength)}>
                    Change length
                  </button>
                  <button
                    className="btn btn--danger"
                    onClick={async () => {
                      await removePeriod(date)
                      onClose()
                    }}
                  >
                    Remove
                  </button>
                </div>
              </section>
            )}

            {prompt === 'logStart' && !isLoggedPeriod && (
              <button
                className="btn btn--primary btn--block"
                onClick={() => setEditing(periodLength)}
              >
                <Icon name="droplet" size={18} filled />
                My period started this day
              </button>
            )}
          </>
        )}
```

(f) Directly before the `{/* ---- feedback -- */}` comment, add:

```tsx
        {/* -------------------------------------------------- symptoms -- */}
        {!isFuture && editing === null && (
          <SymptomChips
            selected={log?.symptoms ?? []}
            onChange={(symptoms) => void updateDay(date, { symptoms })}
          />
        )}
```

(g) Replace the feedback fine print text with:

```tsx
              Symptoms and feedback are noted against this day so you can spot patterns.
              Only period days, 'not yet' answers and confirmed ovulation change the
              predictions.
```

- [ ] **Step 3: Today screen wheel uses the learned length**

In `src/screens/TodayScreen.tsx:55`, change `periodLength={profile.avgPeriodLength}` to `periodLength={prediction.periodLength}`.

- [ ] **Step 4: Typecheck, test, build**

Run: `npm test && npm run build`
Expected: all tests PASS; the build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/DayReport.tsx src/components/DayDetailSheet.tsx src/screens/TodayScreen.tsx
git commit -m "feat: day sheet asks whether you are still bleeding and takes symptoms

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Log day sheet adds to the current period instead of starting one

**Files:**
- Modify: `src/components/LogDaySheet.tsx`

**Interfaces:**
- Consumes: `dayPrompt` (Task 5); store `reportBleeding` (Task 4); `engine.prediction.periodLength` (Task 3).

- [ ] **Step 1: Detect a continuing period**

In `src/components/LogDaySheet.tsx`:

(a) Imports: add `import { dayPrompt } from '@/engine/dayPrompt'`, and `formatShort` to the `@/lib/format` import.

(b) Pull `reportBleeding` from the store:

```ts
  const { today, logs, engine, logPeriod, updateDay, reportBleeding } = useCycleStore()
```

(c) After `const todayAssessment = engine.assessDay(today)`:

```ts
  /*
   * Day five of a period is not a new period. Booking a run from today would
   * record a second start inside the first and poison the cycle history.
   */
  const continuing = dayPrompt(today, today, engine) === 'bleeding'
  const currentStart = engine.cycles.find((c) => c.isCurrent)?.startDate ?? today
```

(d) Replace both `profile.avgPeriodLength` uses (the `useState` initial value and the reset in the effect) with `engine.prediction.periodLength`. Remove `profile` from the destructure if it is then unused.

(e) Replace `savePeriod` with:

```ts
  const savePeriod = async () => {
    if (continuing) {
      await reportBleeding(today, true, flow)
    } else {
      // The run first, so every day of the period exists.
      await logPeriod(startDate, periodLength)
    }
    // Then the detail that belongs to the day the user is actually describing.
    await updateDay(continuing ? today : startDate, {
      flow,
      symptoms,
      sexualActivity: activity ? true : null,
      protectionUsed: activity ? protection : null,
      notes: notes.trim() || null,
    })
    finish()
  }
```

(f) In the choose step, change the "Period day" sub-label:

```tsx
              <span className="option__sub">
                {continuing ? "I'm still bleeding today" : "I'm bleeding today"}
              </span>
```

(g) In the `step === 'period'` block, wrap the date field, the `Stepper` and the "Books in …" fine print in `{!continuing && ( <>…</> )}`, and add before them:

```tsx
          {continuing && (
            <p className="muted">
              Adds today to the period that started {formatShort(currentStart)}.
            </p>
          )}
```

(h) Change the save button label:

```tsx
          <button className="btn btn--primary btn--block" onClick={() => void savePeriod()}>
            {continuing ? 'Save today' : `Save ${periodLength}-day period`}
          </button>
```

(i) Change the period step's title so it matches:

```ts
      : step === 'period'
        ? continuing ? 'Still bleeding' : 'Log a period'
```

- [ ] **Step 2: Typecheck, test, build**

Run: `npm test && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/LogDaySheet.tsx
git commit -m "fix: logging a period day mid-period adds to it instead of starting another

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Verify in the browser, document, bump the version

**Files:**
- Modify: `README.md`
- Modify: `package.json` (`version`)

- [ ] **Step 1: Run the app and check the screenshot case**

Generate an export that reproduces the screenshot: older data, with a start-only current period that began 4 days ago. Write it to the scratchpad:

```bash
node -e '
const d = (n) => { const t = new Date(); t.setDate(t.getDate() + n); return t.toLocaleDateString("en-CA") }
const log = (date, over) => ({ id: "seed-" + date, logDate: date, isPeriod: false, isPeriodStart: false, isPeriodEnd: false, noBleed: false, flow: null, feltFertile: false, ovulationClaimed: false, ovulationConfidence: null, ovulationSigns: [], symptoms: [], mood: null, sexualActivity: null, protectionUsed: null, notes: null, predictionFeedback: null, updatedAt: new Date().toISOString(), deletedAt: null, ...over })
const start = { isPeriod: true, isPeriodStart: true, flow: "medium" }
console.log(JSON.stringify({ format: "cycle-export", version: 1, exportedAt: new Date().toISOString(),
  profile: { displayName: "Test", appName: "Cycle", avgCycleLength: 28, avgPeriodLength: 5, lutealLength: 14, onboardedAt: new Date().toISOString() },
  dayLogs: [log(d(-60), start), log(d(-32), start), log(d(-4), start)], resolutions: [] }))
' > "$SCRATCHPAD/seed.json"
```

(`$SCRATCHPAD` is the session scratchpad directory.) Start the dev server through the browser pane's `preview_start` (`npm run dev`). Set the viewport to 390×844, complete onboarding with any values, then Settings → import `seed.json`.

Check, taking a screenshot each time:
1. Calendar → tap today (cycle day 5). The sheet shows "Are you bleeding today?" with flow chips and "No, not bleeding today", then a **Symptoms** row. There is **no** "My period started this day".
2. Tap "Light". Days 2–5 show as period days on the calendar. History shows **three** cycle starts, not four.
3. Tap a symptom. Close the sheet and reopen it: the symptom is still selected.
4. Tap "No, not bleeding today". Today is no longer shaded as a period day.
5. Tap a day in the previous cycle, 20 days before today. It still offers "My period started this day", as before. Tap tomorrow: no question and no symptoms row.
6. Log day button → "Period day" reads "I'm still bleeding today", and saving adds today without a new start.
7. Repeat step 1 in dark theme. Check that text and chips are legible.

Report anything that differs. Do not work round it.

- [ ] **Step 2: Update the README**

In `README.md`:
- Change "runs 86 cases" to the count `npm test` now reports.
- Under **What it does**, change the Calendar bullet to:

```md
- **Calendar** — colour-coded month view. Tap any day to report it: "were you
  bleeding?" during a period, "has it started?" when one is due, and symptoms.
```

- Under **How the predictions work**, after the luteal-phase paragraph, add:

```md
**Period length is learned, not assumed.** Once two periods have a confirmed
last day — a "no, not bleeding" the day after, or a booked length that has
passed — their median replaces the onboarding answer.

**"Not yet" moves the next period, and nothing else.** Answering "has your
period started? — not yet" rules that day out, so the estimate never sits on a
day you have already had. Ovulation and the fertile window stay where they
were: moving them could only pull caution earlier. Once the period is past its
latest expected day, later days are shown as uncertain, not lower risk.
```

- [ ] **Step 3: Bump the version**

In `package.json`, change `"version": "1.0.0"` to `"version": "1.1.0"`.

- [ ] **Step 4: Final full check**

Run: `npm test && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 5: Commit, push the branch, open the PR**

```bash
git add README.md package.json
git commit -m "docs: describe daily reports and learned period length

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/daily-period-reports
gh pr create --repo rparker1/cycle --base main --title "feat: daily period reports and symptom logging" --body "..."
```

The PR body must say, first line: **Apply `supabase/migrations/0002_no_bleed.sql` to the Supabase project before merging** — merging deploys, and sync fails until the column exists. End it with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Do not merge.
