alter table public.squad_players
add column if not exists address_street text,
add column if not exists address_postal_code text,
add column if not exists address_city text,
add column if not exists position_families text[] not null default '{}',
add column if not exists secondary_email text,
add column if not exists distance_km numeric,
add column if not exists exit_date date,
add column if not exists exit_reason text,
add column if not exists scouting_source text,
add column if not exists development_centre text,
add column if not exists last_performance_review_date date;

alter table public.squad_players
alter column height_cm type numeric using height_cm::numeric,
alter column weight_kg type numeric using weight_kg::numeric;

create index if not exists squad_players_user_id_address_city_idx
on public.squad_players (user_id, address_city);

create index if not exists squad_players_user_id_position_families_idx
on public.squad_players using gin (position_families);
