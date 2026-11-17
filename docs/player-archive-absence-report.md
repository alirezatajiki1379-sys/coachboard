# Player Archive and Attendance Selection Reasons

## Implementation

- Isolated worktree: `/private/tmp/coachboard-player-archive-absence`.
- Branch: `fix/player-archive-absence`, originally based on `c38c434`, integrated
  with the subsequently published trial-promotion commit `c761a86` for release.
- Production migration success was confirmed by the coach before release.
  No Production SQL was executed by the agent; direct database verification and
  authenticated Production UI access were unavailable in this environment.
- The primary working directory and its unrelated unfinished changes were not edited.

### Archive

The archive query and `squad_players.archived_at` already existed. However, the
archive action redirected to `view=archived` while the current Squad workspace
uses `players=archived`. Its existing archive filter was also hidden inside the
Filters menu. The new visible Active/Archived links use the canonical parameter;
old archive URLs remain supported.

Open Squad, choose Archived players, open a profile, and choose Reactivate.
Alternatively use Select and Reactivate for selected archived players.
Reactivation sets `archived_at` to null on the same owned record, without creating
a player or deleting related history. Failed or unmatched single-player writes
are no longer silently treated as successful. Trashed players still use the
separate Trash restore workflow.

Existing active-player queries exclude archived/deleted players. Existing future
automatic participant synchronization is reused. Historical attendance and
manually controlled/locked participant snapshots are not rewritten.

### Reasons and Metrics

`club` and `not_nominated` extend the existing `planned_reason` and
`actual_absence_reason` fields of `squad_attendance_records`. There are no new
columns, tables or parallel absence models. Domain and database Row/Insert types
were updated; `SquadAttendanceReason` and `SquadActualAbsenceReason` include both
canonical values. Existing reasons and optional note fields remain available.

English: Club activity / Not nominated.
German: Verein / Vereinsmassnahme / Nicht nominiert (UI uses the proper German spelling).

Non-nomination is not an ordinary missed attendance opportunity. The shared
predicate excludes it from attendance and participation rate denominators,
expected-absence counts, ordinary absence distributions, and missed-training
report lists. It has no reliability penalty. The underlying participant record
and recorded-data coverage remain intact.

Actual Present, Late or Left early still count as participation. An explicit
actual absence reason overrides the planned reason. A planned non-nomination is
used for exclusion only when the player is planned unavailable and has no more
specific actual outcome. Legacy actual reason/status handling is preserved.

## Database Prerequisite

Apply this file in Production Supabase BEFORE deploying dependent application code:

`supabase/migrations/20261117_attendance_selection_reasons.sql`

It transactionally expands the two existing CHECK constraints. All previous
values and NULL remain allowed. No historical rows, final statuses, policies or
ownership rules are modified. `supabase/schema.sql` mirrors these constraints.
Do not rerun schema.sql as a substitute for the migration.

PENDING PRODUCTION MIGRATIONS FOR THIS CHANGE: None according to the coach's
explicit confirmation that `20261117_attendance_selection_reasons.sql` succeeded.
Acceptance of the new values was verified locally, not independently on Production.

## Validation

PASS:

- `npm run typecheck`
- `npm run lint`
- `npm run i18n:check`
- `npm run db:check`
- `npm run build`
- `node --experimental-strip-types --experimental-loader ./scripts/ts-alias-loader.mjs scripts/player-archive-absence-regression.mjs` (20 tests including core regression tests)
- `npm run test:analytics`
- `npm run test:analytics-2`
- `npm run test:analytics-3`
- `npm run test:workspace-participation`
- `npm run test:actual-attendance`
- `npm run test:attendance-reasons`
- `npm run test:rating-defaults`
- `npm run test:reliability`
- `npm run test:late-cancellation`
- `npm run test:player-report`
- `npm run test:trial-sync`
- `npm run test:availability`
- `COACHBOARD_QA_DEPS=/private/tmp/coachboard-archive-qa npm run test:check-in-2`
- `COACHBOARD_QA_DEPS=/private/tmp/coachboard-archive-qa node scripts/player-archive-browser.mjs`
- `git diff --check`

Chrome component fixtures tested the actual Squad workspace, profile actions and
Check-in controls in EN/DE at 320, 768 and 1440 pixels. This includes archive links,
profile opening, single/bulk reactivation, new reason options, save callbacks and
rating removal on absence. Screenshots were inspected. A German mobile summary
value overflow was fixed with `min-w-0` and word wrapping.

Browser writes are mocked, and server actions were tested with an in-memory query
adapter. No signed-in end-to-end Production write was performed.

The SQL was executed twice against an isolated PGlite PostgreSQL database with
representative existing rows: old/new reasons and NULL accepted, invalid reasons
rejected, legacy S and historical rows unchanged, RLS flag and policy unchanged.
This is not a live Production schema audit. The local harness is
`/private/tmp/coachboard-archive-qa/check-migration.mjs`.

Non-blocking existing warnings: outdated Browserslist dataset and Node's
experimental loader/module-type notices. No dependency metadata was changed.

## Changed Files

- `components/squad/attendance-controls.tsx`
- `components/squad/coach-workspace.tsx`
- `components/squad/player-actions.tsx`
- `lib/i18n/workflow-copy-de.ts`
- `lib/squad/actions.ts`
- `lib/squad/analytics-queries.ts`
- `lib/squad/analytics.ts`
- `lib/squad/attendance-actions.ts`
- `lib/squad/attendance-format.ts`
- `lib/squad/attendance-utils.ts`
- `lib/squad/player-report.ts`
- `lib/squad/workspace.ts`
- `messages/de.json`
- `messages/en.json`
- `types/database.ts`
- `types/domain.ts`
- `supabase/schema.sql`
- `supabase/migrations/20261117_attendance_selection_reasons.sql`
- `scripts/analytics-2-regression.mjs`
- `scripts/check-in-2-regression.mjs`
- `scripts/core-stability-regression.mjs`
- `scripts/player-archive-absence-regression.mjs`
- `scripts/player-archive-browser.mjs`
- `docs/player-archive-absence-report.md`

## Manual Acceptance Check After Migration and Deployment

1. Archive a test player. Confirm Archived players opens and active selections exclude that player.
2. Open the archived profile, verify notes/history, then Reactivate. Confirm the player ID and history remain unchanged.
3. Repeat using bulk selection in Archived players.
4. In Training preparation, choose Not expected and Not nominated. Use Apply as expected or save an actual Absent outcome.
5. Confirm Not nominated in Check-in and verify that this record does not reduce player/team attendance rates or add a reliability penalty.
6. Override to Present/Late and verify participation counts. Override to another actual reason and verify the explicit actual outcome wins.
7. Select Other, enter an optional note, save and reopen. Repeat for Club activity.
8. Repeat key steps in German and English on phone and desktop.

## GitHub Update Commands

ONLY AFTER successful Production migration confirmation. These commands run in
the isolated worktree and stage only files from this task, not primary-worktree
Staff Brief/Development work. Do not force push if main has advanced.

```bash
cd /private/tmp/coachboard-player-archive-absence
git add -- components/squad/attendance-controls.tsx components/squad/coach-workspace.tsx components/squad/player-actions.tsx
git add -- lib/i18n/workflow-copy-de.ts lib/squad/actions.ts lib/squad/analytics-queries.ts lib/squad/analytics.ts lib/squad/attendance-actions.ts lib/squad/attendance-format.ts lib/squad/attendance-utils.ts lib/squad/player-report.ts lib/squad/workspace.ts
git add -- messages/de.json messages/en.json types/database.ts types/domain.ts
git add -- supabase/schema.sql supabase/migrations/20261117_attendance_selection_reasons.sql
git add -- scripts/analytics-2-regression.mjs scripts/check-in-2-regression.mjs scripts/core-stability-regression.mjs scripts/player-archive-absence-regression.mjs scripts/player-archive-browser.mjs docs/player-archive-absence-report.md
git diff --cached --stat
git commit -m "Improve player archive and attendance absence reasons"
git push origin HEAD:main
```

After the normal main push, the connected Vercel project should start its
Production deployment. Verify that deployment and the manual checks above.
