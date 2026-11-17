begin;

-- Apply before deploying Scouting 2.0 Phase 1. Existing records stay unchanged.
-- No new tables, data backfill, RLS changes or changes to the squad lifecycle.
alter table public.scouting_players
  add column if not exists shirt_number text,
  add column if not exists birth_year integer check (birth_year between 1900 and 2100);

alter table public.scouting_observations
  add column if not exists player_team text,
  add column if not exists opponent text,
  add column if not exists competition text,
  add column if not exists situations text,
  add column if not exists open_questions text,
  add column if not exists next_focus text,
  add column if not exists recommendation text check (
    recommendation in ('archived', 'monitoring', 'shortlist', 'trial', 'identified')
  ),
  add column if not exists follow_up_date date;

-- Recommendation is the scout's assessment on this observation, never a
-- computed score or an automatic rewrite of the current player pipeline.
commit;
