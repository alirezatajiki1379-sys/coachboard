-- =========================================================
-- COACHBOARD – MASTER DATABASE SCHEMA
-- Vollständiger aktueller Datenbankstand
-- =========================================================


-- =========================================================
-- 1. EXTENSIONS
-- =========================================================

create extension if not exists "pgcrypto";


-- =========================================================
-- 2. SHARED FUNCTIONS
-- Müssen vor den Triggern erstellt werden
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    display_name
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


-- =========================================================
-- 3. USER PROFILES
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  display_name text,
  club_name text,
  preferred_language text not null default 'en',
  default_age_group text,
  default_pitch_background text,
  pdf_branding_name text,
  logo_url text,
  season_start_month integer not null default 7 check (season_start_month between 1 and 12),
  season_start_day integer not null default 1 check (season_start_day between 1 and 31),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists season_start_month integer not null default 7,
add column if not exists season_start_day integer not null default 1;

alter table public.profiles
drop constraint if exists profiles_season_start_month_check;

alter table public.profiles
drop constraint if exists profiles_season_start_day_check;

alter table public.profiles
add constraint profiles_season_start_month_check check (season_start_month between 1 and 12);

alter table public.profiles
add constraint profiles_season_start_day_check check (season_start_day between 1 and 31);


-- =========================================================
-- 4. DRILLS
-- =========================================================

create table if not exists public.drills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  title text not null,
  short_description text,

  organization text,
  coaching_points text,
  variations text,
  easier_version text,
  harder_version text,

  age_groups text[] not null default '{}',
  main_focus text not null,
  sub_focus text,
  training_blocks text[] not null default '{}',
  drill_type text not null,

  duration_minutes integer not null default 10
    check (duration_minutes > 0),

  min_players integer not null default 1
    check (min_players > 0),

  max_players integer not null default 1
    check (max_players >= min_players),

  materials jsonb not null default '[]'::jsonb,

  pitch_area text,

  difficulty_level integer not null default 3
    check (difficulty_level between 1 and 5),

  intensity_level integer not null default 3
    check (intensity_level between 1 and 5),

  is_favorite boolean not null default false,
  tags text[] not null default '{}',

  archived_at timestamptz,
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- Fehlende Spalten in bestehenden Datenbanken ergänzen

alter table public.drills
add column if not exists archived_at timestamptz;

alter table public.drills
add column if not exists deleted_at timestamptz;


-- =========================================================
-- 5. DRILL GRAPHICS
-- =========================================================

create table if not exists public.drill_graphics (
  id uuid primary key default gen_random_uuid(),

  drill_id uuid not null
    references public.drills(id)
    on delete cascade,

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  canvas_json jsonb not null default '{}'::jsonb,
  preview_image_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (drill_id)
);


-- =========================================================
-- 6. USER-CREATED GRAPHIC TEMPLATES
-- =========================================================

create table if not exists public.drill_graphic_templates (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  name text not null,
  template_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- =========================================================
-- 7. LEGACY / OPTIONAL STRUCTURED MATERIAL TABLE
-- Drill materials are currently also stored in drills.materials
-- =========================================================

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  drill_id uuid
    references public.drills(id)
    on delete cascade,

  material_type text not null,
  color text,
  label text,

  quantity integer not null default 1
    check (quantity > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- =========================================================
-- 8. TRAINING SESSION PLANS
-- =========================================================

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  title text not null,
  session_date date,
  start_time time,

  team_age_group text,
  main_focus text,
  secondary_focus text,

  expected_players integer
    check (
      expected_players is null
      or expected_players > 0
    ),

  duration_target_minutes integer
    check (
      duration_target_minutes is null
      or duration_target_minutes > 0
    ),

  location text,
  notes text,

  player_groups jsonb,
  block_notes jsonb,

  archived_at timestamptz,
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- Fehlende Spalten in bestehenden Datenbanken ergänzen

alter table public.training_sessions
add column if not exists start_time time;

alter table public.training_sessions
add column if not exists player_groups jsonb;

alter table public.training_sessions
add column if not exists block_notes jsonb;

alter table public.training_sessions
add column if not exists archived_at timestamptz;

alter table public.training_sessions
add column if not exists deleted_at timestamptz;


-- =========================================================
-- 9. DRILLS INSIDE TRAINING SESSIONS
-- =========================================================

create table if not exists public.training_session_drills (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  session_id uuid not null
    references public.training_sessions(id)
    on delete cascade,

  drill_id uuid not null
    references public.drills(id)
    on delete restrict,

  block text not null default 'Main part 1',
  order_index integer not null default 0,

  planned_duration_minutes integer not null default 10
    check (planned_duration_minutes > 0),

  coach_notes text,

  timing_mode text not null default 'sequential'
    check (
      timing_mode in ('sequential', 'simultaneous')
    ),

  simultaneous_group text,
  participating_groups text[],
  starting_group text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- Fehlende Spalten in bestehenden Datenbanken ergänzen

alter table public.training_session_drills
add column if not exists simultaneous_group text;

alter table public.training_session_drills
add column if not exists participating_groups text[];

alter table public.training_session_drills
add column if not exists starting_group text;


-- Alte simultane Drills auf Set 1 normalisieren

update public.training_session_drills
set simultaneous_group = 'set-1'
where timing_mode = 'simultaneous'
and simultaneous_group is null;


-- Alte Set-Bezeichnungen normalisieren

update public.training_session_drills
set simultaneous_group =
  case simultaneous_group
    when 'Group A' then 'set-1'
    when 'Set A' then 'set-1'
    when 'Group B' then 'set-2'
    when 'Set B' then 'set-2'
    when 'Group C' then 'set-3'
    when 'Set C' then 'set-3'
    when 'Group D' then 'set-4'
    when 'Set D' then 'set-4'
    else simultaneous_group
  end
where simultaneous_group is not null;


-- =========================================================
-- 10. TAGS
-- =========================================================

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  name text not null,

  created_at timestamptz not null default now()
);


-- =========================================================
-- 11. SQUAD PLAYERS
-- Permanent roster players and trial players
-- =========================================================

create table if not exists public.squads (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  name text not null,
  is_active boolean not null default false,
  country_code text not null default 'DE',
  federal_state_code text,
  city text,
  calendar_preferences jsonb not null default '{
    "publicHolidays": "ask",
    "schoolHolidays": "ask",
    "localMovableHolidays": "confirmed_only",
    "customExclusions": "exclude"
  }'::jsonb,
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.squad_players (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  squad_id uuid references public.squads(id) on delete set null,

  first_name text not null,
  last_name text,

  date_of_birth date,
  position text,
  secondary_positions text[] not null default '{}',
  strong_foot text,
  club text,
  original_club text,
  club_training_schedule text,
  external_player_id text,
  trial_start_date date,
  trial_duration_mode text,
  trial_training_limit integer,
  trial_end_date date,
  player_email text,

  parent_guardian_name text,
  parent_phone text,
  player_phone text,
  parent_email text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,

  top_size text,
  jacket_size text,
  trouser_size text,
  shoe_size text,

  preferred_positions text[] not null default '{}',
  original_preferred_positions text,
  original_strong_foot text,

  height_cm integer,
  weight_kg integer,
  jersey_number text,
  captain_status text not null default 'none'
    check (
      captain_status in ('none', 'captain', 'vice_captain')
    ),
  joined_date date,

  allergies text,
  medication text,
  medical_notes text,

  hobbies text,
  development_goal text,
  work_on text,
  coach_expectations text,
  onboarding_comments text,
  recommended_players_raw text,
  recommended_player_name text,
  recommended_player_birth_year text,
  recommended_player_position text,
  recommended_player_club text,
  onboarding_source text,
  onboarding_submitted_at timestamptz,
  onboarding_import_batch text,
  import_batch_id uuid,
  onboarding_original_answers jsonb,
  onboarding_normalized_values jsonb,
  onboarding_warnings text[] not null default '{}',
  notes text,

  player_type text not null default 'roster'
    check (
      player_type in ('roster', 'trial')
    ),

  converted_at timestamptz,
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- Fehlende Spalten in bestehenden Datenbanken ergänzen

alter table public.squad_players
add column if not exists player_type text not null default 'roster';

alter table public.squad_players
add column if not exists squad_id uuid references public.squads(id) on delete set null;

insert into public.squads (user_id, name, is_active)
select distinct user_id, 'Active Squad', true
from public.squad_players
where user_id is not null
and not exists (
  select 1
  from public.squads
  where squads.user_id = squad_players.user_id
  and squads.is_active = true
  and squads.archived_at is null
)
on conflict do nothing;

update public.squad_players
set squad_id = squads.id
from public.squads
where squad_players.squad_id is null
and squads.user_id = squad_players.user_id
and squads.is_active = true
and squads.archived_at is null;

alter table public.squad_players
add column if not exists converted_at timestamptz;

alter table public.squad_players
alter column last_name drop not null;

alter table public.squad_players
add column if not exists secondary_positions text[] not null default '{}',
add column if not exists original_club text,
add column if not exists club_training_schedule text,
add column if not exists external_player_id text,
add column if not exists trial_start_date date,
add column if not exists trial_duration_mode text,
add column if not exists trial_training_limit integer,
add column if not exists trial_end_date date,
add column if not exists player_email text,
add column if not exists parent_guardian_name text,
add column if not exists emergency_contact_name text,
add column if not exists emergency_contact_phone text,
add column if not exists emergency_contact_relationship text,
add column if not exists top_size text,
add column if not exists jacket_size text,
add column if not exists trouser_size text,
add column if not exists shoe_size text,
add column if not exists preferred_positions text[] not null default '{}',
add column if not exists original_preferred_positions text,
add column if not exists original_strong_foot text,
add column if not exists height_cm integer,
add column if not exists weight_kg integer,
add column if not exists jersey_number text,
add column if not exists captain_status text not null default 'none',
add column if not exists joined_date date,
add column if not exists allergies text,
add column if not exists medication text,
add column if not exists medical_notes text,
add column if not exists coach_expectations text,
add column if not exists onboarding_comments text,
add column if not exists recommended_players_raw text,
add column if not exists recommended_player_name text,
add column if not exists recommended_player_birth_year text,
add column if not exists recommended_player_position text,
add column if not exists recommended_player_club text,
add column if not exists onboarding_source text,
add column if not exists onboarding_submitted_at timestamptz,
add column if not exists onboarding_import_batch text,
add column if not exists import_batch_id uuid,
add column if not exists onboarding_original_answers jsonb,
add column if not exists onboarding_normalized_values jsonb,
add column if not exists onboarding_warnings text[] not null default '{}';


-- Ungültige oder leere Werte bereinigen

update public.squad_players
set player_type = 'roster'
where player_type is null
or player_type not in ('roster', 'trial');


-- Player-Type-Constraint für bestehende Tabelle ergänzen

alter table public.squad_players
drop constraint if exists squad_players_player_type_check;

alter table public.squad_players
add constraint squad_players_player_type_check
check (
  player_type in ('roster', 'trial')
);

alter table public.squad_players
drop constraint if exists squad_players_trial_duration_mode_check;

alter table public.squad_players
add constraint squad_players_trial_duration_mode_check
check (
  trial_duration_mode is null
  or trial_duration_mode in ('training_count', 'end_date')
);

alter table public.squad_players
drop constraint if exists squad_players_captain_status_check;

alter table public.squad_players
add constraint squad_players_captain_status_check
check (
  captain_status in ('none', 'captain', 'vice_captain')
);


-- =========================================================
-- 11A.1. PLAYER IMPORT BATCHES AND ROW AUDIT
-- =========================================================

create table if not exists public.player_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null default 'paste'
    check (source_type in ('xlsx', 'csv', 'paste', 'template')),
  source_name text,
  source_sheet text,
  import_mode text not null default 'add_new'
    check (import_mode in ('add_new', 'add_update', 'update_only')),
  total_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  warning_count integer not null default 0,
  status text not null default 'completed'
    check (
      status in (
        'draft',
        'processing',
        'completed',
        'completed_with_errors',
        'failed',
        'rolled_back',
        'partially_rolled_back'
      )
    ),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  rolled_back_at timestamptz
);

create table if not exists public.player_import_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_batch_id uuid not null references public.player_import_batches(id) on delete cascade,
  row_number integer not null,
  result_status text not null default 'skipped'
    check (result_status in ('created', 'updated', 'skipped', 'failed', 'rolled_back', 'rollback_blocked')),
  player_id uuid references public.squad_players(id) on delete set null,
  matched_player_id uuid references public.squad_players(id) on delete set null,
  operation text not null default 'skip'
    check (operation in ('create', 'update', 'fill_missing', 'skip')),
  error_code text,
  warning_codes text[] not null default '{}',
  original_row jsonb,
  applied_changes jsonb,
  previous_values jsonb,
  created_at timestamptz not null default now()
);


-- =========================================================
-- 11B. PLAYER HUB CONTACTS, MEDICAL PERIODS AND HEADER PREFS
-- =========================================================

create table if not exists public.player_contacts (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  player_id uuid not null
    references public.squad_players(id)
    on delete cascade,

  name text,
  relationship text not null default 'parent'
    check (
      relationship in (
        'mother',
        'father',
        'parent',
        'guardian',
        'emergency',
        'other'
      )
    ),
  phone text,
  email text,
  is_primary boolean not null default false,
  is_emergency boolean not null default false,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_medical_periods (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  player_id uuid not null
    references public.squad_players(id)
    on delete cascade,

  type text not null
    check (
      type in ('injured', 'sick')
    ),

  start_date date not null,
  end_date date,
  expected_return_date date,
  actual_return_date date,
  description text not null,
  notes text,
  status text not null default 'active'
    check (
      status in ('active', 'completed', 'cancelled')
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    end_date is null
    or end_date >= start_date
  ),
  check (
    actual_return_date is null
    or actual_return_date >= start_date
  ),
  check (
    expected_return_date is null
    or expected_return_date >= start_date
  )
);

create table if not exists public.player_header_preferences (
  user_id uuid primary key
    references auth.users(id)
    on delete cascade,

  show_height boolean not null default false,
  show_weight boolean not null default false,
  show_jersey_number boolean not null default false,
  show_captain boolean not null default false,
  show_joined_date boolean not null default false,
  show_last_training boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.player_medical_periods
drop constraint if exists player_medical_periods_date_order_check;

alter table public.player_medical_periods
add constraint player_medical_periods_date_order_check
check (
  end_date is null
  or end_date >= start_date
);

alter table public.player_medical_periods
drop constraint if exists player_medical_periods_actual_return_check;

alter table public.player_medical_periods
add constraint player_medical_periods_actual_return_check
check (
  actual_return_date is null
  or actual_return_date >= start_date
);

alter table public.player_medical_periods
drop constraint if exists player_medical_periods_expected_return_check;

alter table public.player_medical_periods
add constraint player_medical_periods_expected_return_check
check (
  expected_return_date is null
  or expected_return_date >= start_date
);


-- =========================================================
-- 12. ACTUAL SQUAD TRAINING EVENTS
-- Reale Trainingstermine für Anwesenheit und Bewertung
-- =========================================================

create table if not exists public.training_recurrence_series (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  squad_id uuid references public.squads(id) on delete restrict,

  title text,
  default_start_time time not null,
  default_end_time time,
  default_location text,
  default_focus text,

  frequency text not null default 'weekly'
    check (frequency in ('weekly')),
  interval_weeks integer not null default 1
    check (interval_weeks > 0),
  weekdays integer[] not null default '{}',
  starts_on date not null,
  ends_on date,
  occurrence_limit integer
    check (
      occurrence_limit is null
      or occurrence_limit > 0
    ),
  end_mode text not null default 'date'
    check (end_mode in ('date', 'occurrence_count')),
  status text not null default 'active'
    check (status in ('active', 'ended', 'paused')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

create table if not exists public.squad_training_events (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  squad_id uuid references public.squads(id) on delete restrict,
  squad_assignment_needs_review boolean not null default false,
  recurrence_series_id uuid references public.training_recurrence_series(id) on delete set null,
  recurrence_sequence integer,
  is_series_exception boolean not null default false,
  exception_type text,
  recurrence_original_date date,

  date date not null,
  start_time time not null,
  end_time time,

  label text,
  location text,
  focus text,
  season_label text,

  linked_training_session_id uuid
    references public.training_sessions(id)
    on delete set null,

  status text not null default 'draft'
    check (
      status in (
        'draft',
        'prepared',
        'in_progress',
        'rating_open',
        'completed'
      )
    ),

  general_notes text,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.squad_training_events
add column if not exists location text,
add column if not exists focus text,
add column if not exists season_label text,
add column if not exists squad_id uuid references public.squads(id) on delete restrict,
add column if not exists squad_assignment_needs_review boolean not null default false,
add column if not exists recurrence_series_id uuid references public.training_recurrence_series(id) on delete set null,
add column if not exists recurrence_sequence integer,
add column if not exists is_series_exception boolean not null default false,
add column if not exists exception_type text,
add column if not exists recurrence_original_date date,
add column if not exists archived_at timestamptz,
add column if not exists deleted_at timestamptz;

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


-- =========================================================
-- 13. ATTENDANCE AND PLAYER RATINGS
-- One record per event and player
-- =========================================================

create table if not exists public.squad_attendance_records (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  event_id uuid not null
    references public.squad_training_events(id)
    on delete cascade,

  player_id uuid not null
    references public.squad_players(id)
    on delete cascade,

  planned_status text
    check (
      planned_status is null
      or planned_status in (
        'expected',
        'unavailable',
        'unclear'
      )
    ),

  planned_reason text
    check (
      planned_reason is null
      or planned_reason in (
        'V',
        'K',
        'E',
        'P',
        'S',
        'Z',
        'U'
      )
    ),

  planned_reason_note text,
  planned_status_source text
    check (
      planned_status_source is null
      or planned_status_source in (
        'default',
        'manual',
        'medical'
      )
    ),

  final_status text
    check (
      final_status is null
      or final_status in (
        'present',
        'absent',
        'Z',
        'V',
        'K',
        'E',
        'P',
        'S',
        'U'
      )
    ),

  late_minutes integer
    check (
      late_minutes is null
      or late_minutes >= 0
    ),

  late_penalty_applied boolean not null default true,

  overall_rating integer
    check (
      overall_rating is null
      or overall_rating between 1 and 5
    ),

  rating_technique integer
    check (
      rating_technique is null
      or rating_technique between 1 and 5
    ),

  rating_game_understanding integer
    check (
      rating_game_understanding is null
      or rating_game_understanding between 1 and 5
    ),

  rating_intensity integer
    check (
      rating_intensity is null
      or rating_intensity between 1 and 5
    ),

  rating_behavior integer
    check (
      rating_behavior is null
      or rating_behavior between 1 and 5
    ),

  rating_auto_suggestion integer
    check (
      rating_auto_suggestion is null
      or rating_auto_suggestion between 1 and 5
    ),

  coach_note text,
  sensitive_note boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    event_id,
    player_id
  )
);

alter table public.squad_attendance_records
add column if not exists planned_reason text,
add column if not exists planned_status_source text default 'default';

update public.squad_attendance_records
set planned_reason = planned_status,
    planned_status = 'unavailable'
where planned_status in ('V', 'K', 'E', 'P', 'S', 'Z', 'U');

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
  or planned_reason in ('V', 'K', 'E', 'P', 'S', 'Z', 'U')
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
  or planned_status_source in ('default', 'manual', 'medical')
);


-- =========================================================
-- 14. PLAYER COACH ASSESSMENTS
-- Manual coach assessments are intentionally separate from automatic analytics.
-- =========================================================

create table if not exists public.player_coach_assessments (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  player_id uuid not null
    references public.squad_players(id)
    on delete cascade,

  assessment text not null default 'decision_open'
    check (
      assessment in (
        'decision_open',
        'continue_observing',
        'positive_development',
        'prospect_player',
        'squad_candidate',
        'below_required_level'
      )
    ),

  reason text,
  assessment_date date not null default current_date,
  review_date date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- =========================================================
-- 15. PLAYER DEVELOPMENT
-- Development goals, lightweight action plans and observations.
-- =========================================================

create table if not exists public.player_development_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  title text not null,
  description text,
  category text not null default 'individual'
    check (category in ('technique', 'tactical_understanding', 'decision_making', 'physical', 'mental', 'communication', 'leadership', 'goalkeeping', 'behaviour', 'individual')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high')),
  status text not null default 'active'
    check (status in ('active', 'completed', 'paused', 'cancelled')),
  progress text not null default 'in_progress'
    check (progress in ('not_started', 'in_progress', 'almost_there', 'completed')),
  start_date date not null default current_date,
  target_date date,
  review_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_goal_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.player_development_goals(id) on delete cascade,
  description text not null,
  completed boolean not null default false,
  due_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  goal_id uuid references public.player_development_goals(id) on delete set null,
  event_id uuid references public.squad_training_events(id) on delete set null,
  observation_date date not null default current_date,
  category text
    check (
      category is null
      or category in ('technique', 'tactical_understanding', 'decision_making', 'physical', 'mental', 'communication', 'leadership', 'goalkeeping', 'behaviour', 'individual')
    ),
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- =========================================================
-- 15B. COACH WORKSPACE VIEWS
-- =========================================================

create table if not exists public.coach_workspace_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  description text,
  kind text not null default 'saved'
    check (kind in ('system', 'saved')),
  system_view_id text,
  configuration jsonb not null default '{}'::jsonb,
  display_order integer not null default 0
    check (display_order >= 0),
  is_default boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint coach_workspace_views_kind_shape_check
    check (
      (kind = 'saved' and system_view_id is null)
      or (kind = 'system' and system_view_id is not null)
    )
);


-- =========================================================
-- 15C. COACH ATTENTION SETTINGS AND STATES
-- =========================================================

create table if not exists public.coach_attention_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_attention_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attention_key text not null,
  player_id uuid not null references public.squad_players(id) on delete cascade,
  attention_type text not null,
  snoozed_until date,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- =========================================================
-- 16. INDEXES
-- =========================================================

create index if not exists drills_user_id_updated_at_idx
on public.drills (
  user_id,
  updated_at desc
);

create index if not exists drills_user_id_archived_deleted_idx
on public.drills (
  user_id,
  archived_at,
  deleted_at
);

create index if not exists drills_search_idx
on public.drills
using gin (
  to_tsvector(
    'english',
    coalesce(title, '')
    || ' '
    || coalesce(short_description, '')
    || ' '
    || coalesce(sub_focus, '')
  )
);

create index if not exists drill_graphics_user_id_idx
on public.drill_graphics (
  user_id
);

create index if not exists drill_graphic_templates_user_id_updated_at_idx
on public.drill_graphic_templates (
  user_id,
  updated_at desc
);

create index if not exists materials_user_id_drill_id_idx
on public.materials (
  user_id,
  drill_id
);

create index if not exists training_sessions_user_id_updated_at_idx
on public.training_sessions (
  user_id,
  updated_at desc
);

create index if not exists training_sessions_user_id_archived_deleted_idx
on public.training_sessions (
  user_id,
  archived_at,
  deleted_at
);

create index if not exists training_session_drills_session_id_order_idx
on public.training_session_drills (
  session_id,
  order_index
);

create unique index if not exists tags_user_id_lower_name_idx
on public.tags (
  user_id,
  lower(name)
);

create index if not exists squads_user_id_active_idx
on public.squads (
  user_id,
  is_active,
  archived_at
);

create unique index if not exists squads_user_id_active_unique_idx
on public.squads (
  user_id
)
where is_active and archived_at is null;

create index if not exists regional_calendar_events_lookup_idx
on public.regional_calendar_events (
  country_code,
  federal_state_code,
  starts_on,
  ends_on,
  category
);

create index if not exists team_calendar_exclusions_lookup_idx
on public.team_calendar_exclusions (
  user_id,
  squad_id,
  starts_on,
  ends_on,
  category
);

create index if not exists recurrence_series_exclusions_series_idx
on public.recurrence_series_exclusions (
  user_id,
  series_id,
  excluded_date
);

create index if not exists squad_players_user_id_last_name_idx
on public.squad_players (
  user_id,
  last_name,
  first_name
);

create index if not exists squad_players_user_id_updated_at_idx
on public.squad_players (
  user_id,
  updated_at desc
);

create index if not exists squad_players_user_id_type_archived_idx
on public.squad_players (
  user_id,
  squad_id,
  player_type,
  archived_at
);

create index if not exists squad_players_user_id_trial_period_idx
on public.squad_players (
  user_id,
  player_type,
  trial_start_date,
  trial_end_date
)
where player_type = 'trial';

create index if not exists squad_players_user_id_import_batch_idx
on public.squad_players (
  user_id,
  import_batch_id
);

create index if not exists squad_players_user_id_external_player_idx
on public.squad_players (
  user_id,
  external_player_id
)
where external_player_id is not null;

create index if not exists player_import_batches_user_id_created_at_idx
on public.player_import_batches (
  user_id,
  created_at desc
);

create index if not exists player_import_rows_batch_id_row_number_idx
on public.player_import_rows (
  import_batch_id,
  row_number
);

create index if not exists player_contacts_user_player_idx
on public.player_contacts (
  user_id,
  player_id
);

create index if not exists player_medical_periods_user_player_status_idx
on public.player_medical_periods (
  user_id,
  player_id,
  status,
  start_date
);

create index if not exists squad_training_events_user_id_date_idx
on public.squad_training_events (
  user_id,
  squad_id,
  date desc,
  start_time desc
);

create index if not exists squad_training_events_user_id_status_idx
on public.squad_training_events (
  user_id,
  status
);

create index if not exists squad_training_events_user_id_archived_deleted_idx
on public.squad_training_events (
  user_id,
  archived_at,
  deleted_at
);

create index if not exists training_recurrence_series_user_squad_status_idx
on public.training_recurrence_series (
  user_id,
  squad_id,
  status
);

create index if not exists squad_training_events_recurrence_series_date_idx
on public.squad_training_events (
  recurrence_series_id,
  date,
  recurrence_sequence
);

create index if not exists squad_training_events_linked_session_idx
on public.squad_training_events (
  linked_training_session_id
);

create index if not exists training_session_plan_instances_event_idx
on public.training_session_plan_instances (
  user_id,
  event_id
);

create index if not exists training_session_drill_instances_event_order_idx
on public.training_session_drill_instances (
  user_id,
  event_id,
  order_index
);

create index if not exists squad_attendance_records_event_id_idx
on public.squad_attendance_records (
  event_id
);

create index if not exists squad_attendance_records_player_id_idx
on public.squad_attendance_records (
  player_id
);

create index if not exists squad_attendance_records_user_id_idx
on public.squad_attendance_records (
  user_id
);

create index if not exists player_coach_assessments_user_player_date_idx
on public.player_coach_assessments (
  user_id,
  player_id,
  assessment_date desc,
  created_at desc
);

create index if not exists player_development_goals_user_player_status_idx
on public.player_development_goals (
  user_id,
  player_id,
  status,
  review_date
);

create index if not exists player_development_goals_user_review_idx
on public.player_development_goals (
  user_id,
  status,
  review_date
);

create index if not exists player_goal_actions_user_goal_idx
on public.player_goal_actions (
  user_id,
  goal_id
);

create index if not exists player_observations_user_player_date_idx
on public.player_observations (
  user_id,
  player_id,
  observation_date desc
);

create index if not exists player_observations_user_event_idx
on public.player_observations (
  user_id,
  event_id
);

create index if not exists coach_workspace_views_user_order_idx
on public.coach_workspace_views (
  user_id,
  kind,
  display_order,
  created_at
);

create unique index if not exists coach_workspace_views_user_system_unique_idx
on public.coach_workspace_views (
  user_id,
  system_view_id
)
where kind = 'system';

create unique index if not exists coach_workspace_views_user_saved_name_unique_idx
on public.coach_workspace_views (
  user_id,
  lower(name)
)
where kind = 'saved';

create unique index if not exists coach_workspace_views_user_default_unique_idx
on public.coach_workspace_views (
  user_id
)
where is_default;

create unique index if not exists coach_attention_states_user_key_unique_idx
on public.coach_attention_states (
  user_id,
  attention_key
);

create index if not exists coach_attention_states_user_player_idx
on public.coach_attention_states (
  user_id,
  player_id
);

create index if not exists coach_attention_states_user_snoozed_idx
on public.coach_attention_states (
  user_id,
  snoozed_until
);


-- =========================================================
-- 17. UPDATED_AT TRIGGERS
-- =========================================================

drop trigger if exists set_profiles_updated_at
on public.profiles;

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();


drop trigger if exists set_drills_updated_at
on public.drills;

create trigger set_drills_updated_at
before update on public.drills
for each row
execute function public.set_updated_at();


drop trigger if exists set_drill_graphics_updated_at
on public.drill_graphics;

create trigger set_drill_graphics_updated_at
before update on public.drill_graphics
for each row
execute function public.set_updated_at();


drop trigger if exists set_drill_graphic_templates_updated_at
on public.drill_graphic_templates;

create trigger set_drill_graphic_templates_updated_at
before update on public.drill_graphic_templates
for each row
execute function public.set_updated_at();


drop trigger if exists set_materials_updated_at
on public.materials;

create trigger set_materials_updated_at
before update on public.materials
for each row
execute function public.set_updated_at();


drop trigger if exists set_training_sessions_updated_at
on public.training_sessions;

create trigger set_training_sessions_updated_at
before update on public.training_sessions
for each row
execute function public.set_updated_at();


drop trigger if exists set_training_session_drills_updated_at
on public.training_session_drills;

create trigger set_training_session_drills_updated_at
before update on public.training_session_drills
for each row
execute function public.set_updated_at();

drop trigger if exists set_squads_updated_at
on public.squads;

create trigger set_squads_updated_at
before update on public.squads
for each row
execute function public.set_updated_at();

drop trigger if exists set_regional_calendar_events_updated_at
on public.regional_calendar_events;

create trigger set_regional_calendar_events_updated_at
before update on public.regional_calendar_events
for each row
execute function public.set_updated_at();

drop trigger if exists set_team_calendar_exclusions_updated_at
on public.team_calendar_exclusions;

create trigger set_team_calendar_exclusions_updated_at
before update on public.team_calendar_exclusions
for each row
execute function public.set_updated_at();

drop trigger if exists set_squad_players_updated_at
on public.squad_players;

create trigger set_squad_players_updated_at
before update on public.squad_players
for each row
execute function public.set_updated_at();


drop trigger if exists set_squad_training_events_updated_at
on public.squad_training_events;

create trigger set_squad_training_events_updated_at
before update on public.squad_training_events
for each row
execute function public.set_updated_at();

drop trigger if exists set_training_recurrence_series_updated_at
on public.training_recurrence_series;

create trigger set_training_recurrence_series_updated_at
before update on public.training_recurrence_series
for each row
execute function public.set_updated_at();

drop trigger if exists set_training_session_plan_instances_updated_at
on public.training_session_plan_instances;

create trigger set_training_session_plan_instances_updated_at
before update on public.training_session_plan_instances
for each row
execute function public.set_updated_at();

drop trigger if exists set_training_session_drill_instances_updated_at
on public.training_session_drill_instances;

create trigger set_training_session_drill_instances_updated_at
before update on public.training_session_drill_instances
for each row
execute function public.set_updated_at();

drop trigger if exists set_squad_attendance_records_updated_at
on public.squad_attendance_records;

create trigger set_squad_attendance_records_updated_at
before update on public.squad_attendance_records
for each row
execute function public.set_updated_at();

drop trigger if exists set_player_contacts_updated_at
on public.player_contacts;

create trigger set_player_contacts_updated_at
before update on public.player_contacts
for each row
execute function public.set_updated_at();

drop trigger if exists set_player_medical_periods_updated_at
on public.player_medical_periods;

create trigger set_player_medical_periods_updated_at
before update on public.player_medical_periods
for each row
execute function public.set_updated_at();

drop trigger if exists set_player_header_preferences_updated_at
on public.player_header_preferences;

create trigger set_player_header_preferences_updated_at
before update on public.player_header_preferences
for each row
execute function public.set_updated_at();

drop trigger if exists set_player_coach_assessments_updated_at
on public.player_coach_assessments;

create trigger set_player_coach_assessments_updated_at
before update on public.player_coach_assessments
for each row
execute function public.set_updated_at();

drop trigger if exists set_player_development_goals_updated_at
on public.player_development_goals;

create trigger set_player_development_goals_updated_at
before update on public.player_development_goals
for each row
execute function public.set_updated_at();

drop trigger if exists set_player_goal_actions_updated_at
on public.player_goal_actions;

create trigger set_player_goal_actions_updated_at
before update on public.player_goal_actions
for each row
execute function public.set_updated_at();

drop trigger if exists set_player_observations_updated_at
on public.player_observations;

create trigger set_player_observations_updated_at
before update on public.player_observations
for each row
execute function public.set_updated_at();

drop trigger if exists set_coach_workspace_views_updated_at
on public.coach_workspace_views;

create trigger set_coach_workspace_views_updated_at
before update on public.coach_workspace_views
for each row
execute function public.set_updated_at();

drop trigger if exists set_coach_attention_preferences_updated_at
on public.coach_attention_preferences;

create trigger set_coach_attention_preferences_updated_at
before update on public.coach_attention_preferences
for each row
execute function public.set_updated_at();

drop trigger if exists set_coach_attention_states_updated_at
on public.coach_attention_states;

create trigger set_coach_attention_states_updated_at
before update on public.coach_attention_states
for each row
execute function public.set_updated_at();


-- Auth profile trigger

drop trigger if exists on_auth_user_created
on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();


-- =========================================================
-- 18. ENABLE ROW LEVEL SECURITY
-- =========================================================

alter table public.profiles
enable row level security;

alter table public.drills
enable row level security;

alter table public.drill_graphics
enable row level security;

alter table public.drill_graphic_templates
enable row level security;

alter table public.materials
enable row level security;

alter table public.training_sessions
enable row level security;

alter table public.training_session_drills
enable row level security;

alter table public.tags
enable row level security;

alter table public.squads
enable row level security;

alter table public.regional_calendar_events
enable row level security;

alter table public.team_calendar_exclusions
enable row level security;

alter table public.recurrence_series_exclusions
enable row level security;

alter table public.squad_players
enable row level security;

alter table public.player_import_batches
enable row level security;

alter table public.player_import_rows
enable row level security;

alter table public.squad_training_events
enable row level security;

alter table public.training_session_plan_instances
enable row level security;

alter table public.training_session_drill_instances
enable row level security;

alter table public.squad_attendance_records
enable row level security;

alter table public.player_contacts
enable row level security;

alter table public.player_medical_periods
enable row level security;

alter table public.player_header_preferences
enable row level security;

alter table public.player_coach_assessments
enable row level security;

alter table public.player_development_goals
enable row level security;

alter table public.player_goal_actions
enable row level security;

alter table public.player_observations
enable row level security;

alter table public.coach_workspace_views
enable row level security;

alter table public.coach_attention_preferences
enable row level security;

alter table public.coach_attention_states
enable row level security;


-- =========================================================
-- 19. RLS POLICIES
-- =========================================================


-- PROFILES

drop policy if exists "profiles are owned by the user"
on public.profiles;

create policy "profiles are owned by the user"
on public.profiles
for all
using (
  auth.uid() = id
)
with check (
  auth.uid() = id
);


-- DRILLS

drop policy if exists "drills are owned by the user"
on public.drills;

create policy "drills are owned by the user"
on public.drills
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);


-- DRILL GRAPHICS

drop policy if exists "drill graphics are owned by the user"
on public.drill_graphics;

create policy "drill graphics are owned by the user"
on public.drill_graphics
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.drills
    where drills.id = drill_graphics.drill_id
    and drills.user_id = auth.uid()
  )
);


-- DRILL GRAPHIC TEMPLATES

drop policy if exists "drill graphic templates are owned by the user"
on public.drill_graphic_templates;

create policy "drill graphic templates are owned by the user"
on public.drill_graphic_templates
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);


-- MATERIALS

drop policy if exists "materials are owned by the user"
on public.materials;

create policy "materials are owned by the user"
on public.materials
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
  and (
    drill_id is null
    or exists (
      select 1
      from public.drills
      where drills.id = materials.drill_id
      and drills.user_id = auth.uid()
    )
  )
);


-- TRAINING SESSIONS

drop policy if exists "training sessions are owned by the user"
on public.training_sessions;

create policy "training sessions are owned by the user"
on public.training_sessions
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);


-- TRAINING SESSION DRILLS

drop policy if exists "session drills are owned by the user"
on public.training_session_drills;

create policy "session drills are owned by the user"
on public.training_session_drills
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id

  and exists (
    select 1
    from public.training_sessions
    where training_sessions.id =
      training_session_drills.session_id
    and training_sessions.user_id = auth.uid()
  )

  and exists (
    select 1
    from public.drills
    where drills.id =
      training_session_drills.drill_id
    and drills.user_id = auth.uid()
  )
);


-- TAGS

drop policy if exists "tags are owned by the user"
on public.tags;

create policy "tags are owned by the user"
on public.tags
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);


-- SQUADS

drop policy if exists "squads are owned by the user"
on public.squads;

create policy "squads are owned by the user"
on public.squads
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);

drop policy if exists "regional calendar events are readable by authenticated users"
on public.regional_calendar_events;

create policy "regional calendar events are readable by authenticated users"
on public.regional_calendar_events
for select
using (
  auth.uid() is not null
);

drop policy if exists "team calendar exclusions are owned by the user"
on public.team_calendar_exclusions;

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

drop policy if exists "recurrence exclusions are owned by the user"
on public.recurrence_series_exclusions;

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


-- SQUAD PLAYERS

drop policy if exists "squad players are owned by the user"
on public.squad_players;

create policy "squad players are owned by the user"
on public.squad_players
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
  and (
    squad_id is null
    or exists (
      select 1
      from public.squads
      where squads.id = squad_players.squad_id
      and squads.user_id = auth.uid()
    )
  )
);


-- PLAYER IMPORT BATCHES

drop policy if exists "player import batches are owned by the user"
on public.player_import_batches;

create policy "player import batches are owned by the user"
on public.player_import_batches
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);

drop policy if exists "player import rows belong to owned batches"
on public.player_import_rows;

create policy "player import rows belong to owned batches"
on public.player_import_rows
for all
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.player_import_batches
    where player_import_batches.id = player_import_rows.import_batch_id
    and player_import_batches.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.player_import_batches
    where player_import_batches.id = player_import_rows.import_batch_id
    and player_import_batches.user_id = auth.uid()
  )
);


-- TRAINING RECURRENCE SERIES

drop policy if exists "training recurrence series are owned by the user"
on public.training_recurrence_series;

create policy "training recurrence series are owned by the user"
on public.training_recurrence_series
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squads
    where squads.id = training_recurrence_series.squad_id
    and squads.user_id = auth.uid()
  )
);


-- SQUAD TRAINING EVENTS

drop policy if exists "squad training events are owned by the user"
on public.squad_training_events;

create policy "squad training events are owned by the user"
on public.squad_training_events
for all
using (
  auth.uid() = user_id
)
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
      where training_sessions.id =
        squad_training_events.linked_training_session_id
      and training_sessions.user_id = auth.uid()
    )
  )
);


-- SESSION PLAN INSTANCES

drop policy if exists "training session plan instances are owned by the user"
on public.training_session_plan_instances;

create policy "training session plan instances are owned by the user"
on public.training_session_plan_instances
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squad_training_events
    where squad_training_events.id = training_session_plan_instances.event_id
    and squad_training_events.user_id = auth.uid()
  )
  and (
    source_training_session_id is null
    or exists (
      select 1
      from public.training_sessions
      where training_sessions.id = training_session_plan_instances.source_training_session_id
      and training_sessions.user_id = auth.uid()
    )
  )
);


-- SESSION DRILL INSTANCES

drop policy if exists "training session drill instances are owned by the user"
on public.training_session_drill_instances;

create policy "training session drill instances are owned by the user"
on public.training_session_drill_instances
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squad_training_events
    where squad_training_events.id = training_session_drill_instances.event_id
    and squad_training_events.user_id = auth.uid()
  )
  and (
    plan_instance_id is null
    or exists (
      select 1
      from public.training_session_plan_instances
      where training_session_plan_instances.id = training_session_drill_instances.plan_instance_id
      and training_session_plan_instances.user_id = auth.uid()
    )
  )
  and (
    source_drill_id is null
    or exists (
      select 1
      from public.drills
      where drills.id = training_session_drill_instances.source_drill_id
      and drills.user_id = auth.uid()
    )
  )
);


-- ATTENDANCE RECORDS

drop policy if exists "attendance records are owned by the user"
on public.squad_attendance_records;

create policy "attendance records are owned by the user"
on public.squad_attendance_records
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id

  and exists (
    select 1
    from public.squad_training_events
    where squad_training_events.id =
      squad_attendance_records.event_id
    and squad_training_events.user_id = auth.uid()
  )

  and exists (
    select 1
    from public.squad_players
    where squad_players.id =
      squad_attendance_records.player_id
    and squad_players.user_id = auth.uid()
  )
);


-- PLAYER CONTACTS

drop policy if exists "player contacts are owned by the user"
on public.player_contacts;

create policy "player contacts are owned by the user"
on public.player_contacts
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squad_players
    where squad_players.id = player_contacts.player_id
    and squad_players.user_id = auth.uid()
  )
);


-- PLAYER MEDICAL PERIODS

drop policy if exists "player medical periods are owned by the user"
on public.player_medical_periods;

create policy "player medical periods are owned by the user"
on public.player_medical_periods
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squad_players
    where squad_players.id = player_medical_periods.player_id
    and squad_players.user_id = auth.uid()
  )
);


-- PLAYER HEADER PREFERENCES

drop policy if exists "player header preferences are owned by the user"
on public.player_header_preferences;

create policy "player header preferences are owned by the user"
on public.player_header_preferences
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);


-- PLAYER COACH ASSESSMENTS

drop policy if exists "player coach assessments are owned by the user"
on public.player_coach_assessments;

create policy "player coach assessments are owned by the user"
on public.player_coach_assessments
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id

  and exists (
    select 1
    from public.squad_players
    where squad_players.id =
      player_coach_assessments.player_id
    and squad_players.user_id = auth.uid()
  )
);


-- PLAYER DEVELOPMENT GOALS

drop policy if exists "player development goals are owned by the user"
on public.player_development_goals;

create policy "player development goals are owned by the user"
on public.player_development_goals
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squad_players
    where squad_players.id = player_development_goals.player_id
    and squad_players.user_id = auth.uid()
  )
);


-- PLAYER GOAL ACTIONS

drop policy if exists "player goal actions are owned by the user"
on public.player_goal_actions;

create policy "player goal actions are owned by the user"
on public.player_goal_actions
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.player_development_goals
    where player_development_goals.id = player_goal_actions.goal_id
    and player_development_goals.user_id = auth.uid()
  )
);


-- PLAYER OBSERVATIONS

drop policy if exists "player observations are owned by the user"
on public.player_observations;

create policy "player observations are owned by the user"
on public.player_observations
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squad_players
    where squad_players.id = player_observations.player_id
    and squad_players.user_id = auth.uid()
  )
  and (
    goal_id is null
    or exists (
      select 1
      from public.player_development_goals
      where player_development_goals.id = player_observations.goal_id
      and player_development_goals.user_id = auth.uid()
      and player_development_goals.player_id = player_observations.player_id
    )
  )
  and (
    event_id is null
    or exists (
      select 1
      from public.squad_training_events
      where squad_training_events.id = player_observations.event_id
      and squad_training_events.user_id = auth.uid()
    )
  )
);


-- COACH WORKSPACE VIEWS

drop policy if exists "coach workspace views are owned by the user"
on public.coach_workspace_views;

create policy "coach workspace views are owned by the user"
on public.coach_workspace_views
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);


-- COACH ATTENTION PREFERENCES

drop policy if exists "coach attention preferences are owned by the user"
on public.coach_attention_preferences;

create policy "coach attention preferences are owned by the user"
on public.coach_attention_preferences
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);


-- COACH ATTENTION STATES

drop policy if exists "coach attention states are owned by the user"
on public.coach_attention_states;

create policy "coach attention states are owned by the user"
on public.coach_attention_states
for all
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squad_players
    where squad_players.id = coach_attention_states.player_id
    and squad_players.user_id = auth.uid()
  )
);


-- =========================================================
-- END OF COACHBOARD MASTER SCHEMA
-- =========================================================
