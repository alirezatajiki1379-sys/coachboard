# CoachBoard Squad Workspace Loading Failure Audit

## 1. Symptom

Production showed the Squad error boundary on Squad, Attendance, and Player Profile related routes:

`The squad workspace could not be loaded`

The application data was not changed by this failure. The failure happens during server loading before the page can render.

## 2. Exact failing code path

The Squad workspace route loads:

`app/(app)/squad/page.tsx`

which calls:

`getCoachWorkspaceData()` in `lib/squad/workspace.ts`

That function loads active player availability through:

```ts
db.from("player_availability_periods").select("*").eq("user_id", userId).eq("status", "active")
```

Player Profile and Attendance also depend on the same table through:

- `lib/squad/player-hub.ts`
- `lib/squad/availability.ts`
- `lib/squad/attendance-queries.ts`
- `lib/squad/attendance-actions.ts`

## 3. Most likely production root cause

The app code references the new `public.player_availability_periods` table and the expanded attendance fields/check constraints.

If production Supabase has not received the matching migration, Supabase will return a schema error such as:

```text
42P01: relation "public.player_availability_periods" does not exist
```

or a constraint error when writing availability-derived planned statuses:

```text
23514: check constraint violation
```

This is a production schema drift problem, not a deleted-data problem.

## 4. What was unsafe before this fix

`lib/squad/workspace.ts` silently converted active medical and availability query errors into empty maps.

That made schema/RLS/query failures look like “no availability data” and could hide the real problem. Other routes still failed when they queried the missing object directly.

`lib/squad/attendance-queries.ts` also updated availability-derived attendance rows in a `Promise.all` batch without checking each Supabase result for errors.

## 5. Code fix

The Squad workspace now logs and throws clear server-side errors when required Squad medical or availability queries fail.

The Attendance sync update batch now checks Supabase update results and throws if any update fails.

The Squad error boundary copy was changed to calm bilingual user text and points diagnostics to server logs instead of exposing schema/internal details to coaches.

## 6. Required migration

Added:

`supabase/migrations/20260913_player_availability_periods.sql`

This migration:

- creates `public.player_availability_periods`
- adds reason/status/date constraints
- adds the active availability lookup index
- adds the updated-at trigger
- enables RLS
- creates the owner policy
- ensures `squad_attendance_records.planned_reason` exists
- ensures `squad_attendance_records.planned_status_source` exists
- expands attendance planned reason/source/final status check constraints

## 7. Production action required

Apply the migration to production Supabase before or together with the deployed code:

```sql
-- Run the contents of:
-- supabase/migrations/20260913_player_availability_periods.sql
```

After running it, verify:

```sql
select to_regclass('public.player_availability_periods') as availability_table;

select conname
from pg_constraint
where conrelid = 'public.squad_attendance_records'::regclass
and conname in (
  'squad_attendance_records_planned_reason_check',
  'squad_attendance_records_planned_status_source_check'
);
```

Expected:

- `availability_table` is `player_availability_periods`
- both attendance constraints are present

## 8. RLS/security

The availability table uses `user_id` ownership and checks that the referenced player belongs to the authenticated user.

If a `squad_id` is provided, the policy also checks that the squad belongs to the authenticated user.

## 9. Remaining risk

This audit was performed from the repository. Vercel production logs were not available locally, so the exact production digest stack trace could not be read here.

If the page still fails after this migration, check Vercel logs for the new server log keys:

- `squad_workspace_active_availability_query_failed`
- `squad_workspace_active_medical_query_failed`
- `squad_workspace_render_failed`

Those logs should identify the next exact failing table, policy, or constraint.
