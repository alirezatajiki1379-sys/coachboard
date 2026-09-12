# CoachBoard Player Availability & Absence Audit

## 1. Existing Medical Architecture Discovered

CoachBoard already stores injury and sickness in `player_medical_periods` with:

- `type`: `injured | sick`
- `start_date`
- `end_date`
- `expected_return_date`
- `actual_return_date`
- `description`
- `notes`
- `status`

Medical records remain the place for injury/sickness details.

## 2. Existing Training Absence-Reason Architecture

Training participant snapshots use `squad_attendance_records`:

- `planned_status`: `expected | unavailable | unclear`
- `planned_reason`
- `planned_reason_note`
- `planned_status_source`
- `final_status`

Actual attendance remains separate from planned availability.

## 3. Player Availability Model Implemented

Added `player_availability_periods` for non-medical absences:

- `school`
- `work`
- `holiday`
- `private`
- `other`

Medical absence reasons continue to use `player_medical_periods`.

## 4. Medical vs Non-Medical Separation

`injured` and `sick` are not duplicated into general availability. The Add absence form routes them into medical periods. School/work/holiday/private/other are stored only in `player_availability_periods`.

## 5. Absence Reasons Implemented

Supported canonical reasons:

- `injured`
- `sick`
- `school`
- `work`
- `holiday`
- `private`
- `other`

The canonical reason is stored, not a translated label.

## 6. Date-Range Behaviour

Absence periods are date based. Start and end dates are inclusive. A blank “Until” is supported by the schema; the quick form defaults blank/non-medical entries to single-day behavior when submitted from Player Profile.

## 7. Current / Upcoming / Past Availability UI

Player Profile medical tab now includes:

- Availability status card
- General absences card
- Current absences
- Upcoming absences
- Past absences
- Add absence form

## 8. Squad Availability Integration

The Coach Workspace availability data now includes current general absences, not only medical periods. Squad unavailable counts include current medical and current general availability.

## 9. Future Training Synchronization

Adding, deleting, or changing medical periods/general absences recalculates future training participant rows for that player.

## 10. Auto-Sync Session Behaviour

Auto-sync training creation uses the shared availability helper. Eligible unavailable players remain in the participant snapshot and are marked:

```text
planned_status = unavailable
planned_reason = canonical reason
planned_status_source = medical | availability
```

## 11. Custom Session Behaviour

Custom sessions do not gain new players automatically. If a player is already part of a future custom session, the availability sync updates their planned status unless that row was manually overridden.

## 12. Manual Override Handling

Rows with `planned_status_source = manual` are skipped by automatic availability synchronization. Coach decisions at session level win.

## 13. Expected / Not Expected Integration

Unavailable players are counted as not expected through existing planned attendance summaries. They are not removed from the event.

## 14. Actual Attendance Separation

Availability sync does not set `final_status`. Present, Late, Absent, ratings and notes remain coach-recorded actual attendance data.

## 15. Player Count / Composition Integration

Existing expected-player and composition logic already uses planned status. Because unavailable players now become `planned_status = unavailable`, expected player, goalkeeper and field-player counts adjust automatically.

## 16. Session Plan Integration

Session plan and planning views that consume expected participants inherit the corrected participant status from `squad_attendance_records`.

## 17. Planning Insights Integration

Planning insights continue using expected participant data. No special-case planning logic was added.

## 18. Historical Integrity

Synchronization only targets future non-completed attendance rows without actual attendance and skips manual rows. Past actual attendance, ratings and reviews are not rewritten.

## 19. Overlapping Absence Handling

Medical periods have priority over general absences. For multiple general absences, the latest applicable period is used deterministically. All records remain visible on the Player Profile.

## 20. Bilingual Implementation

The app still has a broader hardcoded-string backlog reported by `npm run i18n:audit`. This milestone adds English labels in the currently hardcoded Player Hub/Training UI patterns. The canonical values are language-neutral and ready for the existing i18n layer.

## 21. Mobile Implementation

The Player Profile absence form uses responsive stacked grid fields and should fit phone widths consistently with the existing Player Hub forms.

## 22. RLS / Security

`player_availability_periods` has RLS enabled and an ownership policy tied to `user_id`, `squad_players`, and optional `squad_id`.

## 23. Performance / Idempotency

Training sync uses existing participant snapshots and upserts. Future player-level resync updates existing rows, does not create duplicate attendance records, and skips manual rows.

## 24. Database Migrations

Required migration:

- create `player_availability_periods`
- extend `squad_attendance_records.planned_reason` allowed values
- extend `planned_status_source` to include `availability`
- add index, updated-at trigger and RLS policy

## 25. Generated Supabase Type Changes

`types/database.ts` was updated manually to include:

- `player_availability_periods`
- expanded planned reason union
- expanded planned status source union

## 26. Tests Executed

- `npm run typecheck` PASS
- `npm run lint` PASS
- `npm run build` PASS
- `npm run db:check` PASS
- `npm run i18n:check` PASS
- `npm run i18n:audit` PASS with known hardcoded-string backlog
- `npm run test:availability` PASS
- `npm run test:trial-sync` PASS
- `npm run test:recurrence` PASS
- `npm run test:calendar` PASS

## 27. Remaining Limitations

- Recurring weekly player absences are not implemented.
- Partial-day/hourly availability is not implemented.
- Full German UI text still depends on the broader localization backlog.
- Non-medical absence edit is MVP-style via delete/recreate; medical details can still be edited through the existing medical workflow.

## 28. Production Actions

Apply the updated `supabase/schema.sql` to Production before deploying the Vercel build. Existing future sessions do not require a global migration resync; future sync runs when availability is changed and auto-sync list/detail loading recalculates current-squad defaults.

## ABSENCE REASON REGRESSION

| Reason | Result |
| --- | --- |
| Injured | PASS |
| Sick | PASS |
| School | PASS |
| Work | PASS |
| Holiday | PASS |
| Private | PASS |
| Other | PASS |

## TRAINING SYNCHRONIZATION REGRESSION

| Scenario | Result |
| --- | --- |
| Affected future auto-sync Session -> Not expected | PASS |
| Correct reason displayed | PASS |
| Session after absence -> Expected | PASS |
| Past Session unchanged | PASS |
| Custom non-selected Session unchanged | PASS |
| Manual override preserved | PASS |
| Participant count correct | PASS |

## PRODUCTION ACTION REQUIRED

Supabase migrations are required. Apply the `player_availability_periods` table and attendance constraint changes from `supabase/schema.sql`.

Generated types changed in `types/database.ts`.

Existing Player data is preserved. Existing medical data is preserved.

English/German key consistency check passes. Full i18n audit still reports the known hardcoded-string backlog.

Vercel deployment is safe after applying the Supabase migration.
