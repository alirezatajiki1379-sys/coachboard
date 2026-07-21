create table if not exists public.training_event_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.squad_training_events(id) on delete cascade,
  name text not null,
  group_type text not null default 'exclusive'
    check (group_type in ('exclusive', 'label')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_event_group_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.training_event_groups(id) on delete cascade,
  player_id uuid references public.squad_players(id) on delete cascade,
  custom_name text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (
    (player_id is not null and custom_name is null)
    or (player_id is null and nullif(trim(custom_name), '') is not null)
  )
);

create index if not exists training_event_groups_event_order_idx
on public.training_event_groups (user_id, event_id, sort_order);

create unique index if not exists training_event_group_members_player_unique
on public.training_event_group_members (group_id, player_id)
where player_id is not null;

create index if not exists training_event_group_members_group_order_idx
on public.training_event_group_members (user_id, group_id, sort_order);

alter table public.training_event_groups enable row level security;
alter table public.training_event_group_members enable row level security;

drop trigger if exists set_training_event_groups_updated_at on public.training_event_groups;
create trigger set_training_event_groups_updated_at
before update on public.training_event_groups
for each row
execute function public.set_updated_at();

drop policy if exists "training event groups are owned by the user" on public.training_event_groups;
create policy "training event groups are owned by the user"
on public.training_event_groups
for all
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squad_training_events
    where squad_training_events.id = training_event_groups.event_id
    and squad_training_events.user_id = auth.uid()
  )
);

drop policy if exists "training event group members are owned by the user" on public.training_event_group_members;
create policy "training event group members are owned by the user"
on public.training_event_group_members
for all
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.training_event_groups
    where training_event_groups.id = training_event_group_members.group_id
    and training_event_groups.user_id = auth.uid()
  )
  and (
    player_id is null
    or exists (
      select 1
      from public.training_event_groups
      join public.squad_attendance_records
        on squad_attendance_records.event_id = training_event_groups.event_id
      where training_event_groups.id = training_event_group_members.group_id
      and squad_attendance_records.player_id = training_event_group_members.player_id
      and squad_attendance_records.user_id = auth.uid()
    )
  )
);
