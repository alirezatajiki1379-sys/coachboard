-- CoachBoard Session Review & Coach Reflection
-- Idempotent production migration.

create table if not exists public.training_session_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  squad_id uuid not null references public.squads(id) on delete cascade,
  event_id uuid not null references public.squad_training_events(id) on delete cascade,
  objective_outcome text not null
    check (objective_outcome in ('achieved', 'partly_achieved', 'not_achieved')),
  overall_quality integer not null
    check (overall_quality between 1 and 5),
  intensity integer not null
    check (intensity between 1 and 5),
  worked_well text,
  needs_improvement text,
  next_training_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id)
);

create table if not exists public.training_session_drill_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_review_id uuid not null references public.training_session_reviews(id) on delete cascade,
  session_drill_instance_id uuid not null references public.training_session_drill_instances(id) on delete cascade,
  feedback_status text
    check (
      feedback_status is null
      or feedback_status in ('worked_well', 'needs_adjustment', 'not_effective')
    ),
  effectiveness_rating integer
    check (
      effectiveness_rating is null
      or effectiveness_rating between 1 and 5
    ),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_review_id, session_drill_instance_id)
);

create index if not exists training_session_reviews_user_event_idx
on public.training_session_reviews (user_id, event_id);

create index if not exists training_session_reviews_squad_updated_idx
on public.training_session_reviews (squad_id, updated_at desc);

create index if not exists training_session_drill_reviews_review_idx
on public.training_session_drill_reviews (session_review_id);

create index if not exists training_session_drill_reviews_instance_idx
on public.training_session_drill_reviews (session_drill_instance_id);

drop trigger if exists set_training_session_reviews_updated_at
on public.training_session_reviews;

create trigger set_training_session_reviews_updated_at
before update on public.training_session_reviews
for each row
execute function public.set_updated_at();

drop trigger if exists set_training_session_drill_reviews_updated_at
on public.training_session_drill_reviews;

create trigger set_training_session_drill_reviews_updated_at
before update on public.training_session_drill_reviews
for each row
execute function public.set_updated_at();

alter table public.training_session_reviews enable row level security;
alter table public.training_session_drill_reviews enable row level security;

drop policy if exists "training session reviews are owned by the user"
on public.training_session_reviews;

create policy "training session reviews are owned by the user"
on public.training_session_reviews
for all
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squad_training_events
    where squad_training_events.id = training_session_reviews.event_id
    and squad_training_events.user_id = auth.uid()
    and squad_training_events.squad_id = training_session_reviews.squad_id
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.squad_training_events
    where squad_training_events.id = training_session_reviews.event_id
    and squad_training_events.user_id = auth.uid()
    and squad_training_events.squad_id = training_session_reviews.squad_id
  )
);

drop policy if exists "training session drill reviews are owned by the user"
on public.training_session_drill_reviews;

create policy "training session drill reviews are owned by the user"
on public.training_session_drill_reviews
for all
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.training_session_reviews
    join public.training_session_drill_instances
      on training_session_drill_instances.id = training_session_drill_reviews.session_drill_instance_id
    where training_session_reviews.id = training_session_drill_reviews.session_review_id
    and training_session_reviews.user_id = auth.uid()
    and training_session_drill_instances.user_id = auth.uid()
    and training_session_drill_instances.event_id = training_session_reviews.event_id
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.training_session_reviews
    join public.training_session_drill_instances
      on training_session_drill_instances.id = training_session_drill_reviews.session_drill_instance_id
    where training_session_reviews.id = training_session_drill_reviews.session_review_id
    and training_session_reviews.user_id = auth.uid()
    and training_session_drill_instances.user_id = auth.uid()
    and training_session_drill_instances.event_id = training_session_reviews.event_id
  )
);
