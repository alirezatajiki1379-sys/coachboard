-- CoachBoard Player Development Goals & Progress Tracking
-- Evolves the existing development-goal architecture in place.

alter table public.player_development_goals
add column if not exists squad_id uuid references public.squads(id) on delete cascade,
add column if not exists success_criteria text not null default '',
add column if not exists coach_notes text,
add column if not exists achieved_at timestamptz;

update public.player_development_goals
set squad_id = squad_players.squad_id
from public.squad_players
where player_development_goals.player_id = squad_players.id
and player_development_goals.squad_id is null;

update public.player_development_goals
set success_criteria = coalesce(nullif(success_criteria, ''), nullif(description, ''), title)
where success_criteria = '';

update public.player_development_goals
set category = case
  when category in ('technique', 'goalkeeping') then 'technical'
  when category in ('tactical_understanding', 'decision_making') then 'tactical'
  when category = 'physical' then 'physical'
  when category in ('mental', 'communication', 'leadership', 'behaviour') then 'mental'
  else 'other'
end
where category is not null;

update public.player_observations
set category = case
  when category in ('technique', 'goalkeeping') then 'technical'
  when category in ('tactical_understanding', 'decision_making') then 'tactical'
  when category = 'physical' then 'physical'
  when category in ('mental', 'communication', 'leadership', 'behaviour') then 'mental'
  else 'other'
end
where category is not null;

update public.player_development_goals
set status = case
  when status = 'active' then 'in_progress'
  when status = 'completed' then 'achieved'
  when status = 'cancelled' then 'paused'
  else status
end;

update public.player_development_goals
set progress = case
  when progress = 'not_started' then 'needs_attention'
  when progress = 'in_progress' then 'developing'
  when progress = 'almost_there' then 'consistent'
  when progress = 'completed' then 'achieved'
  else progress
end;

update public.player_development_goals
set achieved_at = coalesce(achieved_at, completed_at)
where status = 'achieved';

alter table public.player_development_goals
drop constraint if exists player_development_goals_category_check;

alter table public.player_development_goals
drop constraint if exists player_development_goals_status_check;

alter table public.player_development_goals
drop constraint if exists player_development_goals_progress_check;

alter table public.player_development_goals
add constraint player_development_goals_category_check
check (category in ('technical', 'tactical', 'physical', 'mental', 'other'));

alter table public.player_development_goals
add constraint player_development_goals_status_check
check (status in ('identified', 'in_progress', 'achieved', 'paused'));

alter table public.player_development_goals
add constraint player_development_goals_progress_check
check (progress in ('needs_attention', 'developing', 'consistent', 'achieved'));

alter table public.player_development_goals
alter column category set default 'technical';

alter table public.player_development_goals
alter column status set default 'in_progress';

alter table public.player_development_goals
alter column progress set default 'developing';

alter table public.player_development_goals
alter column squad_id set not null;

alter table public.player_observations
drop constraint if exists player_observations_category_check;

alter table public.player_observations
add constraint player_observations_category_check
check (
  category is null
  or category in ('technical', 'tactical', 'physical', 'mental', 'other')
);

create table if not exists public.player_development_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  squad_id uuid not null references public.squads(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  goal_id uuid not null references public.player_development_goals(id) on delete cascade,
  training_event_id uuid references public.squad_training_events(id) on delete set null,
  progress_level text not null
    check (progress_level in ('needs_attention', 'developing', 'consistent', 'achieved')),
  note text not null,
  recorded_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.development_goal_observations (
  goal_id uuid not null references public.player_development_goals(id) on delete cascade,
  observation_id uuid not null references public.player_observations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (goal_id, observation_id)
);

create index if not exists player_development_goals_squad_status_idx
on public.player_development_goals (squad_id, status);

create index if not exists player_development_goals_player_status_idx
on public.player_development_goals (player_id, status);

create index if not exists player_development_goals_review_idx
on public.player_development_goals (squad_id, review_date);

create index if not exists player_development_progress_goal_recorded_idx
on public.player_development_progress (goal_id, recorded_at desc);

create index if not exists player_development_progress_player_recorded_idx
on public.player_development_progress (player_id, recorded_at desc);

create index if not exists development_goal_observations_observation_idx
on public.development_goal_observations (observation_id);

drop trigger if exists set_player_development_progress_updated_at
on public.player_development_progress;

create trigger set_player_development_progress_updated_at
before update on public.player_development_progress
for each row
execute function public.set_updated_at();

alter table public.player_development_progress enable row level security;
alter table public.development_goal_observations enable row level security;

drop policy if exists "player development progress is owned by the user"
on public.player_development_progress;

create policy "player development progress is owned by the user"
on public.player_development_progress
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.player_development_goals
    where player_development_goals.id = player_development_progress.goal_id
    and player_development_goals.user_id = auth.uid()
    and player_development_goals.player_id = player_development_progress.player_id
    and player_development_goals.squad_id = player_development_progress.squad_id
  )
  and (
    training_event_id is null
    or exists (
      select 1
      from public.squad_training_events
      where squad_training_events.id = player_development_progress.training_event_id
      and squad_training_events.user_id = auth.uid()
      and squad_training_events.squad_id = player_development_progress.squad_id
    )
  )
);

drop policy if exists "development goal observations are owned by the user"
on public.development_goal_observations;

create policy "development goal observations are owned by the user"
on public.development_goal_observations
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.player_development_goals
    join public.player_observations
      on player_observations.id = development_goal_observations.observation_id
    where player_development_goals.id = development_goal_observations.goal_id
    and player_development_goals.user_id = auth.uid()
    and player_observations.user_id = auth.uid()
    and player_observations.player_id = player_development_goals.player_id
  )
);
