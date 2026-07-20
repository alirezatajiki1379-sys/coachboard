create table if not exists public.training_recurrence_series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  squad_id uuid references public.squads(id) on delete restrict,
  title text,
  default_start_time time not null,
  default_end_time time,
  default_location text,
  default_focus text,
  frequency text not null default 'weekly' check (frequency in ('weekly')),
  interval_weeks integer not null default 1 check (interval_weeks > 0),
  weekdays integer[] not null default '{}',
  starts_on date not null,
  ends_on date,
  occurrence_limit integer check (occurrence_limit is null or occurrence_limit > 0),
  end_mode text not null default 'date' check (end_mode in ('date', 'occurrence_count')),
  status text not null default 'active' check (status in ('active', 'ended', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.squad_training_events
add column if not exists recurrence_series_id uuid references public.training_recurrence_series(id) on delete set null,
add column if not exists recurrence_sequence integer,
add column if not exists is_series_exception boolean not null default false,
add column if not exists exception_type text,
add column if not exists recurrence_original_date date;

create index if not exists training_recurrence_series_user_squad_status_idx
on public.training_recurrence_series (user_id, squad_id, status);

create index if not exists squad_training_events_recurrence_series_date_idx
on public.squad_training_events (recurrence_series_id, date, recurrence_sequence);

drop trigger if exists set_training_recurrence_series_updated_at
on public.training_recurrence_series;

create trigger set_training_recurrence_series_updated_at
before update on public.training_recurrence_series
for each row
execute function public.set_updated_at();

alter table public.training_recurrence_series enable row level security;

drop policy if exists "training recurrence series are owned by the user"
on public.training_recurrence_series;

create policy "training recurrence series are owned by the user"
on public.training_recurrence_series
for all
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squads
    where squads.id = training_recurrence_series.squad_id
    and squads.user_id = auth.uid()
  )
);
