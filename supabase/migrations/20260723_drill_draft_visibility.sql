alter table public.drills
add column if not exists status text not null default 'published';

alter table public.drills
drop constraint if exists drills_status_check;

alter table public.drills
add constraint drills_status_check
check (status in ('draft', 'published'));

alter table public.training_session_drill_instances
add column if not exists status text not null default 'ready';

alter table public.training_session_drill_instances
drop constraint if exists training_session_drill_instances_status_check;

alter table public.training_session_drill_instances
add constraint training_session_drill_instances_status_check
check (status in ('draft', 'ready', 'removed'));

create index if not exists drills_user_id_status_updated_idx
on public.drills (user_id, status, updated_at desc);

create index if not exists training_session_drill_instances_event_status_idx
on public.training_session_drill_instances (event_id, status, order_index);
