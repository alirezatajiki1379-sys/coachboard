alter table public.drills
add column if not exists setup_area jsonb;

alter table public.drills
add column if not exists setup_parameters jsonb not null default '[]'::jsonb;

alter table public.drills
add column if not exists setup_notes text;
