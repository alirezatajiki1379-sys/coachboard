-- CoachBoard - Smarter Drill Library usage insight indexes
-- Usage stays derived from training_session_drill_instances and reviews.

create index if not exists drills_user_id_favorite_idx
on public.drills (
  user_id,
  is_favorite
)
where deleted_at is null and archived_at is null;

create index if not exists training_session_drill_instances_source_drill_idx
on public.training_session_drill_instances (
  user_id,
  source_drill_id,
  event_id
)
where source_drill_id is not null and status <> 'removed';

create index if not exists training_session_drill_reviews_instance_rating_idx
on public.training_session_drill_reviews (
  user_id,
  session_drill_instance_id,
  effectiveness_rating
);
