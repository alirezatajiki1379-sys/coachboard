-- Team-scoped staff and canonical Session Plan structure shared by the
-- Session Plan Builder and Staff Brief. Drill/template source snapshots remain
-- immutable; current Session-only edits use plan_json and override_json.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.squad_staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  squad_id uuid not null references public.squads(id) on delete cascade,
  name text not null,
  role text not null default 'Assistant coach',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.squad_staff
drop constraint if exists squad_staff_name_check;

alter table public.squad_staff
add constraint squad_staff_name_check
check (length(trim(name)) between 1 and 120);

alter table public.squad_staff
drop constraint if exists squad_staff_role_check;

alter table public.squad_staff
add constraint squad_staff_role_check
check (length(trim(role)) between 1 and 80);

create index if not exists squad_staff_user_squad_active_idx
on public.squad_staff (user_id, squad_id, is_active);

alter table public.training_session_plan_instances
add column if not exists plan_json jsonb not null default '{}'::jsonb;

alter table public.training_session_plan_instances
drop constraint if exists training_session_plan_instances_plan_json_check;

alter table public.training_session_plan_instances
add constraint training_session_plan_instances_plan_json_check
check (jsonb_typeof(plan_json) = 'object');

create table if not exists public.training_section_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  squad_id uuid not null references public.squads(id) on delete cascade,
  event_id uuid not null references public.squad_training_events(id) on delete cascade,
  plan_instance_id uuid references public.training_session_plan_instances(id) on delete cascade,
  section_key text not null,
  title text not null,
  order_index integer not null default 0,
  duration_minutes integer not null default 0,
  section_notes text,
  responsibility_mode text not null default 'unassigned',
  staff_id uuid references public.squad_staff(id) on delete set null,
  planning_status text not null default 'needs_planning',
  instruction text,
  briefing_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, section_key)
);

-- Keep this migration safe when an earlier Staff Brief draft already created
-- the table with fewer Session Plan fields.
alter table public.training_section_briefs
add column if not exists plan_instance_id uuid references public.training_session_plan_instances(id) on delete cascade;

alter table public.training_section_briefs
add column if not exists title text;

alter table public.training_section_briefs
add column if not exists order_index integer not null default 0;

alter table public.training_section_briefs
add column if not exists duration_minutes integer not null default 0;

alter table public.training_section_briefs
add column if not exists section_notes text;

alter table public.training_section_briefs
add column if not exists responsibility_mode text not null default 'unassigned';

alter table public.training_section_briefs
add column if not exists staff_id uuid references public.squad_staff(id) on delete set null;

alter table public.training_section_briefs
add column if not exists planning_status text not null default 'needs_planning';

alter table public.training_section_briefs
add column if not exists instruction text;

alter table public.training_section_briefs
add column if not exists briefing_text text;

update public.training_section_briefs
set title = coalesce(nullif(trim(title), ''), section_key),
    responsibility_mode = case
      when staff_id is not null and responsibility_mode = 'unassigned' then 'staff'
      else responsibility_mode
    end
where title is null
   or trim(title) = ''
   or (staff_id is not null and responsibility_mode = 'unassigned');

alter table public.training_section_briefs
alter column title set not null;

alter table public.training_section_briefs
drop constraint if exists training_section_briefs_section_key_check;

alter table public.training_section_briefs
add constraint training_section_briefs_section_key_check
check (length(trim(section_key)) between 1 and 120);

alter table public.training_section_briefs
drop constraint if exists training_section_briefs_title_check;

alter table public.training_section_briefs
add constraint training_section_briefs_title_check
check (length(trim(title)) between 1 and 120);

alter table public.training_section_briefs
drop constraint if exists training_section_briefs_order_index_check;

alter table public.training_section_briefs
add constraint training_section_briefs_order_index_check
check (order_index between 0 and 1000);

alter table public.training_section_briefs
drop constraint if exists training_section_briefs_duration_minutes_check;

alter table public.training_section_briefs
add constraint training_section_briefs_duration_minutes_check
check (duration_minutes between 0 and 600);

alter table public.training_section_briefs
drop constraint if exists training_section_briefs_section_notes_check;

alter table public.training_section_briefs
add constraint training_section_briefs_section_notes_check
check (section_notes is null or length(section_notes) <= 5000);

alter table public.training_section_briefs
drop constraint if exists training_section_briefs_responsibility_mode_check;

alter table public.training_section_briefs
add constraint training_section_briefs_responsibility_mode_check
check (
  (responsibility_mode in ('unassigned', 'me') and staff_id is null)
  or (responsibility_mode in ('staff', 'together') and staff_id is not null)
);

alter table public.training_section_briefs
drop constraint if exists training_section_briefs_planning_status_check;

alter table public.training_section_briefs
add constraint training_section_briefs_planning_status_check
check (planning_status in ('ready', 'needs_planning'));

alter table public.training_section_briefs
drop constraint if exists training_section_briefs_instruction_check;

alter table public.training_section_briefs
add constraint training_section_briefs_instruction_check
check (instruction is null or length(instruction) <= 500);

alter table public.training_section_briefs
drop constraint if exists training_section_briefs_briefing_text_check;

alter table public.training_section_briefs
add constraint training_section_briefs_briefing_text_check
check (briefing_text is null or length(briefing_text) <= 2000);

create index if not exists training_section_briefs_user_event_idx
on public.training_section_briefs (user_id, event_id);

create index if not exists training_section_briefs_event_order_idx
on public.training_section_briefs (event_id, order_index, section_key);

create index if not exists training_section_briefs_plan_order_idx
on public.training_section_briefs (plan_instance_id, order_index);

alter table public.training_session_drill_instances
add column if not exists section_id uuid references public.training_section_briefs(id) on delete set null;

alter table public.training_session_drill_instances
add column if not exists override_json jsonb not null default '{}'::jsonb;

alter table public.training_session_drill_instances
add column if not exists responsibility_mode text;

alter table public.training_session_drill_instances
add column if not exists responsible_staff_id uuid references public.squad_staff(id) on delete set null;

alter table public.training_session_drill_instances
add column if not exists planning_status text;

alter table public.training_session_drill_instances
add column if not exists planning_instruction text;

alter table public.training_session_drill_instances
drop constraint if exists training_session_drill_instances_override_json_check;

alter table public.training_session_drill_instances
add constraint training_session_drill_instances_override_json_check
check (jsonb_typeof(override_json) = 'object');

alter table public.training_session_drill_instances
drop constraint if exists training_session_drill_instances_responsibility_mode_check;

alter table public.training_session_drill_instances
add constraint training_session_drill_instances_responsibility_mode_check
check (
  (responsibility_mode is null and responsible_staff_id is null)
  or (responsibility_mode in ('unassigned', 'me') and responsible_staff_id is null)
  or (responsibility_mode in ('staff', 'together') and responsible_staff_id is not null)
);

alter table public.training_session_drill_instances
drop constraint if exists training_session_drill_instances_planning_status_check;

alter table public.training_session_drill_instances
add constraint training_session_drill_instances_planning_status_check
check (planning_status is null or planning_status in ('ready', 'needs_planning'));

alter table public.training_session_drill_instances
drop constraint if exists training_session_drill_instances_planning_instruction_check;

alter table public.training_session_drill_instances
add constraint training_session_drill_instances_planning_instruction_check
check (planning_instruction is null or length(planning_instruction) <= 500);

create index if not exists training_session_drill_instances_section_order_idx
on public.training_session_drill_instances (section_id, order_index);

-- Preserve existing Session Plans by materializing their block names as
-- canonical sections before the shared builder starts using section_id.
insert into public.training_section_briefs (
  user_id,
  squad_id,
  event_id,
  plan_instance_id,
  section_key,
  title,
  order_index,
  duration_minutes,
  responsibility_mode,
  planning_status
)
select
  drill.user_id,
  event.squad_id,
  drill.event_id,
  plan.id,
  'legacy-' || substr(md5(coalesce(nullif(trim(drill.block), ''), 'Main Part')), 1, 16),
  coalesce(nullif(trim(drill.block), ''), 'Main Part'),
  min(drill.order_index),
  sum(coalesce(drill.planned_duration_minutes, 0))::integer,
  'unassigned',
  'ready'
from public.training_session_drill_instances drill
join public.squad_training_events event
  on event.id = drill.event_id
 and event.user_id = drill.user_id
left join public.training_session_plan_instances plan
  on plan.event_id = drill.event_id
 and plan.user_id = drill.user_id
where event.squad_id is not null
  and not exists (
    select 1
    from public.training_section_briefs existing
    where existing.event_id = drill.event_id
      and (
        existing.section_key = 'legacy-' || substr(md5(coalesce(nullif(trim(drill.block), ''), 'Main Part')), 1, 16)
        or existing.title = coalesce(nullif(trim(drill.block), ''), 'Main Part')
      )
  )
group by drill.user_id, event.squad_id, drill.event_id, plan.id, coalesce(nullif(trim(drill.block), ''), 'Main Part')
on conflict (event_id, section_key) do nothing;

update public.training_session_drill_instances drill
set section_id = section.id
from public.training_section_briefs section
where drill.section_id is null
  and section.event_id = drill.event_id
  and section.user_id = drill.user_id
  and (
    section.section_key = 'legacy-' || substr(md5(coalesce(nullif(trim(drill.block), ''), 'Main Part')), 1, 16)
    or section.title = coalesce(nullif(trim(drill.block), ''), 'Main Part')
  );

drop trigger if exists set_squad_staff_updated_at on public.squad_staff;
create trigger set_squad_staff_updated_at
before update on public.squad_staff
for each row execute function public.set_updated_at();

drop trigger if exists set_training_section_briefs_updated_at on public.training_section_briefs;
create trigger set_training_section_briefs_updated_at
before update on public.training_section_briefs
for each row execute function public.set_updated_at();

alter table public.squad_staff enable row level security;
alter table public.training_section_briefs enable row level security;

drop policy if exists "squad staff belong to the team owner" on public.squad_staff;
create policy "squad staff belong to the team owner"
on public.squad_staff
for all
to authenticated
using (
  auth.uid() = squad_staff.user_id
  and exists (
    select 1
    from public.squads squad
    where squad.id = squad_staff.squad_id
      and squad.user_id = auth.uid()
  )
)
with check (
  auth.uid() = squad_staff.user_id
  and exists (
    select 1
    from public.squads squad
    where squad.id = squad_staff.squad_id
      and squad.user_id = auth.uid()
  )
);

drop policy if exists "training section briefs belong to the event owner" on public.training_section_briefs;
create policy "training section briefs belong to the event owner"
on public.training_section_briefs
for all
to authenticated
using (
  auth.uid() = training_section_briefs.user_id
  and exists (
    select 1
    from public.squad_training_events event
    where event.id = training_section_briefs.event_id
      and event.user_id = auth.uid()
      and event.squad_id = training_section_briefs.squad_id
  )
)
with check (
  auth.uid() = training_section_briefs.user_id
  and exists (
    select 1
    from public.squad_training_events event
    where event.id = training_section_briefs.event_id
      and event.user_id = auth.uid()
      and event.squad_id = training_section_briefs.squad_id
  )
  and (
    training_section_briefs.plan_instance_id is null
    or exists (
      select 1
      from public.training_session_plan_instances plan
      where plan.id = training_section_briefs.plan_instance_id
        and plan.event_id = training_section_briefs.event_id
        and plan.user_id = auth.uid()
    )
  )
  and (
    training_section_briefs.staff_id is null
    or exists (
      select 1
      from public.squad_staff staff
      where staff.id = training_section_briefs.staff_id
        and staff.user_id = auth.uid()
        and staff.squad_id = training_section_briefs.squad_id
    )
  )
);

-- Extend the existing Drill Instance ownership policy so section and staff
-- references cannot cross event/team ownership boundaries.
drop policy if exists "training session drill instances are owned by the user" on public.training_session_drill_instances;
create policy "training session drill instances are owned by the user"
on public.training_session_drill_instances
for all
to authenticated
using (auth.uid() = training_session_drill_instances.user_id)
with check (
  auth.uid() = training_session_drill_instances.user_id
  and exists (
    select 1
    from public.squad_training_events event
    where event.id = training_session_drill_instances.event_id
      and event.user_id = auth.uid()
  )
  and (
    training_session_drill_instances.section_id is null
    or exists (
      select 1
      from public.training_section_briefs section
      where section.id = training_session_drill_instances.section_id
        and section.event_id = training_session_drill_instances.event_id
        and section.user_id = auth.uid()
    )
  )
  and (
    training_session_drill_instances.responsible_staff_id is null
    or exists (
      select 1
      from public.squad_staff staff
      join public.squad_training_events event on event.id = training_session_drill_instances.event_id
      where staff.id = training_session_drill_instances.responsible_staff_id
        and staff.user_id = auth.uid()
        and staff.squad_id = event.squad_id
        and event.user_id = auth.uid()
    )
  )
);
