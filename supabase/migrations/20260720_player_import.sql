-- CoachBoard Milestone 10E: Player import, audit history and intake profile fields.
-- Safe to run more than once.

alter table public.squad_players
add column if not exists original_club text,
add column if not exists club_training_schedule text,
add column if not exists external_player_id text,
add column if not exists trial_start_date date,
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

create index if not exists squad_players_user_id_import_batch_idx
on public.squad_players (user_id, import_batch_id);

create index if not exists squad_players_user_id_external_player_idx
on public.squad_players (user_id, external_player_id)
where external_player_id is not null;

create index if not exists player_import_batches_user_id_created_at_idx
on public.player_import_batches (user_id, created_at desc);

create index if not exists player_import_rows_batch_id_row_number_idx
on public.player_import_rows (import_batch_id, row_number);

alter table public.player_import_batches enable row level security;
alter table public.player_import_rows enable row level security;

drop policy if exists "player import batches are owned by the user"
on public.player_import_batches;

create policy "player import batches are owned by the user"
on public.player_import_batches
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

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
