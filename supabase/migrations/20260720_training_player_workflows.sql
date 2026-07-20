alter table public.squad_players
add column if not exists trial_duration_mode text,
add column if not exists trial_training_limit integer,
add column if not exists trial_end_date date;

alter table public.squad_players
drop constraint if exists squad_players_trial_duration_mode_check;

alter table public.squad_players
add constraint squad_players_trial_duration_mode_check
check (
  trial_duration_mode is null
  or trial_duration_mode in ('training_count', 'end_date')
);

create index if not exists squad_players_user_id_trial_period_idx
on public.squad_players (
  user_id,
  player_type,
  trial_start_date,
  trial_end_date
)
where player_type = 'trial';
