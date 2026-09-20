# Cycle — design specification

Date: 2026-09-20
Status: approved, in build
Target: `https://rparker1.github.io/cycle/`

## 1. Purpose

A period and fertility tracker for a single user, installed as a PWA on an
iPhone. It predicts period start, ovulation and the fertile window, and tells
the user when to use contraception.

The app gives guidance a person may act on. Where the model is uncertain, the
app widens its caution rather than narrowing it, and says so.

## 2. Scope

In scope:

- Onboarding: app name, average cycle length, average period length, last
  period start date.
- Today screen with a cycle wheel, phase, prediction summary and guidance.
- Month calendar with colour-coded days and a day detail sheet.
- Unified "Log day" flow: period day, fertility day, ovulating day, plus
  symptoms, mood, sexual activity and protection.
- Ovulation check-in: an informative symptom prompt that lets the user confirm
  or withdraw an ovulation claim.
- History: cycle list, cycle length trend chart, anomaly resolution.
- Settings: profile, defaults, export/import, optional sync, delete all data.
- Offline-first operation, installable, iOS safe-area aware.
- Optional Supabase sync for backup and a second device.

Out of scope:

- Multiple users or partner sharing.
- Push notifications and reminders.
- Basal body temperature, OPK integration, HealthKit.
- Pregnancy mode.

## 3. Architecture

Static single-page app. No server. Built by GitHub Actions, published to GitHub
Pages.

```
src/
  engine/     pure functions, no I/O, no React        <- the safety-critical core
  data/       IndexedDB repository + Supabase sync
  store/      zustand stores binding data to UI
  screens/    Today, Calendar, History, Settings, Onboarding
  components/ presentational components
  styles/     design tokens and global CSS
  lib/        date helpers, formatting
```

The engine is a pure module. It takes day logs and resolutions in, returns
predictions out. It touches no storage, no network and no clock except through
an injected `today` argument. Everything the app claims about a user's body is
computed here, so it is the part that gets tested hardest.

### 3.1 Storage

IndexedDB is the source of truth. The app is fully functional with no account
and no network. Supabase is backup and second-device sync only, behind a
`CycleRepository` interface so it can be removed without touching the UI.

Sync is last-write-wins per row on `updated_at`, keyed `(user_id, log_date)`.
Deletes are soft (`deleted_at`) so a deletion on one device propagates rather
than resurrecting on the next push.

### 3.2 Dates

Every cycle date is a plain `YYYY-MM-DD` local calendar string. Never a
`Date`, never a UTC timestamp, never an ISO datetime. A period logged at 23:00
BST must not become the previous day, and a timestamp would make that silent.
Conversion to `Date` happens only at the rendering boundary.

## 4. Prediction engine

### 4.1 Deriving cycles

A cycle runs from one `is_period_start` day to the day before the next.
`is_period_start` is stored explicitly, not inferred from runs of bleeding —
inference breaks on spotting, on gaps in logging, and on the mis-log that
motivated this rebuild.

The current cycle is open-ended and has no length.

### 4.2 Baseline

- `baseline = median(last 6 eligible cycle lengths)`, falling back to the
  onboarding value when fewer than 2 exist.
- `spread = MAD(eligible lengths)`, floored at 1 day.
- Median and MAD, not mean and standard deviation. One 44-day outlier moves a
  mean by nearly 3 days and a median by zero. This is the specific defect being
  fixed.

A cycle is *eligible* when it is not excluded by a `cycle_resolution`.

### 4.3 Anomaly detection

A completed cycle is anomalous when:

```
|length - baseline| > max(7, 3 * spread)
```

An anomalous cycle is **provisionally excluded from the baseline** the moment
it is detected, before the user responds. This is the fix for "one late period
and now the app predicts 44 days".

The app then asks. Two distinct cases:

- **Suspected missed period** — when `length` is within ±20% of `2 × baseline`.
  The app asks whether a period went unlogged around the midpoint, and offers
  to insert it, splitting the cycle in two.
- **Otherwise** — the app asks whether this was a one-off (stays excluded) or a
  new normal (included, and the baseline moves).

Two consecutive anomalies in the same direction shift the baseline
automatically, with a notice. A body that has genuinely changed should not
require the user to keep dismissing prompts.

### 4.4 Ovulation

Ovulation is predicted **backwards from the predicted next period**:

```
ovulation = nextPeriodStart - lutealLength
```

not forwards as `cycleLength - 14`. The luteal phase is the more stable of the
two phases, so anchoring to it degrades more gracefully when cycle length
varies.

`lutealLength` starts at 14 (clamped 9–17) and is learned: when the user
confirms ovulation and the next period subsequently arrives, the observed
luteal length is recorded and the running median becomes the new estimate.
That is the feedback loop the user asked for, made to actually change output.

A confirmed ovulation in the *current* cycle overrides the prediction for that
cycle.

### 4.5 Predictions are ranges

`nextPeriodStart` is reported as `{ likely, earliest, latest }` where the
bounds are `likely ± max(1, spread)`. The UI leads with the likely date and
shows the window. A single confident date would be a claim the model cannot
support.

### 4.6 Fertile window and guidance

The biological window is `ovulation - 5` through `ovulation + 1`: sperm
survival up to five days, ovum viability up to about a day.

The window **displayed as requiring protection** is that window widened by the
current ovulation uncertainty on both sides:

```
protectionStart = ovulation - 5 - uncertainty
protectionEnd   = ovulation + 1 + uncertainty
uncertainty     = confirmed this cycle ? 0 : max(1, spread)
```

Uncertainty always widens caution and never narrows it. A confirmed ovulation
narrows the window; an erratic history widens it.

Risk levels:

| Level      | Condition                                        |
|------------|--------------------------------------------------|
| `high`     | inside the biological window                     |
| `elevated` | inside the uncertainty buffer                    |
| `lower`    | outside, with ≥3 eligible cycles of history      |
| `unknown`  | fewer than 3 eligible cycles                     |

`unknown` renders as "not enough history to estimate" — not as a low-risk day.
With one or two cycles logged the model genuinely cannot distinguish, and
showing green would be a fabrication.

### 4.7 Language

The word "safe" does not appear. Days are "lower risk", never "no risk". Every
guidance surface carries the estimate-not-medical-advice disclaimer, and
Settings links to NHS contraception guidance. No effectiveness percentages are
quoted anywhere, because none can be sourced for this specific implementation.

## 5. Data model

See `supabase/migrations/0001_init.sql`. Three tables — `profiles`,
`day_logs`, `cycle_resolutions` — each with `user_id`, RLS restricted to
`auth.uid() = user_id`, `updated_at` triggers and soft deletes.

There is deliberately no `cycles` table. Cycles are derived. A stored cycle
would be a second source of truth that drifts the moment a date is corrected.

The IndexedDB schema mirrors these three stores, plus a `meta` store holding
the sync watermark and device id.

## 6. Visual design

Rebuilt from the existing Base44 app's language, which the user approved:

- Warm cream ground `#FAF8F5`, near-black warm brown text `#3D3235`.
- Coral-pink gradient hero, mint for reassurance, amber for fertile, deeper
  orange for ovulation.
- Rounded sans (Quicksand), 24–28px card radii, soft ambient shadows.
- Floating pill bottom nav, bottom sheets with grab handles.

Four defects in the existing app are corrected:

1. The Today screen's log button renders behind the bottom nav. Fixed with
   correct stacking and bottom padding that accounts for nav height plus
   `env(safe-area-inset-bottom)`.
2. Ovulation logging is offered on period days. Made contextual.
3. "Very low pregnancy risk" on period days overclaims. Replaced with
   "lower risk" plus the short-cycle caveat.
4. Predictions render as bare confident dates. Replaced with ranges and a
   confidence label.

## 7. PWA

- `vite-plugin-pwa` generates the service worker and manifest, with `base`,
  `scope` and `start_url` all `/cycle/`.
- `404.html` copied from `index.html` as the SPA fallback, since Pages has none.
- `apple-mobile-web-app-capable`, status bar style, apple-touch-icon and
  maskable icons.
- `navigator.storage.persist()` requested after onboarding, because iOS may
  evict script-writable storage. Export to JSON is offered as the manual
  backstop, and cloud sync as the automatic one.

## 8. Testing

Vitest over `src/engine`. The engine is pure, so tests are fast and total.

Required cases include: median resists a single outlier; the 44-day regression
from the user's own history; double-baseline triggers the missed-period path;
two consecutive long cycles shift the baseline; luteal length is learned from
confirmed ovulation; the protection window widens with spread and narrows on
confirmation; risk is `unknown` below three cycles; date arithmetic does not
shift across a DST boundary.

## 9. Deployment

`.github/workflows/deploy.yml` builds on push to `main` and publishes to Pages.
Repository → Settings → Pages → Source must be set to **GitHub Actions**.

Supabase credentials are supplied at build time as
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. They are public by
design and protected by RLS. No service-role key exists in this repository.

Because the repository is public, new signups must be disabled in the Supabase
dashboard once the user's own account exists.
