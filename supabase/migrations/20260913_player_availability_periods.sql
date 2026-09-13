-- CoachBoard Player Availability periods and attendance availability sync support.
-- Production repair migration for Squad / Attendance / Player Profile loading after availability rollout.
-- Safe/manual version: self-contained updated_at function + legacy late normalization.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.player_availability_periods (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  player_id uuid not null
    references public.squad_players(id)
    on delete cascade,

  squad_id uuid
    references public.squads(id)
    on delete cascade,

  reason text not null,
  starts_on date not null,
  ends_on date,
  note text,
  status text not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.player_availability_periods
drop constraint if exists player_availability_periods_reason_check;

alter table public.player_availability_periods
add constraint player_availability_periods_reason_check
check (
  reason in ('school', 'work', 'holiday', 'private', 'other')
);

alter table public.player_availability_periods
drop constraint if exists player_availability_periods_status_check;

alter table public.player_availability_periods
add constraint player_availability_periods_status_check
check (
  status in ('active', 'cancelled')
);

alter table public.player_availability_periods
drop constraint if exists player_availability_periods_date_order_check;

alter table public.player_availability_periods
add constraint player_availability_periods_date_order_check
check (
  ends_on is null
  or ends_on >= starts_on
);

alter table public.squad_attendance_records
add column if not exists planned_reason text,
add column if not exists planned_status_source text default 'default';

update public.squad_attendance_records
set planned_reason = planned_status,
    planned_status = 'unavailable'
where planned_status in ('V', 'K', 'E', 'P', 'S', 'Z', 'U');

update public.squad_attendance_records
set final_status = 'Z'
where final_status = 'late';

update public.squad_attendance_records
set planned_reason = 'Z'
where planned_reason = 'late';

alter table public.squad_attendance_records
drop constraint if exists squad_attendance_records_planned_status_check;

alter table public.squad_attendance_records
drop constraint if exists squad_attendance_records_planned_reason_check;

alter table public.squad_attendance_records
drop constraint if exists squad_attendance_records_final_status_check;

alter table public.squad_attendance_records
drop constraint if exists squad_attendance_records_planned_status_source_check;

alter table public.squad_attendance_records
add constraint squad_attendance_records_planned_status_check
check (
  planned_status is null
  or planned_status in ('expected', 'unavailable', 'unclear')
);

alter table public.squad_attendance_records
add constraint squad_attendance_records_planned_reason_check
check (
  planned_reason is null
  or planned_reason in ('V', 'K', 'E', 'P', 'S', 'Z', 'U', 'injured', 'sick', 'school', 'work', 'holiday', 'private', 'other')
);

alter table public.squad_attendance_records
add constraint squad_attendance_records_final_status_check
check (
  final_status is null
  or final_status in ('present', 'absent', 'Z', 'V', 'K', 'E', 'P', 'S', 'U')
);

alter table public.squad_attendance_records
add constraint squad_attendance_records_planned_status_source_check
check (
  planned_status_source is null
  or planned_status_source in ('default', 'manual', 'medical', 'availability')
);

create index if not exists player_availability_periods_user_player_status_idx
on public.player_availability_periods (
  user_id,
  player_id,
  status,
  starts_on,
  ends_on
);

drop trigger if exists set_player_availability_periods_updated_at
on public.player_availability_periods;

create trigger set_player_availability_periods_updated_at
before update on public.player_availability_periods
for each row
execute function public.set_updated_at();

alter table public.player_availability_periods
enable row level security;

drop policy if exists "player availability periods are owned by the user"
on public.player_availability_periods;

create policy "player availability periods are owned by the user"
on public.player_availability_periods
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squad_players
    where squad_players.id = player_availability_periods.player_id
    and squad_players.user_id = auth.uid()
  )
  and (
    squad_id is null
    or exists (
      select 1
      from public.squads
      where squads.id = player_availability_periods.squad_id
      and squads.user_id = auth.uid()
    )
  )
);
