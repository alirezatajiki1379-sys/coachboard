create table if not exists public.squads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_active boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists squads_user_id_active_unique_idx
on public.squads (user_id)
where is_active and archived_at is null;

create index if not exists squads_user_id_active_idx
on public.squads (user_id, is_active, archived_at);

insert into public.squads (user_id, name, is_active)
select distinct user_id, 'Active Squad', true
from public.squad_players
where user_id is not null
on conflict do nothing;

insert into public.squads (user_id, name, is_active)
select distinct user_id, 'Active Squad', true
from public.squad_training_events
where user_id is not null
and not exists (
  select 1
  from public.squads
  where squads.user_id = squad_training_events.user_id
  and squads.is_active = true
  and squads.archived_at is null
)
on conflict do nothing;

alter table public.squad_players
add column if not exists squad_id uuid references public.squads(id) on delete set null,
add column if not exists trial_duration_mode text,
add column if not exists trial_training_limit integer,
add column if not exists trial_end_date date;

update public.squad_players
set squad_id = squads.id
from public.squads
where squad_players.squad_id is null
and squads.user_id = squad_players.user_id
and squads.is_active = true
and squads.archived_at is null;

alter table public.squad_training_events
add column if not exists squad_id uuid references public.squads(id) on delete restrict,
add column if not exists squad_assignment_needs_review boolean not null default false;

update public.squad_training_events
set squad_id = squads.id,
    squad_assignment_needs_review = false
from public.squads
where squad_training_events.squad_id is null
and squads.user_id = squad_training_events.user_id
and squads.is_active = true
and squads.archived_at is null;

create table if not exists public.training_session_plan_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.squad_training_events(id) on delete cascade,
  source_training_session_id uuid references public.training_sessions(id) on delete set null,
  source_updated_at timestamptz,
  title text not null,
  snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id)
);

create table if not exists public.training_session_drill_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.squad_training_events(id) on delete cascade,
  plan_instance_id uuid references public.training_session_plan_instances(id) on delete cascade,
  source_training_session_drill_id uuid references public.training_session_drills(id) on delete set null,
  source_drill_id uuid references public.drills(id) on delete set null,
  source_drill_updated_at timestamptz,
  title text not null,
  block text,
  order_index integer not null default 0,
  planned_duration_minutes integer,
  snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists squad_players_user_id_type_archived_idx
on public.squad_players (user_id, squad_id, player_type, archived_at);

create index if not exists squad_training_events_user_id_date_idx
on public.squad_training_events (user_id, squad_id, date desc, start_time desc);

create index if not exists training_session_plan_instances_event_idx
on public.training_session_plan_instances (user_id, event_id);

create index if not exists training_session_drill_instances_event_order_idx
on public.training_session_drill_instances (user_id, event_id, order_index);

alter table public.squads enable row level security;
alter table public.training_session_plan_instances enable row level security;
alter table public.training_session_drill_instances enable row level security;

drop trigger if exists set_squads_updated_at on public.squads;
create trigger set_squads_updated_at
before update on public.squads
for each row
execute function public.set_updated_at();

drop trigger if exists set_training_session_plan_instances_updated_at on public.training_session_plan_instances;
create trigger set_training_session_plan_instances_updated_at
before update on public.training_session_plan_instances
for each row
execute function public.set_updated_at();

drop trigger if exists set_training_session_drill_instances_updated_at on public.training_session_drill_instances;
create trigger set_training_session_drill_instances_updated_at
before update on public.training_session_drill_instances
for each row
execute function public.set_updated_at();

drop policy if exists "squads are owned by the user" on public.squads;
create policy "squads are owned by the user"
on public.squads
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "squad training events are owned by the user" on public.squad_training_events;
create policy "squad training events are owned by the user"
on public.squad_training_events
for all
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squads
    where squads.id = squad_training_events.squad_id
    and squads.user_id = auth.uid()
  )
  and (
    linked_training_session_id is null
    or exists (
      select 1
      from public.training_sessions
      where training_sessions.id = squad_training_events.linked_training_session_id
      and training_sessions.user_id = auth.uid()
    )
  )
);

drop policy if exists "training session plan instances are owned by the user" on public.training_session_plan_instances;
create policy "training session plan instances are owned by the user"
on public.training_session_plan_instances
for all
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squad_training_events
    where squad_training_events.id = training_session_plan_instances.event_id
    and squad_training_events.user_id = auth.uid()
  )
);

drop policy if exists "training session drill instances are owned by the user" on public.training_session_drill_instances;
create policy "training session drill instances are owned by the user"
on public.training_session_drill_instances
for all
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squad_training_events
    where squad_training_events.id = training_session_drill_instances.event_id
    and squad_training_events.user_id = auth.uid()
  )
);
