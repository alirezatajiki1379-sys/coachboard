# COACHBOARD SCOUTING MVP REPORT

## 1. Scouting architecture

Scouting is a first-class /scouting area in the existing App Router and AppShell. It has Overview, Players and Targets navigation. Prospects are deliberately separate from Squad players until the coach invites them to a trial.

## 2. New database tables and relationships

- scouting_players: external prospect profile and pipeline state.
- scouting_observations: repeated dated evidence owned by one prospect.
- scouting_targets: team-related search profiles without team membership.
- scouting_target_players: many-to-many prospect/target links.
- scouting_history: meaningful lifecycle events.

Composite owner foreign keys ensure a record cannot reference another user's prospect, target, team or Squad player.

## 3. Canonical Player identity strategy

A Scouting Player is its own external identity. linked_squad_player_id is initially null. Invite to Trial creates one existing-style squad_players trial record and links it back to the prospect. The prospect, observations, target links and history remain unchanged. Converting that trial to roster updates the linked prospect to added_to_squad and records history.

## 4. Scouting Player implementation

Create/edit supports structured name, birthdate, positions, foot, club/team, source, status, priority, optional physical data, notes and next action/date. Creation checks likely duplicates by normalized name plus birthdate or club and never silently merges.

## 5. Observation implementation

Observations are chronological and independently editable. Date, context and summary are required; all other evidence and 1-5 category ratings are optional. No overall or talent score is calculated.

## 6. Target/Search Profile implementation

Targets support title, optional CoachBoard target team, priority/status, positions, birth-year range, foot, desired profile, target count, deadline and notes. A target team does not create Squad membership.

## 7. Player to Target relationship

Prospects can be linked to multiple targets and targets can contain multiple prospects. Link/unlink actions use one relationship row and record meaningful prospect history.

## 8. Pipeline/status implementation

Stable values: identified, monitoring, shortlist, trial, added_to_squad, archived. User-facing labels are English/German. added_to_squad cannot be selected before a Squad identity is linked.

## 9. Next-action workflow

Prospects support a canonical next action and optional date. Overdue actions appear on the Scouting Overview. This remains a focused scouting follow-up, not a generic task system.

## 10. Trial Player integration

Invite to Trial validates an owned active Team, start date, and either training count or end date. It reuses squad_players and the existing future-training synchronization. A failed link attempts to remove the newly inserted trial record.

## 11. Squad conversion and history preservation

The scouting identity is never deleted during trial or roster conversion. Linked Squad Player profiles show a Scouting history link. The existing trial-to-roster action updates the prospect and appends added_to_squad.

## 12. Duplicate detection

Creation checks both existing scouting prospects and non-deleted Squad players. Matches are reviewable links. The coach must explicitly confirm creating a separate record.

## 13. Privacy/RLS

Every table has user_id, RLS is enabled, and policies require auth.uid() = user_id. Composite foreign keys also enforce same-owner relationships. Medical data, addresses and contact data are not part of the scouting schema.

## 14. Mobile implementation

Desktop uses a focused table; mobile uses prospect cards. Forms use full-width inputs, wrapping controls and 44px minimum actions. Fictional-data browser QA passed at 320, 360, 375, 390, 430, 768 and 1440px.

## 15. English/German

New navigation, filters, forms, statuses, priorities, observation contexts, empty states and actions have EN/DE copy. Canonical values remain language-independent. Source/player names are not translated.

## 16. Query/performance strategy

Overview/list data loads players, targets, links and observation dates in four parallel bounded queries. Player and Target detail use parallel batched queries. There is no query per prospect or per observation.

## 17. Migrations created

supabase/migrations/20260920_scouting_workspace.sql

This self-contained migration creates the update trigger function, tables, indexes, constraints, owner-scoped foreign keys, triggers and RLS policies.

## 18. Generated types

types/database.ts contains Row/Insert/Update definitions for all five tables. A narrow typed Scouting client works around a version-signature mismatch between the installed Supabase SSR and JS packages without weakening other app areas.

## 19. Tests/build

- npm run typecheck: PASS
- npm run lint: PASS
- npm run i18n:check: PASS, 441 EN/DE keys
- npm run db:check: PASS
- npm run build: PASS
- scripts/scouting-regression.mjs: PASS
- Fictional-data responsive browser suite: PASS

No real Supabase writes were made. A signed-in Production/staging account is still required to verify migration application, RLS behavior, persistence and end-to-end trial conversion.

## 20. Production actions

1. Apply 20260920_scouting_workspace.sql to Production Supabase.
2. Verify all five tables, RLS policies and indexes.
3. Only then push/deploy the dependent app code to Vercel.
4. Run signed-in create/edit/observation/target/link/trial/conversion checks.

Do not deploy the Scouting code before the migration.

## SCOUTING MVP REGRESSION

| Check | Result | Note |
| --- | --- | --- |
| Scouting Overview | PASS | Batched data and deterministic cards |
| Create Player | PASS | Validation and duplicate review implemented |
| Player Profile | PASS | Profile, observations, targets, history |
| Add Observation | PASS | Quick minimum and optional detail fields |
| Observation History | PASS | Chronological and editable |
| Create Target | PASS | Team context remains non-membership |
| Link Player to Target | PASS | Many-to-many link/unlink |
| Search/filter | PASS | Name, club, status, role, age, foot, priority, target |
| Pipeline status | PASS | Canonical status constraints |
| Next action | PASS | Date and overview follow-up |
| Invite to Trial | WARNING | Implemented; live Supabase workflow not executed |
| History preserved | PASS | Stable scouting ID and explicit Squad link |
| Duplicate protection | PASS | Review required; no silent merge |
| RLS | WARNING | SQL verified; Production policy behavior requires migration and signed-in test |
| Mobile | PASS | Fictional data at required widths |
| English | PASS | Static and browser checks |
| German | PASS | Static and browser checks |
| Production build | PASS | All new routes compiled |

## PENDING PRODUCTION MIGRATIONS

1. supabase/migrations/20260920_scouting_workspace.sql

Production is **not ready for the Scouting deployment** until this migration is applied.
