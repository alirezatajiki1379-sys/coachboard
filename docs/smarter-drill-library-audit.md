# CoachBoard Smarter Drill Library Audit

## 1. Existing Drill Architecture Discovered

- `drills` stores coach-global reusable Drill Templates. They are scoped by `user_id`, not by active Team.
- `drill_graphics` stores one saved visual graphic per reusable Drill Template.
- `training_sessions` and `training_session_drills` store reusable Training Plan Templates.
- `squad_training_events` stores actual Team-specific training appointments.
- `training_session_plan_instances` stores a copied plan for one actual Training.
- `training_session_drill_instances` stores the actual Session Drill Instance used in a Training. It keeps `source_drill_id` when the instance came from a reusable Drill Template.
- `training_session_reviews` and `training_session_drill_reviews` store post-training coach feedback and drill effectiveness.

## 2. Usage Source of Truth

Drill usage is derived from `training_session_drill_instances.source_drill_id` joined to real `squad_training_events`.

No manual usage counter is stored or incremented.

## 3. Historical vs Future Usage Definition

Historical usage counts only actual Training Events where:

- `squad_training_events.date <= today`
- `squad_training_events.deleted_at is null`
- `training_session_drill_instances.status <> 'removed'`
- `training_session_drill_instances.source_drill_id` points to the reusable Drill Template

Future scheduled Trainings are not counted as already used.

## 4. Favorite Implementation

Favorites use the existing `drills.is_favorite` field. This is coach-global because Drill Templates are coach-global.

The Drill card favorite action updates optimistically and rolls back if Supabase rejects the update.

## 5. Recently Used Implementation

The Library `Recently used` usage view filters to Drills with historical usage and sorts by latest historical Training date.

## 6. Never Used Implementation

The Library `Never used` usage view filters to Drills with zero historical Session Drill Instances.

Training Plan Template references do not count as usage.

## 7. Usage Count Implementation

Usage count is the number of historical `training_session_drill_instances` linked to the Drill Template by `source_drill_id`.

## 8. Last Used Implementation

Last used is calculated from the newest historical `squad_training_events.date` containing that Drill Template.

`drills.updated_at` is not used for Last used.

## 9. Session Review Effectiveness Integration

Effectiveness uses `training_session_drill_reviews.effectiveness_rating`.

Missing ratings are ignored, not treated as zero.

Average effectiveness is calculated as:

```text
sum(effectiveness_rating) / rated review count
```

## 10. Drill Detail Usage History

Drill detail now shows:

- Times used
- Last used
- Average effectiveness
- Review count
- Feedback status counts
- Usage history newest first
- Training link for each historical use

## 11. Multi-Team Aggregation Behaviour

The Library aggregates historical usage across all Teams owned by the authenticated coach.

Switching active Team does not change the Drill Library usage count.

## 12. Coach Isolation

All usage queries filter by `user_id`. Another coach's drills, Trainings, Teams and reviews are not included.

## 13. Plan Builder Integration

The Session Plan Builder drill picker shows:

- Favorite marker
- Times used
- Last used
- Never used state

Adding a Drill still creates a `training_session_drill_instances` copy. It does not mutate the reusable Drill Template.

## 14. Legacy Session Drill Handling

Only deterministic `source_drill_id` relationships are counted.

Unlinked historical Session Drill Instances are not guessed by title and are not counted.

## 15. Drill Deletion and History Safety

Normal Drill deletion moves templates to Trash. Permanent deletion remains blocked by existing plan-template usage checks and database foreign keys where references still exist.

Historical `training_session_drill_instances.source_drill_id` uses `on delete set null`, so actual Session history is not destroyed by template deletion.

## 16. Performance and Query Strategy

Usage stats are loaded in batched queries for visible Library drills:

1. Session Drill Instances for all visible Drill IDs
2. Matching historical Training Events
3. Matching Drill Reviews
4. Matching Team names

No N+1 query per card is used.

## 17. Indexes and Schema Changes

Added indexes:

- `drills_user_id_favorite_idx`
- `training_session_drill_instances_source_drill_idx`
- `training_session_drill_reviews_instance_rating_idx`

No new usage table or counter column was added.

## 18. Migrations Created

- `supabase/migrations/20260904_drill_usage_insights_indexes.sql`

## 19. Generated Type Changes

No generated database type changes were required because the milestone uses existing columns plus indexes.

## 20. Tests Executed

Run before completion:

- `npm run db:check`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- existing regression scripts where relevant

## 21. Remaining Manual Production Actions

PRODUCTION ACTION REQUIRED

Run this migration in Supabase before relying on the new production usage views:

```sql
-- supabase/migrations/20260904_drill_usage_insights_indexes.sql
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
```

Then deploy the application from `main`.

Primary verification flow:

```text
Create Drill
→ use it in Training Sessions
→ review it after Training
→ Drill Library automatically reflects usage and effectiveness
→ reuse it quickly in a future Session Plan
```
