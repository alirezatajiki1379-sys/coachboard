-- Repair Production databases that received the earlier Staff Brief schema
-- before the shared Session Plan Builder fields were added. This migration is
-- intentionally additive and preserves existing plans, sections, drills, and
-- staff assignments.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Session Plan JSON ---------------------------------------------------------

alter table public.training_session_plan_instances
add column if not exists plan_json jsonb;

update public.training_session_plan_instances
set plan_json = '{}'::jsonb
where plan_json is null
   or jsonb_typeof(plan_json) <> 'object';

alter table public.training_session_plan_instances
alter column plan_json set default '{}'::jsonb,
alter column plan_json set not null;

alter table public.training_session_plan_instances
drop constraint if exists training_session_plan_instances_plan_json_check;

alter table public.training_session_plan_instances
add constraint training_session_plan_instances_plan_json_check
check (jsonb_typeof(plan_json) = 'object');

-- Canonical Session sections -----------------------------------------------

alter table public.training_section_briefs
add column if not exists plan_instance_id uuid;

alter table public.training_section_briefs
add column if not exists title text;

alter table public.training_section_briefs
add column if not exists order_index integer not null default 0;

alter table public.training_section_briefs
add column if not exists duration_minutes integer not null default 0;

alter table public.training_section_briefs
add column if not exists section_notes text;

alter table public.training_section_briefs
add column if not exists responsibility_mode text;

alter table public.training_section_briefs
add column if not exists staff_id uuid;

alter table public.training_section_briefs
add column if not exists planning_status text;

alter table public.training_section_briefs
add column if not exists instruction text;

alter table public.training_section_briefs
add column if not exists briefing_text text;

update public.training_section_briefs
set title = coalesce(nullif(trim(title), ''), section_key)
where title is null
   or trim(title) = '';

update public.training_section_briefs
set responsibility_mode = case
  when staff_id is not null then
    case
      when responsibility_mode in ('staff', 'together') then responsibility_mode
      else 'staff'
    end
  else
    case
      when responsibility_mode in ('unassigned', 'me') then responsibility_mode
      else 'unassigned'
    end
end;

update public.training_section_briefs
set planning_status = 'needs_planning'
where planning_status is null
   or planning_status not in ('ready', 'needs_planning');

alter table public.training_section_briefs
alter column title set not null,
alter column responsibility_mode set default 'unassigned',
alter column responsibility_mode set not null,
alter column planning_status set default 'needs_planning',
alter column planning_status set not null;

alter table public.training_section_briefs
drop constraint if exists training_section_briefs_plan_instance_id_fkey;

alter table public.training_section_briefs
add constraint training_section_briefs_plan_instance_id_fkey
foreign key (plan_instance_id)
references public.training_session_plan_instances(id)
on delete cascade;

alter table public.training_section_briefs
drop constraint if exists training_section_briefs_staff_id_fkey;

alter table public.training_section_briefs
add constraint training_section_briefs_staff_id_fkey
foreign key (staff_id)
references public.squad_staff(id)
on delete set null;

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

-- Session Drill overrides and responsibility data --------------------------

alter table public.training_session_drill_instances
add column if not exists section_id uuid;

alter table public.training_session_drill_instances
add column if not exists override_json jsonb;

alter table public.training_session_drill_instances
add column if not exists responsibility_mode text;

alter table public.training_session_drill_instances
add column if not exists responsible_staff_id uuid;

alter table public.training_session_drill_instances
add column if not exists planning_status text;

alter table public.training_session_drill_instances
add column if not exists planning_instruction text;

update public.training_session_drill_instances
set override_json = '{}'::jsonb
where override_json is null
   or jsonb_typeof(override_json) <> 'object';

update public.training_session_drill_instances
set responsibility_mode = case
  when responsible_staff_id is not null then
    case
      when responsibility_mode in ('staff', 'together') then responsibility_mode
      else 'staff'
    end
  else
    case
      when responsibility_mode in ('unassigned', 'me') then responsibility_mode
      else null
    end
end;

update public.training_session_drill_instances
set planning_status = null
where planning_status is not null
  and planning_status not in ('ready', 'needs_planning');

alter table public.training_session_drill_instances
alter column override_json set default '{}'::jsonb,
alter column override_json set not null;

alter table public.training_session_drill_instances
drop constraint if exists training_session_drill_instances_section_id_fkey;

alter table public.training_session_drill_instances
add constraint training_session_drill_instances_section_id_fkey
foreign key (section_id)
references public.training_section_briefs(id)
on delete set null;

alter table public.training_session_drill_instances
drop constraint if exists training_session_drill_instances_responsible_staff_id_fkey;

alter table public.training_session_drill_instances
add constraint training_session_drill_instances_responsible_staff_id_fkey
foreign key (responsible_staff_id)
references public.squad_staff(id)
on delete set null;

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

-- Materialize legacy block names as canonical sections. Stable keys and the
-- event/key unique constraint make the backfill repeat-safe.
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
group by
  drill.user_id,
  event.squad_id,
  drill.event_id,
  plan.id,
  coalesce(nullif(trim(drill.block), ''), 'Main Part')
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

-- Required query indexes ----------------------------------------------------

create index if not exists training_session_plan_instances_event_idx
on public.training_session_plan_instances (user_id, event_id);

create index if not exists squad_staff_user_squad_active_idx
on public.squad_staff (user_id, squad_id, is_active);

create index if not exists training_section_briefs_user_event_idx
on public.training_section_briefs (user_id, event_id);

create index if not exists training_section_briefs_event_order_idx
on public.training_section_briefs (event_id, order_index, section_key);

create index if not exists training_section_briefs_plan_order_idx
on public.training_section_briefs (plan_instance_id, order_index);

create index if not exists training_session_drill_instances_event_order_idx
on public.training_session_drill_instances (user_id, event_id, order_index);

create index if not exists training_session_drill_instances_section_order_idx
on public.training_session_drill_instances (section_id, order_index);

create index if not exists training_session_drill_instances_event_status_idx
on public.training_session_drill_instances (event_id, status, order_index);

create index if not exists training_session_drill_instances_source_drill_idx
on public.training_session_drill_instances (user_id, source_drill_id, event_id)
where source_drill_id is not null and status <> 'removed';

-- Keep updated_at behavior aligned with the canonical schema. ---------------

drop trigger if exists set_training_session_plan_instances_updated_at
on public.training_session_plan_instances;

create trigger set_training_session_plan_instances_updated_at
before update on public.training_session_plan_instances
for each row execute function public.set_updated_at();

drop trigger if exists set_squad_staff_updated_at on public.squad_staff;

create trigger set_squad_staff_updated_at
before update on public.squad_staff
for each row execute function public.set_updated_at();

drop trigger if exists set_training_section_briefs_updated_at
on public.training_section_briefs;

create trigger set_training_section_briefs_updated_at
before update on public.training_section_briefs
for each row execute function public.set_updated_at();

drop trigger if exists set_training_session_drill_instances_updated_at
on public.training_session_drill_instances;

create trigger set_training_session_drill_instances_updated_at
before update on public.training_session_drill_instances
for each row execute function public.set_updated_at();

-- Ownership protection ------------------------------------------------------

alter table public.squad_staff enable row level security;
alter table public.training_section_briefs enable row level security;
alter table public.training_session_drill_instances enable row level security;

drop policy if exists "squad staff belong to the team owner"
on public.squad_staff;

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

drop policy if exists "training section briefs belong to the event owner"
on public.training_section_briefs;

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

drop policy if exists "training session drill instances are owned by the user"
on public.training_session_drill_instances;

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
    training_session_drill_instances.plan_instance_id is null
    or exists (
      select 1
      from public.training_session_plan_instances plan
      where plan.id = training_session_drill_instances.plan_instance_id
        and plan.user_id = auth.uid()
    )
  )
  and (
    training_session_drill_instances.source_drill_id is null
    or exists (
      select 1
      from public.drills drill
      where drill.id = training_session_drill_instances.source_drill_id
        and drill.user_id = auth.uid()
    )
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
      join public.squad_training_events event
        on event.id = training_session_drill_instances.event_id
      where staff.id = training_session_drill_instances.responsible_staff_id
        and staff.user_id = auth.uid()
        and staff.squad_id = event.squad_id
        and event.user_id = auth.uid()
    )
  )
);
