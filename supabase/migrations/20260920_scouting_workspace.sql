-- Apply before deploying the Scouting workspace.
-- Owner-scoped composite foreign keys prevent cross-user references even outside RLS.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create unique index if not exists squad_players_owner_identity_idx
  on public.squad_players (user_id, id);
create unique index if not exists squads_owner_identity_idx
  on public.squads (user_id, id);

create table if not exists public.scouting_players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null check (length(trim(first_name)) between 1 and 120),
  last_name text,
  date_of_birth date,
  primary_position text,
  secondary_positions text[] not null default '{}',
  strong_foot text check (strong_foot in ('left', 'right', 'both')),
  current_club text,
  current_team text,
  status text not null default 'identified'
    check (status in ('identified', 'monitoring', 'shortlist', 'trial', 'added_to_squad', 'archived')),
  source text,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  notes text,
  height_cm numeric(5,1),
  weight_kg numeric(5,1),
  next_action text check (next_action in ('observe_again', 'contact_club', 'invite_to_trial', 'discuss', 'none', 'archive')),
  next_action_date date,
  linked_squad_player_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, linked_squad_player_id)
    references public.squad_players(user_id, id) on delete set null (linked_squad_player_id)
);
create unique index if not exists scouting_players_linked_squad_player_idx
  on public.scouting_players (user_id, linked_squad_player_id)
  where linked_squad_player_id is not null;
create index if not exists scouting_players_owner_status_idx
  on public.scouting_players (user_id, status, priority);
create index if not exists scouting_players_owner_followup_idx
  on public.scouting_players (user_id, next_action_date)
  where next_action_date is not null;

create table if not exists public.scouting_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null,
  observed_on date not null,
  context text not null check (context in ('match', 'training', 'tournament', 'trial', 'other')),
  event_label text,
  observed_position text,
  minutes_observed integer check (minutes_observed is null or minutes_observed between 0 and 300),
  observer text,
  strengths text,
  development_considerations text,
  summary text not null check (length(trim(summary)) between 1 and 4000),
  next_action text,
  rating_technical integer check (rating_technical between 1 and 5),
  rating_tactical integer check (rating_tactical between 1 and 5),
  rating_physical integer check (rating_physical between 1 and 5),
  rating_mental integer check (rating_mental between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, player_id) references public.scouting_players(user_id, id) on delete cascade
);
create index if not exists scouting_observations_player_date_idx
  on public.scouting_observations (user_id, player_id, observed_on desc);

create table if not exists public.scouting_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  squad_id uuid,
  title text not null check (length(trim(title)) between 1 and 160),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  positions text[] not null default '{}',
  birth_year_from integer check (birth_year_from is null or birth_year_from between 1900 and 2100),
  birth_year_to integer check (birth_year_to is null or birth_year_to between 1900 and 2100),
  preferred_foot text check (preferred_foot in ('left', 'right', 'both')),
  desired_profile text,
  target_number integer check (target_number is null or target_number between 1 and 100),
  deadline date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, squad_id) references public.squads(user_id, id) on delete set null (squad_id)
);
create index if not exists scouting_targets_owner_status_idx
  on public.scouting_targets (user_id, status, deadline);

create table if not exists public.scouting_target_players (
  user_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null,
  player_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (target_id, player_id),
  foreign key (user_id, target_id) references public.scouting_targets(user_id, id) on delete cascade,
  foreign key (user_id, player_id) references public.scouting_players(user_id, id) on delete cascade
);
create index if not exists scouting_target_players_owner_player_idx
  on public.scouting_target_players (user_id, player_id);

create table if not exists public.scouting_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null,
  event_type text not null check (event_type in (
    'created', 'observation_added', 'status_changed', 'target_linked',
    'target_removed', 'invited_to_trial', 'added_to_squad', 'archived'
  )),
  detail text,
  created_at timestamptz not null default now(),
  foreign key (user_id, player_id) references public.scouting_players(user_id, id) on delete cascade
);
create index if not exists scouting_history_player_date_idx
  on public.scouting_history (user_id, player_id, created_at desc);

drop trigger if exists set_scouting_players_updated_at on public.scouting_players;
create trigger set_scouting_players_updated_at before update on public.scouting_players
  for each row execute function public.set_updated_at();
drop trigger if exists set_scouting_observations_updated_at on public.scouting_observations;
create trigger set_scouting_observations_updated_at before update on public.scouting_observations
  for each row execute function public.set_updated_at();
drop trigger if exists set_scouting_targets_updated_at on public.scouting_targets;
create trigger set_scouting_targets_updated_at before update on public.scouting_targets
  for each row execute function public.set_updated_at();

alter table public.scouting_players enable row level security;
alter table public.scouting_observations enable row level security;
alter table public.scouting_targets enable row level security;
alter table public.scouting_target_players enable row level security;
alter table public.scouting_history enable row level security;

drop policy if exists "scouting players owner" on public.scouting_players;
create policy "scouting players owner" on public.scouting_players for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "scouting observations owner" on public.scouting_observations;
create policy "scouting observations owner" on public.scouting_observations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "scouting targets owner" on public.scouting_targets;
create policy "scouting targets owner" on public.scouting_targets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "scouting target links owner" on public.scouting_target_players;
create policy "scouting target links owner" on public.scouting_target_players for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "scouting history owner" on public.scouting_history;
create policy "scouting history owner" on public.scouting_history for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
