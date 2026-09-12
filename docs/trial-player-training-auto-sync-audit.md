# CoachBoard Trial Player Training Auto-Sync Audit

## 1. Root Cause

Future training participant synchronization still used roster-only queries in several paths. `participant_source_mode = current_squad_sync` was intended to represent the current eligible Squad, but the implementation filtered `squad_players.player_type = roster`, so active trial players were excluded from:

- creating one-off training events;
- creating recurring training events;
- editing future recurring events;
- explicit “sync with current Squad” actions;
- automatic list/detail page sync for eligible future events;
- the Training Event form’s “Entire squad” participant preview.

## 2. Architecture Preserved

No frontend workaround was added. The existing participant-source architecture remains:

- `current_squad_sync`: recomputes eligible active Squad participants from the event date.
- `custom_selection`: keeps the fixed manually selected participant list.
- `squad_attendance_records`: remain the event-specific participant snapshots.

## 3. Eligibility Logic

The new shared helper `currentEligibleSquadPlayerIds` returns:

- all active roster players for the event Squad;
- active trial players for the event Squad when eligible;
- no archived, deleted or converted trial players.

Trial date rules:

- `trial_start_date`: excludes the trial player before the start date.
- `trial_duration_mode = end_date`: includes the trial player until `trial_end_date`.
- `trial_duration_mode = training_count`: includes the trial player only for the first configured number of current-squad-sync training events from the trial start.
- missing trial limits fall back to “active after start date” unless `trial_end_date` excludes the date.

## 4. Sync Triggers

Future eligible auto-sync trainings are updated after:

- creating a trial player;
- editing a trial player’s trial settings;
- archiving/restoring/trashing players;
- converting a trial player to a permanent roster player.

Only these events are touched:

- `participant_source_mode = current_squad_sync`;
- future events from today onward;
- `participants_locked_at is null`;
- `deleted_at is null`;
- `status in draft, prepared`;
- same `squad_id` as the changed player.

Past, locked, started/in-progress, completed, deleted, and custom-selection trainings are not automatically changed.

## 5. Manual Override Protection

Removal still respects existing participant safety checks. A player snapshot is not removed when it has meaningful data, including:

- manual planned status;
- unavailable/unclear status;
- planned reason or note;
- final attendance;
- ratings;
- coach note;
- group assignment.

This protects coach edits and historical event data.

## 6. Duplicate Protection

Attendance snapshots still use `upsert(..., { onConflict: "event_id,player_id" })`, so rerunning sync is idempotent and does not create duplicate participant rows.

## 7. UI Behavior

The Training Event form now describes “Entire squad” as all eligible Squad Players, including eligible trial players. The preview list includes active trial players instead of roster-only players. The server remains the source of truth for date-specific trial eligibility.

## 8. Regression Test

Added `npm run test:trial-sync`, covering:

- active roster plus eligible trial players;
- trial start and end dates;
- training-count trial limits;
- converted/deleted trial players excluded;
- team/squad scoping.

## 9. Schema / Migration

No Supabase schema migration is required. The implementation uses existing fields:

- `squad_players.player_type`;
- `squad_players.converted_at`;
- `squad_players.trial_start_date`;
- `squad_players.trial_duration_mode`;
- `squad_players.trial_training_limit`;
- `squad_players.trial_end_date`;
- `squad_training_events.participant_source_mode`;
- `squad_training_events.participants_locked_at`;
- `squad_attendance_records`.

## 10. Production Action Required

No SQL migration is required for this fix.

After deployment, verify in Production:

1. Create a future auto-sync training.
2. Create a trial player whose trial dates include that training.
3. Open the training detail/check-in page and confirm the trial player appears.
4. Set the trial player outside the trial window and confirm future eligible auto-sync trainings update.
5. Confirm custom-selection trainings do not change.
6. Confirm locked or started trainings do not change.

## 11. Remaining Limitations

Training-count eligibility is based on current-squad-sync training events in the same Squad from the trial start through the target event date. It does not count custom-selection trainings, because those are intentionally fixed snapshots rather than current Squad sync sessions.
