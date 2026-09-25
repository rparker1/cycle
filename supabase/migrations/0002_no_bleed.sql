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
