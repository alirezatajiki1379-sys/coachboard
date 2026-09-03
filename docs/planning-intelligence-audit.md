# CoachBoard Planning Intelligence Audit

## 1. Existing Planning Architecture Discovered

The current planning flow is `Training -> Session Plan` at `/trainings/[id]/plan`.

The plan builder uses:

- `squad_training_events` for the actual training appointment
- `squad_attendance_records` for planned participation and later attendance
- `training_session_plan_instances` for the event-specific plan wrapper
- `training_session_drill_instances` for copy-on-use drill instances
- `drills` as coach-owned reusable drill templates
- `training_session_reviews` and `training_session_drill_reviews` for historical review evidence
- `player_development_goals` and `player_development_progress` for development context

## 2. Planning Insights UX Implemented

Planning Insights now appear inside the Session Plan Builder, not as a new global module.

Implemented sections:

- Last Session
- Player Development
- Training Balance
- Suggested Drills
- Session Context summary

The panel is compact, factual and coach-controlled.

## 3. Current Session Context Model

The planning context uses the current training event plus its planned participants.

It derives:

- expected player count
- goalkeeper count
- field player count
- missing-position count
- inferred age context where player birthdates exist
- current structured focus where the event has one

## 4. Previous Session Resolution Logic

The previous session is resolved as:

- same active team/squad
- owned by the authenticated coach
- before the current training date/time
- not archived
- not deleted

Same-day earlier trainings can be selected. Same-day later trainings are excluded.

## 5. Session Review Integration

If the previous training has a session review, Planning Insights can show:

- objective outcome
- overall quality
- intensity
- next-training note

Quality and intensity are not presented as the primary insight.

## 6. "Take Into Next Training" Implementation

`training_session_reviews.next_training_note` is surfaced prominently when present.

It is read-only in this milestone because the current plan builder does not have a separate session-specific planning-note field that can be safely updated without expanding the data model.

## 7. Previous Objective Handling

Previous objective outcome is displayed factually:

- Achieved
- Partly achieved
- Not achieved

CoachBoard does not infer that the coach must repeat or change the objective.

## 8. Drill Feedback Context

Previous-session drill feedback is shown when it contains:

- Needs adjustment
- Not effective

Feedback is limited and expandable to avoid overwhelming the plan builder.

## 9. Player Development Context

Development context uses expected participants only.

Active goals are:

- identified
- in_progress

Paused and achieved goals are excluded from active planning context.

## 10. Canonical Player Deduplication

Expected participants are deduplicated by canonical `player_id`.

This avoids counting one player twice because of duplicate records or historical snapshots.

## 11. Recent Training Balance Logic

Training balance uses the last 6 historical same-team trainings before the current training timestamp.

It shows exact stored focus values only.

## 12. Structured Focus Matching

Current training focus is matched only when the stored event focus exactly equals the drill `main_focus`.

No free-text semantic or keyword matching is performed.

## 13. Suggested Drill Candidate Selection

Suggested drills come from coach-owned reusable drills:

- published only
- not archived
- not deleted
- not already in the current session plan

No external drill source is used.

## 14. Suggested Drill Ranking Rules

The internal deterministic ranking uses:

- age suitability
- player-count fit
- exact structured focus match
- likely phase match
- favorite marker
- historical effectiveness as a light signal
- recent negative feedback as a light reducer

The internal score is never shown to the coach.

## 15. Age / Player-Count Compatibility

Age compatibility uses CoachBoard's existing drill age suitability helper.

Player count is treated conservatively:

- exact stored min/max fit receives a positive reason
- outside range is shown as context
- no multi-group assumption is invented

## 16. Favorite / Effectiveness Usage

Favorite is a modest positive signal.

Historical effectiveness uses real `training_session_drill_reviews.effectiveness_rating`.

Missing reviews are displayed as missing, not as zero.

## 17. Negative Drill Feedback Handling

The latest historical feedback is shown when available.

Needs adjustment and not effective reduce ranking modestly but do not ban the drill.

## 18. Copy-On-Use Preservation

Suggested drill `Add to Plan` uses the existing `addExistingDrillsToSessionPlan` action.

That action creates a `training_session_drill_instances` row and stores a session-specific snapshot. The reusable drill template remains unchanged.

## 19. Team-vs-Global Drill Scope

Suggestion candidates are coach-global drill templates.

Usage context can show overall coach usage and same-team usage where useful.

Team-specific training history remains scoped to the active/current team.

## 20. Query / Performance Architecture

The implementation uses one planning service layer:

- `getPlanningContext`
- previous session lookup
- development lookup
- recent balance lookup
- suggested drill lookup

It avoids player-by-player or drill-by-drill UI queries. Drill usage is loaded in batch through the existing drill usage helper.

## 21. Cache / Revalidation Behaviour

Planning Insights are server-rendered with the Session Plan page.

Existing plan actions revalidate the training plan route, so adding/removing plan drills updates suggestions after navigation/revalidation.

Inline participant changes elsewhere already revalidate their own training routes according to existing behaviour.

## 22. Partial-Error Handling

Each insight category loads through a safe wrapper.

If one category fails, the plan builder still renders and the affected insight shows an unavailable state instead of pretending the data is zero.

## 23. Mobile Implementation

Planning Insights use stacked cards and normal responsive wrapping.

Suggested drill actions remain large enough to tap on mobile.

## 24. RLS / Security Review

All Planning Intelligence reads include authenticated `user_id` filters.

Team-specific queries include the current event `squad_id`.

Reusable drill candidates are coach-owned drills only.

RLS remains the final enforcement layer.

## 25. Migrations / Schema Changes

No new database table was created.

No derived planning-insight table was added.

## 26. Generated Type Changes

No generated Supabase type change was required for this milestone.

The implementation uses the current checked `types/database.ts`.

## 27. Tests Executed And Results

Required validation should include:

```bash
npm run db:check
npm run typecheck
npm run lint
npm run build
npm run test:positions
npm run test:recurrence
npm run test:calendar
npm run test:import-duplicates
```

## 28. Remaining Production Actions

Verify production Supabase has the current CoachBoard schema applied before deployment.

The application deployment may safely happen only after:

- schema check passes locally
- production contains the required review/development/session-plan tables
- Vercel environment variables are present
- build passes

Planning Intelligence completes the loop:

```text
Plan
-> Train
-> Attendance / Ratings / Observations
-> Session Review
-> Player Development
-> Analytics
-> Planning Intelligence
-> better-informed next Plan
```

The feature remains explainable, deterministic and coach-controlled.

## PRODUCTION ACTION REQUIRED

No new Supabase migration is required for this milestone.

It has not been applied to Production by Codex.

Generated types are current if production matches the checked `supabase/schema.sql` and `types/database.ts`.

Vercel deployment may safely happen after the validation commands pass and production Supabase has the required existing schema.
