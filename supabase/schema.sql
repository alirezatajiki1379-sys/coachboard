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

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


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

create table if not exists public.squad_players (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  first_name text not null,
  last_name text,

  date_of_birth date,
  position text,
  strong_foot text,
  club text,

  parent_phone text,
  player_phone text,
  parent_email text,

  hobbies text,
  development_goal text,
  work_on text,
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
add column if not exists converted_at timestamptz;

alter table public.squad_players
alter column last_name drop not null;


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


-- =========================================================
-- 12. ACTUAL SQUAD TRAINING EVENTS
-- Reale Trainingstermine für Anwesenheit und Bewertung
-- =========================================================

create table if not exists public.squad_training_events (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  date date not null,
  start_time time not null,
  end_time time,

  label text,

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

  final_status text
    check (
      final_status is null
      or final_status in (
        'present',
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
add column if not exists planned_reason text;

update public.squad_attendance_records
set planned_reason = planned_status,
    planned_status = 'unavailable'
where planned_status in ('V', 'K', 'E', 'P', 'S', 'Z', 'U');

alter table public.squad_attendance_records
drop constraint if exists squad_attendance_records_planned_status_check;

alter table public.squad_attendance_records
drop constraint if exists squad_attendance_records_planned_reason_check;

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


-- =========================================================
-- 14. INDEXES
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
  player_type,
  archived_at
);

create index if not exists squad_training_events_user_id_date_idx
on public.squad_training_events (
  user_id,
  date desc,
  start_time desc
);

create index if not exists squad_training_events_user_id_status_idx
on public.squad_training_events (
  user_id,
  status
);

create index if not exists squad_training_events_linked_session_idx
on public.squad_training_events (
  linked_training_session_id
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


-- =========================================================
-- 15. UPDATED_AT TRIGGERS
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


drop trigger if exists set_squad_attendance_records_updated_at
on public.squad_attendance_records;

create trigger set_squad_attendance_records_updated_at
before update on public.squad_attendance_records
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
-- 16. ENABLE ROW LEVEL SECURITY
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

alter table public.squad_players
enable row level security;

alter table public.squad_training_events
enable row level security;

alter table public.squad_attendance_records
enable row level security;


-- =========================================================
-- 17. RLS POLICIES
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


-- =========================================================
-- END OF COACHBOARD MASTER SCHEMA
-- =========================================================
