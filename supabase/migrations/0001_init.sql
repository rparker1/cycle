-- Cycle — initial schema
--
-- Three tables. Day logs are the source of truth; cycles are derived on the
-- client and deliberately not stored, because a stored cycle would be a second
-- source of truth that drifts the moment a date is corrected.
--
-- Row-level security is not optional here. The publishable key ships in a
-- public bundle, so these policies are the only thing between a stranger and
-- this data.

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table if not exists public.profiles (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  display_name      text,
  app_name          text     not null default 'Cycle',
  avg_cycle_length  smallint not null default 28 check (avg_cycle_length  between 15 and 60),
  avg_period_length smallint not null default 5  check (avg_period_length between 1 and 15),
  luteal_length     smallint not null default 14 check (luteal_length     between 9  and 17),
  onboarded_at      timestamptz,
  settings          jsonb    not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.day_logs (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  log_date             date not null,

  is_period            boolean not null default false,
  is_period_start      boolean not null default false,
  is_period_end        boolean not null default false,
  flow                 text check (flow in ('spotting','light','medium','heavy')),

  felt_fertile         boolean not null default false,
  ovulation_claimed    boolean not null default false,
  ovulation_confidence text check (ovulation_confidence in ('confident','unsure','rejected')),
  ovulation_signs      text[] not null default '{}',

  symptoms             text[] not null default '{}',
  mood                 text,
  sexual_activity      boolean,
  protection_used      boolean,
  notes                text,

  prediction_feedback  text check (prediction_feedback in ('accurate','early','late','wrong')),

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,

  constraint day_logs_one_per_day  unique (user_id, log_date),
  constraint day_logs_start_is_period check (not (is_period_start and not is_period)),
  constraint day_logs_protection_needs_activity
    check (protection_used is null or sexual_activity is true)
);

create table if not exists public.cycle_resolutions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  cycle_start            date not null,
  observed_length        smallint,
  resolution             text not null
    check (resolution in ('one_off','new_normal','missed_period','mislogged')),
  excluded_from_baseline boolean not null default false,
  note                   text,
  resolved_at            timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz,

  constraint cycle_resolutions_one_per_cycle unique (user_id, cycle_start)
);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists day_logs_touch on public.day_logs;
create trigger day_logs_touch before update on public.day_logs
  for each row execute function public.set_updated_at();

drop trigger if exists cycle_resolutions_touch on public.cycle_resolutions;
create trigger cycle_resolutions_touch before update on public.cycle_resolutions
  for each row execute function public.set_updated_at();

-- Delta-pull indexes: sync asks "what changed since my watermark".
create index if not exists day_logs_sync_idx
  on public.day_logs (user_id, updated_at);
create index if not exists cycle_resolutions_sync_idx
  on public.cycle_resolutions (user_id, updated_at);

alter table public.profiles          enable row level security;
alter table public.day_logs          enable row level security;
alter table public.cycle_resolutions enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own day logs" on public.day_logs;
create policy "own day logs" on public.day_logs
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own resolutions" on public.cycle_resolutions;
create policy "own resolutions" on public.cycle_resolutions
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
