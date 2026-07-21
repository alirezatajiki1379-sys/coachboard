alter table public.squads
add column if not exists country_code text not null default 'DE',
add column if not exists federal_state_code text,
add column if not exists city text,
add column if not exists calendar_preferences jsonb not null default '{
  "publicHolidays": "ask",
  "schoolHolidays": "ask",
  "localMovableHolidays": "confirmed_only",
  "customExclusions": "exclude"
}'::jsonb;

alter table public.squads
drop constraint if exists squads_country_state_check;

alter table public.squads
add constraint squads_country_state_check
check (
  country_code <> 'DE'
  or federal_state_code is null
  or federal_state_code in (
    'DE-BW','DE-BY','DE-BE','DE-BB','DE-HB','DE-HH','DE-HE','DE-MV',
    'DE-NI','DE-NW','DE-RP','DE-SL','DE-SN','DE-ST','DE-SH','DE-TH'
  )
);

create table if not exists public.regional_calendar_events (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  federal_state_code text,
  name text not null,
  category text not null
    check (category in ('public_holiday', 'school_holiday', 'movable_holiday', 'local_customary_day')),
  starts_on date not null,
  ends_on date not null,
  source text,
  source_version text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table if not exists public.team_calendar_exclusions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  squad_id uuid not null references public.squads(id) on delete cascade,
  name text not null,
  category text not null
    check (category in ('movable_holiday', 'local_customary_day', 'team_custom_exclusion')),
  starts_on date not null,
  ends_on date not null,
  reason text,
  exclude_by_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table if not exists public.recurrence_series_exclusions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid not null references public.training_recurrence_series(id) on delete cascade,
  excluded_date date not null,
  reason_type text not null,
  reason_label text not null,
  source_calendar_event_id uuid,
  created_at timestamptz not null default now(),
  unique(series_id, excluded_date)
);

create index if not exists regional_calendar_events_lookup_idx
on public.regional_calendar_events (country_code, federal_state_code, starts_on, ends_on, category);

create index if not exists team_calendar_exclusions_lookup_idx
on public.team_calendar_exclusions (user_id, squad_id, starts_on, ends_on, category);

create index if not exists recurrence_series_exclusions_series_idx
on public.recurrence_series_exclusions (user_id, series_id, excluded_date);

alter table public.regional_calendar_events enable row level security;
alter table public.team_calendar_exclusions enable row level security;
alter table public.recurrence_series_exclusions enable row level security;

drop trigger if exists set_regional_calendar_events_updated_at on public.regional_calendar_events;
create trigger set_regional_calendar_events_updated_at
before update on public.regional_calendar_events
for each row
execute function public.set_updated_at();

drop trigger if exists set_team_calendar_exclusions_updated_at on public.team_calendar_exclusions;
create trigger set_team_calendar_exclusions_updated_at
before update on public.team_calendar_exclusions
for each row
execute function public.set_updated_at();

drop policy if exists "regional calendar events are readable by authenticated users" on public.regional_calendar_events;
create policy "regional calendar events are readable by authenticated users"
on public.regional_calendar_events
for select
using (auth.uid() is not null);

drop policy if exists "team calendar exclusions are owned by the user" on public.team_calendar_exclusions;
create policy "team calendar exclusions are owned by the user"
on public.team_calendar_exclusions
for all
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squads
    where squads.id = team_calendar_exclusions.squad_id
    and squads.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squads
    where squads.id = team_calendar_exclusions.squad_id
    and squads.user_id = auth.uid()
  )
);

drop policy if exists "recurrence exclusions are owned by the user" on public.recurrence_series_exclusions;
create policy "recurrence exclusions are owned by the user"
on public.recurrence_series_exclusions
for all
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.training_recurrence_series
    where training_recurrence_series.id = recurrence_series_exclusions.series_id
    and training_recurrence_series.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.training_recurrence_series
    where training_recurrence_series.id = recurrence_series_exclusions.series_id
    and training_recurrence_series.user_id = auth.uid()
  )
);
