# CoachBoard Deployment and Database Workflow

This project deploys the Next.js app to Vercel and stores application data in Supabase Postgres.

## Environment Variables

Client-safe variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`

Server-only variables:

- `SUPABASE_SERVICE_ROLE_KEY`
- `COACHBOARD_API_KEY`
- `COACHBOARD_DASHBOARD_OWNER_ID`

Only the `NEXT_PUBLIC_*` values may be exposed to the browser. Never commit real secrets to the repository.

## Code-Only Deployment

Use this path when the change does not require new database tables, columns, indexes, policies, triggers, functions, or constraints.

```bash
npm run db:check
npm run typecheck
npm run lint
npm run build
git add .
git commit -m "Describe the code change"
git push
```

Vercel deploys the production app from the `main` branch.

## Database Migration Deployment

Use this path when code depends on a database change.

1. Create a new migration file in `supabase/migrations`.
2. Update `supabase/schema.sql` so a fresh database has the same final schema.
3. Run local checks:

   ```bash
   npm run db:check
   npm run typecheck
   npm run lint
   npm run build
   ```

4. Apply the migration to production Supabase before deploying code that requires it.
5. Deploy the compatible app code to Vercel.
6. Verify the changed page in production.

Prefer backward-compatible migrations:

- add nullable/new columns first;
- backfill existing rows;
- add defaults and `not null` only after backfill;
- add check constraints after data is valid;
- avoid dropping or rewriting production data without a backup and review.

Never edit an already-applied production migration. Create a new migration instead.

## Schema Consistency Check

Run:

```bash
npm run db:check
```

The check parses `supabase/schema.sql`, scans application Supabase usage in `app`, `components`, `lib`, and `types`, and fails when code references a table or persistent column that the schema file does not define.

This is a lightweight guard against incidents like deploying code that selects `drills.age_mode` before the production database has the column. It does not replace applying migrations to Supabase.

## Supabase Types

Generated database types live in `types/database.ts`. After schema changes, regenerate or update this file so server actions, route handlers, and typed Supabase calls reflect the deployed schema.

If using the Supabase CLI in a configured environment, the usual command shape is:

```bash
supabase gen types typescript --project-id YOUR_PROJECT_ID --schema public > types/database.ts
```

Review the generated diff before committing.

## Rollback Notes

Rolling back a Vercel deployment does not roll back Supabase schema changes. Database rollbacks need their own reviewed migration.

Before destructive cleanup or permanent delete changes, confirm the current Supabase backup/recovery capability for the project plan.

## Production Verification

After deployment, test:

- login and protected route redirect;
- Dashboard active-team counts;
- Squad and Training views after switching teams;
- Drill Library, create/edit drill, and drill age filters;
- Training creation, participant selection, attendance, and ratings;
- team deletion only from the team settings page;
- print route;
- `/api/dashboard` with and without the API key if that integration is enabled.
