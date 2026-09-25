# Cycle

A period and fertility tracker. Offline-first, installable on an iPhone as a
PWA, with optional sync to your own Supabase project.

> **Cycle estimates. It does not know.** Predictions come from the dates you
> log. Calendar-based fertility awareness is not a reliable method of
> contraception on its own. Estimates only — not medical advice. No method is
> 100% effective. See [NHS contraception guidance](https://www.nhs.uk/contraception/).

---

## What it does

- **Today** — a cycle wheel showing where you are, days to your next period,
  and today's contraception guidance.
- **Calendar** — colour-coded month view. Tap any day to report it: "were you
  bleeding?" during a period, "has it started?" when one is due, and symptoms.
- **Log day** — one button for period days, fertility signs and ovulation,
  with a gentle symptom check-in before an ovulation claim is recorded.
- **History** — cycle list, length trend, and prompts to explain unusual cycles.
- **Settings** — defaults, theme, JSON export/import, optional sync.

## How the predictions work

The engine (`src/engine/`) is pure: no storage, no network, and "today" is an
argument rather than a clock read. That makes every claim it makes testable,
and it is tested — `npm test` runs 154 cases against it.

**Baseline is a median, not a mean.** The median of your last six cycles, with
median absolute deviation for spread. A single 44-day cycle moves a mean by
nearly three days and a median by nothing.

**Unusual cycles are set aside before you're asked about them.** A cycle that
deviates by more than `max(7 days, 3 × spread)` is flagged and provisionally
excluded from the baseline immediately. The app then asks what happened, and
offers the explanation that actually fits — including "I missed logging a
period", which splits an over-long cycle in two. Until you answer, your
predictions carry on as they were.

This is the specific defect this rebuild exists to fix: one late period should
not make the app predict a 44-day cycle.

**Two consecutive cycles deviating the same way shift the baseline
automatically.** A body that has genuinely changed should not make you dismiss
the same prompt every month.

**Ovulation is anchored backwards from the predicted period**, by your luteal
phase length, rather than forwards as `cycleLength − 14`. The luteal phase is
the stabler half of the cycle. Each time you confirm ovulation and the next
period then arrives, the app measures your actual luteal length and updates its
running median.

**Period length is learned, not assumed.** Once two periods have a confirmed
last day — a "no, not bleeding" the day after, or a booked length that has
passed — their median replaces the onboarding answer.

**"Not yet" moves the next period, and nothing else.** Answering "has your
period started? — not yet" rules that day out, so the estimate never sits on a
day you have already had. Ovulation and the fertile window stay where they
were: moving them could only pull caution earlier. Once the period is past its
latest expected day, later days are shown as uncertain, not lower risk.

**Predictions are ranges.** "Most likely 3 Oct, window 1–6 Oct" — never a
single confident date the model has no right to claim.

**Uncertainty widens caution, never narrows it.** The biological fertile window
is ovulation −5 to +1. The window shown as requiring protection is that,
widened by the current prediction uncertainty on both sides. Confirming
ovulation narrows it; an erratic history widens it. Below three logged cycles
the app reports "not enough history" rather than showing you green days it
cannot justify.

## Running locally

```bash
npm install
npm run dev
```

```bash
npm test          # prediction engine
npm run typecheck
npm run build
```

## Data

IndexedDB is the source of truth. The app is fully functional with no account
and no network; Supabase is backup and second-device sync only, behind the
`CycleRepository` interface in `src/data/repository.ts`.

### Setting up Supabase (optional)

1. Create a project, then run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   in the SQL Editor. It creates three tables with row-level security,
   `updated_at` triggers and delta-pull indexes.
2. Copy `.env.example` to `.env` and fill in your project URL and publishable
   key. Both are public by design and protected by RLS. **Never put a
   service-role key in this repository.**
3. In the Supabase dashboard, create your account, then turn **off**
   Authentication → Sign In / Providers → "Allow new users to sign up". This
   repository is public, so the project ref is public; RLS protects your rows
   but nothing else stops a stranger registering against your quota.
4. Verify with Advisors → Security that no table reports missing RLS.

Sync uses email and password rather than magic links: on iOS a magic link opens
in Safari rather than the installed PWA, so the session lands in the wrong
storage and the app still looks signed out.

## Deploying

Pushing to `main` runs the tests, builds, and publishes to GitHub Pages.

One-time setup: **Settings → Pages → Source → GitHub Actions**. If you sync,
add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as repository
secrets.

The site is served from `https://<owner>.github.io/cycle/`. That path is
case-sensitive and must match `VITE_BASE_PATH` in the workflow, the manifest
`start_url` and the service worker scope. A mismatch produces a blank page,
which is the most common way a Pages deploy of a Vite SPA fails.

### Installing on an iPhone

Open the site in Safari → Share → Add to Home Screen. Launch it from the home
screen icon, not from Safari, or it will not run standalone and storage is
treated less generously.

## Layout

```
src/
  engine/     prediction — pure, tested, no I/O
  data/       IndexedDB repository, optional Supabase sync
  store/      zustand state
  screens/    Today, Calendar, History, Settings, Onboarding
  components/ presentational components
  lib/        dates, formatting, guidance copy
supabase/migrations/
docs/superpowers/specs/
```

All user-facing risk language lives in `src/lib/guidance.ts`, in one file, so
it can be reviewed as a whole.

### Dates

Every cycle date is a plain `YYYY-MM-DD` local calendar string — never a
`Date`, never a UTC timestamp. A period logged at 23:00 BST must not silently
become the previous day. `src/lib/date.ts` does all arithmetic in local time
and is tested across both daylight-saving transitions.
