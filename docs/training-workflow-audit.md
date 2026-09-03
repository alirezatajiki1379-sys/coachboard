# CoachBoard Training Workflow Audit

Date: 2026-09-04

## 1. Current Workflow Discovered

Primary intended route:

Dashboard -> Next Training -> Training Detail -> Plan / Quick Check-in / Ratings -> Dashboard.

Related routes:

- `/trainings`
- `/trainings/[id]`
- `/trainings/[id]/plan`
- `/trainings/[id]/check-in`
- `/trainings/[id]/ratings`
- `/squad/attendance`
- `/squad/attendance/[id]/check-in`
- `/squad/attendance/[id]/ratings`

## 2. Biggest Friction Points

- Training detail showed several similarly weighted header actions.
- `/squad/attendance/[id]` duplicated part of the Training detail page and could split the coach's mental model.
- Planned participation buttons used form redirects, so small Expected / Not expected changes caused a full navigation.
- The Plan Builder did not show enough participant context in the header.

## 3. Clicks Before vs After

- Dashboard -> next Training: before 1 click, after 1 click.
- Training -> Plan: before 1 click but one of several equal actions, after 1 clear primary click when planning is the next step.
- Training -> Quick Check-in: before 1 click, after 1 clear primary click when the Training is today or attendance is incomplete.
- Training -> Ratings: before 1 click, after 1 clear primary click for past Trainings with incomplete review.
- Planned participation change: before 1 click plus full page redirect, after 1 click with optimistic in-place save.

## 4. Dashboard Changes

Dashboard already exposes the next Training with date, time, team, location, expected count, goalkeeper/field split, position-missing count, and plan status.

No new Dashboard module was added.

## 5. Training Detail Changes

Training detail now acts as the operational hub with one contextual primary action:

- Quick Check-in for Training today / in progress.
- Complete Attendance for past Trainings with missing actual statuses.
- Review Session for past Trainings with unrated present players.
- Create Training Plan when no plan exists.
- Open Training Plan when a plan exists.

Secondary actions remain available but no longer compete as the main path.

## 6. Participant-Management Changes

The Training participants table now allows Planned participation changes directly with optimistic buttons.

Planned participation remains separate from actual attendance.

## 7. Plan Builder Changes

The Plan Builder header now keeps Training context visible:

- date and time;
- active Team;
- expected player count;
- goalkeeper count;
- field-player count;
- position-missing count.

It also offers quick return to the Training Hub and Quick Check-in.

## 8. Quick Check-in Changes

The existing one-tap check-in flow was preserved. Back navigation now returns to the Training hub.

## 9. Ratings / Observation Changes

The existing Ratings and Observation flow was preserved. Back navigation now returns to the Training hub, and the Squad Ratings overview links through the `/trainings/[id]/ratings` path.

## 10. Mobile Improvements

The changes keep the existing mobile card/table fallback. The planned participation controls are available in mobile participant cards as well as desktop rows.

## 11. Mutations Without Full Refresh

Changed:

- planned participation quick status changes;
- planned absence reason save.

Already in place before this pass:

- one-tap final attendance status updates.

## 12. Copy-on-Use Verification

Plan editing still uses Training Plan instances and Session Drill instances. No reusable drill or reusable training-plan mutation was added in this pass.

## 13. Team-Scoping Verification

The reviewed Training and participant queries continue to use authenticated `user_id` and active/current `squad_id` where applicable. Shared drill and training-plan templates remain coach-global by design.

## 14. Tests Executed and Results

Run during this pass:

- `npm run db:check`
- `npm run typecheck`
- `npm run test:positions`
- `npm run test:recurrence`
- `npm run test:calendar`
- `npm run test:import-duplicates`
- `npm run lint`
- `npm run build`

See the final task response for the latest result.

## 15. Remaining Recommended Improvements

- Add optimistic inline save for rating fields if the rating page starts to feel slow with many players.
- Consider a compact execution view inside the Plan Builder after the core Training workflow has more real usage feedback.
- Verify the full iPhone workflow with production data after the latest Supabase migrations are applied.
