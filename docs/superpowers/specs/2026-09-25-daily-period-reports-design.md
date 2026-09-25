# Daily period reports — design specification

Date: 2026-09-25
Status: approved in conversation, awaiting spec review
Builds on: `2026-09-20-cycle-design.md`

## 1. Problem

Tapping a day inside the current period (day 5, say) offers only "My period
started this day". Two faults follow:

1. **No way to report the day.** The user cannot say "still bleeding" or
   "stopped", so the app never learns real period length and a predicted
   period that has not arrived stays on screen unchanged.
2. **A false second start.** The button records a new period start four days
   after the real one. `planPeriodRun` only clears stray starts within 3 days,
   so the history gains a 4-day cycle and the baseline is poisoned. The Log day
   sheet's "Period day" option has the same fault: its start date defaults to
   today.

The screenshot case: the current cycle has a start-only log (older data, no
confirmed end), so day 5 is inside the *assumed* period (`isPredictedPeriod`)
but not a logged bleeding day, and `periodStartFor` returns null.

## 2. Outcome

- Every past day and today is a report the model can use.
- Symptoms can be recorded on any past day or today from the day sheet.
- A period can never gain a second start from these screens.

## 3. Data model

One new field on `DayLog`:

```ts
/** The user explicitly said they were not bleeding this day. */
noBleed: boolean
```

- `isPeriod` true means bleeding; `noBleed` true means explicitly not bleeding;
  both false means not reported. Both true is invalid.
- Supabase migration `0002_no_bleed.sql`:
  - `alter table public.day_logs add column if not exists no_bleed boolean not null default false;`
  - constraint `day_logs_no_bleed_excludes_period check (not (no_bleed and is_period))`.
- `sync.ts` maps `no_bleed` ↔ `noBleed` in both directions.
- `blankLog` sets `noBleed: false`.
- Rows already on the device and imported exports that lack the field are read
  as `false`: the engine and planners test `=== true`, and the store fills it
  on load. No IndexedDB version bump. Export format version stays 1.
- **Every planner that sets `isPeriod: true` also sets `noBleed: false`**, so
  the constraint cannot be violated. This includes the existing `planPeriodRun`.

**Deploy order:** apply migration 0002 to the Supabase project *before* the
new build goes live, or sync upserts fail on the unknown column.

## 4. Day sheet behaviour

A pure helper, `dayPrompt(date, today, logs, engine)` in
`src/engine/dayPrompt.ts`, decides which question to show. It is unit tested.
The sheet renders what it returns. Days after today get no question and no
symptoms row.

| Prompt | When | Answers |
|---|---|---|
| `bleeding` — "Were you bleeding this day?" | Day is in the **current cycle**, from cycle day 2 to the day after the current period's end (logged end, or the assumed end if unconfirmed). | **Yes** + flow chips. **No.** |
| `started` — "Has your period started?" | No start logged after the current cycle's start, day is on or after `nextPeriod.earliest` (the unshifted value), and day ≤ today. Includes days past `latest` while the period is late. | **Yes, it started this day** → existing length stepper. **Not yet.** |
| `logStart` — existing "My period started this day" | Any other past day or today, **except** current-cycle days before cycle day 15. | Existing stepper. |
| `none` | Current-cycle days from the end of the `bleeding` zone to cycle day 14, and the start day itself. | — |

Rows are checked top to bottom; the first match wins. So on a short cycle,
where `earliest` can fall before cycle day 15, `started` still applies.

Cycle day 15 matches the shortest cycle the app accepts (see
`MISTAP_WINDOW_DAYS` in `logging.ts`). Nothing genuine starts earlier.

The start day and any logged period day still show the existing "Period
logged" summary, with **Change length** and **Remove**, beneath the prompt.

### 4.1 Writes

New pure planners in `src/engine/logging.ts`, applied by the repository like
the existing ones.

**`planBleedingReport(logs, date, true, flow)`** — Yes:
- `date` becomes a bleeding day with the chosen flow and `noBleed: false`.
- Every unlogged day between the run's last bleeding day and `date` is filled
  as bleeding. Its flow is left blank if already set, `medium` otherwise.
- If `date` is past the run's current end, the `isPeriodEnd` flag is cleared.
  The end is now unconfirmed.
- Never sets `isPeriodStart`.

**`planBleedingReport(logs, date, false)`** — No:
- `date` gets `noBleed: true`, `isPeriod: false`, `flow: null`.
- Days from the start to `date − 1` are made bleeding (gap fill, as above).
  `date − 1` gets `isPeriodEnd: true`.
- Logged bleeding days after `date` in the same run are cleared (as
  `planPeriodRemoval` does for a run's tail).
- Never sets or clears `isPeriodStart`.

**Not yet** — `updateDay(date, { noBleed: true })`. No other changes.

### 4.2 Symptoms row

The `SYMPTOMS` chips appear under the prompt on every past day and today. Each
tap toggles the value in `DayLog.symptoms` and saves straight away, like the
feedback chips. The fine print reads: "Symptoms and feedback are noted against
this day so you can spot patterns. Only period days, 'not yet' answers and
confirmed ovulation change the predictions."

### 4.3 Log day sheet

"Period day" checks `dayPrompt(today, …)`. If it returns `bleeding`, the
period step becomes a single "Still bleeding today" confirmation with flow,
symptoms, activity and notes, and applies `planBleedingReport(…, true, flow)`.
It does not book a new run. Otherwise the current behaviour stands.

## 5. Engine changes

### 5.1 Learned period length

`learnPeriodLength(logs, cycles, today, profile)` in `cycles.ts`:

- A period **counts** when its run has an `isPeriodEnd` day `e` with `e < today`.
  A booked length therefore counts only once its last day has passed.
- Length = `e − start + 1`, clamped to `1..MAX_PERIOD_DAYS`.
- Uses the median of the last 6 counting periods, rounded.
- **Fewer than 2 counting periods → `profile.avgPeriodLength`.**

It is exposed as `Prediction.periodLength`. It replaces `profile.avgPeriodLength`
in:
- `phaseFor`'s assumed end
- `currentPeriodEnd`
- `predictedPeriodEnd`
- the day sheet's default stepper length

### 5.2 "Not yet" moves the next period later

Let `floor` = the latest `noBleed` date in the current cycle that is on or
after the unshifted `nextPeriod.earliest`, plus one day. (The `noBleed` that a
"No" answer writes at the end of a period falls before `earliest` and is
ignored.) When `floor` exists:

- `earliest = max(earliest, floor)`
- `likely = max(likely, floor)`
- `latest = max(latest, likely)`

`predictedPeriodEnd` follows the shifted `likely`.

**Ovulation, fertile window and protection window are not moved.** Moving them
could only pull caution earlier, which rule 2 in `guidance.ts` forbids.

### 5.3 Late period

`Prediction.periodLate` is true when today is after the **unshifted**
`nextPeriod.latest` and no newer start is logged.

While `periodLate` is true, `assessDay` returns `risk: 'unknown'` and
`periodLate: true` (new `DayAssessment` field) for every date after the
unshifted `latest`. Earlier dates are assessed as before.

New guidance branch, checked before `unknown`:

- title: "Your period is later than expected"
- body: "Cycle's estimates are unreliable until it arrives, so treat every day as uncertain and use protection."
- tone `unknown`, icon `help`.

No effectiveness figures and no medical advice, per the existing copy rules.

### 5.4 Unchanged

Baseline, anomaly detection and luteal learning read only period starts and
confirmed ovulation, and are untouched. Symptoms change nothing.

## 6. Testing

Engine (`vitest`):
- `learnPeriodLength`: 0 or 1 counting periods falls back; 2+ gives the median;
  a booked end in the future does not count; values are clamped.
- "Not yet": shifts `earliest` and `likely`; `latest` never falls below
  `likely`; fertile and protection windows are identical with and without it.
- Late: `periodLate` flips the day after the unshifted `latest`; later days are
  `unknown`; earlier days are unchanged.
- `dayPrompt`: each row of the §4 table, including the start day, cycle days
  2–14 and the screenshot case (start-only log, day 5).
- `planBleedingReport`: Yes fills gaps and clears a passed end; No trims the
  tail and sets the end; **neither ever creates an `isPeriodStart`**; no write
  sets `isPeriod` and `noBleed` together.
- `planPeriodRun` clears `noBleed` on booked days.

Sync: the row mapper round-trips `noBleed`.

Manual: run `npm run dev` and check the screenshot case and a late period at
390px width, in light and dark themes.

## 7. Out of scope

- Showing symptoms in History, or finding patterns in them.
- Mood logging from the day sheet.
- Reporting on past (non-current) cycles beyond the existing Change length and
  Remove.
- Any pregnancy guidance.
