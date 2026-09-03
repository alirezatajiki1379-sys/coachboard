# CoachBoard Production Supabase Audit

Date: 2026-09-03

Production app: `https://coachboard-ashen.vercel.app`

Scope: repository schema, migrations, generated types, Supabase query usage, RLS assumptions, active-team scoping, team deletion safety, deployment workflow, and automated drift prevention.

## 1. Executive Summary

Schema / query consistency: PASS after repair

Generated Supabase types: PASS after repair

Team isolation: WARNING, repository patterns are active-team scoped in the key operational paths reviewed, but live production Team A / Team B data must still be verified after migrations.

RLS: WARNING, user-owned policies are present in the schema source, but this audit did not connect to the live Supabase project to prove production policy state.

Foreign-key deletion behaviour: WARNING, team deletion is handled by an explicit RPC because several operational tables intentionally restrict direct squad deletion.

Migration deployment workflow: PASS after adding documentation and `npm run db:check`.

## 2. P0 Issues

No unresolved P0 issue was found in the repository during this pass.

The previous Dashboard active-squad count issue is repaired in code by routing Dashboard player totals through active-squad helpers instead of coach-global player counts.

## 3. P1 Issues

Fixed: the app and `supabase/schema.sql` expected `drills.age_mode`, `drills.minimum_age`, and `drills.maximum_age`, but production-compatible migration history did not include a dedicated migration for those fields.

Added migration:

- `supabase/migrations/20260903_drill_age_suitability.sql`

Fixed: production team deletion required an explicit safe database function.

Added migration:

- `supabase/migrations/20260903_team_permanent_delete.sql`

## 4. Schema vs Application Mismatches

`npm run db:check` now scans Supabase table/column references in application code and compares them against `supabase/schema.sql`.

Current result:

- no known missing table or column references after repair.

Known limitation: this lightweight check does not connect to production Supabase. Production still needs migrations applied before deploying schema-dependent code.

## 5. Missing / Stale Migrations

Fixed migration gap:

- Drill age suitability fields now have a dedicated migration.

Existing migration inventory:

- `20260720_player_import.sql`
- `20260720_squad_training_session_architecture.sql`
- `20260720_training_player_workflows.sql`
- `20260720_training_recurrence_series.sql`
- `20260721_regional_calendar_rules.sql`
- `20260721_training_groups_and_direct_drills.sql`
- `20260721_training_series_integrity_repair.sql`
- `20260722_player_import_bulk_actions.sql`
- `20260723_calendar_category_correction.sql`
- `20260723_drill_draft_visibility.sql`
- `20260724_attention_training_targets.sql`
- `20260724_coach_action_states.sql`
- `20260903_drill_age_suitability.sql`
- `20260903_team_permanent_delete.sql`

## 6. Generated Type Status

`types/database.ts` already contained the drill age fields.

Fixed type drift:

- added the `delete_squad_permanently` RPC signature under `Database["public"]["Functions"]`.

Remaining note: the project still uses typed Supabase casts in several server helpers. They appear to be a project-wide compatibility pattern rather than a single stale-type workaround.

## 7. Team Scoping Audit

Operational squad data is modelled under `squads` and team-scoped tables such as `squad_players`, `squad_training_events`, recurrence series, event groups, plan instances, and tactical plans.

Dashboard active-team player counts now use the active squad only.

Coach-global resources remain intentionally global to the coach account:

- drill library entries;
- drill graphics;
- drill graphic templates;
- reusable training session plans in `training_sessions`.

Concrete training events and attendance are team-owned through squad/event relationships.

## 8. RLS Audit

`supabase/schema.sql` enables RLS for user-facing tables and uses `auth.uid()` ownership policies for private coach data.

The external dashboard API uses a service-role client, but it checks `COACHBOARD_API_KEY` and `COACHBOARD_DASHBOARD_OWNER_ID` before returning owner-scoped data. It does not print or return secret values.

Production action: verify policies are applied in the Supabase Dashboard or by reapplying `supabase/schema.sql` / migrations.

## 9. Foreign Key & Cascade Audit

Important relationships:

- `drill_graphics.drill_id -> drills.id on delete cascade`
- `training_session_drills.session_id -> training_sessions.id on delete cascade`
- `training_session_drills.drill_id -> drills.id on delete set null`
- `squad_players.squad_id -> squads.id on delete set null`
- `squad_training_events.squad_id -> squads.id on delete restrict`
- `training_recurrence_series.squad_id -> squads.id on delete restrict`
- `squad_attendance_records.event_id -> squad_training_events.id on delete cascade`
- `squad_attendance_records.player_id -> squad_players.id on delete cascade`
- `training_session_plan_instances.event_id -> squad_training_events.id on delete cascade`
- `training_session_drill_instances.event_id -> squad_training_events.id on delete cascade`
- `team_calendar_exclusions.squad_id -> squads.id on delete cascade`
- `squad_tactical_plans.squad_id -> squads.id on delete cascade`

Because some squad relationships are `restrict` or `set null`, permanent team deletion is intentionally handled by `delete_squad_permanently`.

## 10. Player Ownership Model

Current model: players are team-owned records through `squad_players.squad_id` plus `user_id`.

There is no separate membership table for shared players across teams. If future shared-player membership is added, team deletion and player deletion logic must be revisited before production use.

## 11. Session Participant Integrity

Current event attendance uses canonical `player_id` for current player identity. Historical rows may preserve snapshots, but active participant selection should use active squad players.

Production action: test a real Training participant picker and confirm one active player appears once, especially after imports and deleted-player recovery.

## 12. Drill Age Migration Status

`drills.age_mode`, `drills.minimum_age`, and `drills.maximum_age` are now represented in:

- `supabase/schema.sql`
- `supabase/migrations/20260903_drill_age_suitability.sql`
- `types/database.ts`

The migration backfills old rows, preserves preset age groups, converts legacy empty/custom-without-range data to `all_ages`, clears custom range values when not in `custom_range`, then applies defaults, `not null`, and check constraints.

## 13. Dashboard Data Scope

Dashboard squad count is active-team scoped after repair.

Global drill/session template counts may remain coach-global if labelled and intended as reusable coach library data.

Production scenario to verify:

- Team A with 22 players shows 22.
- Team B with 20 players shows 20.
- Switching teams does not retain stale Dashboard totals.

## 14. Team Deletion Safety

Permanent team deletion is performed through `public.delete_squad_permanently(target_squad_id, confirmation_name)`.

The function:

- requires authenticated ownership;
- requires exact team-name confirmation;
- deletes team-owned operational data;
- preserves coach-global drills, drill graphics, drill templates, and training plan templates;
- selects a fallback active team when possible.

Direct table deletion remains intentionally avoided.

## 15. Environment & Service Role Audit

Client-safe:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`

Server-only:

- `SUPABASE_SERVICE_ROLE_KEY`
- `COACHBOARD_API_KEY`
- `COACHBOARD_DASHBOARD_OWNER_ID`

No real secrets were added to the repository. The debug dashboard route returns only boolean environment presence flags.

## 16. Deployment Workflow

Documented in:

- `docs/DEPLOYMENT.md`
- `README.md`

Key rule: apply backward-compatible Supabase migrations before deploying code that requires new schema fields.

## 17. Automated Safeguards Added

Added:

- `scripts/check-supabase-schema.mjs`
- `npm run db:check`

The check catches common app/schema drift before Vercel deployment.

## 18. Migrations Created

Created during this audit set:

- `supabase/migrations/20260903_drill_age_suitability.sql`
- `supabase/migrations/20260903_team_permanent_delete.sql`

## 19. Tests Executed

Run before completing this audit:

- `npm run db:check`
- `npm run typecheck`
- `npm run test:positions`
- `npm run test:recurrence`
- `npm run test:calendar`
- `npm run test:import-duplicates`
- `npm run lint`
- `npm run build`

See the task close-out for the latest command result.

## 20. Remaining Manual Production Steps

PRODUCTION ACTION REQUIRED:

1. Apply these migrations to the production Supabase project:
   - `supabase/migrations/20260903_drill_age_suitability.sql`
   - `supabase/migrations/20260903_team_permanent_delete.sql`
2. Confirm Vercel environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL`
   - server-only dashboard variables if using `/api/dashboard`
3. Deploy the latest `main` branch to Vercel.
4. Verify production:
   - Dashboard loads.
   - Drill Library loads without `drills.age_mode` errors.
   - create/edit drill age modes work.
   - Team A / Team B player counts stay separated.
   - team permanent delete removes only that team’s operational data.
   - coach-global drills/templates remain.
5. Do not run destructive cleanup queries in production without confirming Supabase backup/recovery first.
