alter table public.squad_players
add column if not exists deleted_at timestamptz;

create index if not exists squad_players_user_deleted_idx
on public.squad_players (user_id, deleted_at);
