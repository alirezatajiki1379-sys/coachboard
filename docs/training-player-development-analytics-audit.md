# CoachBoard Training & Player Development Analytics Audit

## Scope

The analytics implementation remains inside `Squad -> Analytics` at `/squad/analysis`. No new global Analytics navigation area was added.

The page now separates analytics into:

- Overview
- Training
- Attendance
- Development
- Drill Usage
- Players

## Data Scope

Analytics are scoped to:

- the authenticated coach
- the active squad/team
- the selected period
- historical training events only

Future training events are excluded from the period calculations.

## Period Logic

The default period is `Last 10 trainings`.

Supported periods:

- Last 5 trainings
- Last 10 trainings
- Last 30 days
- Last 90 days
- This season
- All time
- Custom range

Season calculations use `profiles.season_start_month` and `profiles.season_start_day`, with a fallback of July 1.

## Attendance Semantics

Attendance uses actual/final attendance status.

- Present and Late count as attended.
- Absence statuses count as not attended.
- Not expected is tracked separately.
- Not recorded is tracked separately.
- Not expected and not recorded are excluded from attendance-rate denominator.

Player analytics continue to avoid treating missing attendance or missing ratings as zero.

## Training Review Coverage

Training review coverage is calculated from reviewed training events inside the selected period:

- reviewed sessions / eligible historical sessions

Average session quality and intensity use only reviewed sessions.

## Development Analytics

Development analytics use active-team goals and progress updates.

Active goals are:

- identified
- in_progress

Progress distribution uses the latest progress update per active goal. Goals without a progress update are shown as `No progress update`, not as bad progress.

Achieved goals are counted by `achieved_at` inside the selected period.

## Drill Usage Analytics

Squad Analytics drill usage is active-team and selected-period scoped.

It uses historical:

- `training_session_drill_instances`
- `training_session_drill_reviews`

Drill Library usage remains coach-global, as designed.

## Query Notes

The analytics query layer avoids N+1 reads. It loads:

- active squad players
- attendance records
- training events
- session reviews
- drill instances for period events
- drill reviews for period session reviews
- development goals
- development progress updates

All reads are still user-scoped and rely on existing RLS.

## Known Limitations

- Drill usage groups unlinked/custom drill instances by their instance ID because there is no source drill ID.
- Training duration analytics require `end_time`; events without an end time are excluded from duration averages.
- Development period analytics for Last 5/Last 10 use the date range covered by those selected training events.

## Validation

Run before production deployment:

```bash
npm run db:check
npm run typecheck
npm run lint
npm run build
```

## PRODUCTION ACTION REQUIRED

No new SQL migration is required for this analytics pass if production already has the current `supabase/schema.sql` applied, including:

- `squad_training_events.squad_id`
- `squad_attendance_records`
- `training_session_reviews`
- `training_session_drill_instances`
- `training_session_drill_reviews`
- `player_development_goals.squad_id`
- `player_development_progress`
- `profiles.season_start_month`
- `profiles.season_start_day`

If any of those tables or columns are missing in production, apply the current Supabase schema/migrations before deploying this analytics update.
