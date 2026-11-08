# DRILL EXPERIENCE 2.0 - CONSERVATIVE UX IMPROVEMENT

## Scope and findings

Prepared in an isolated worktree based on origin/main `cb24578`. The primary working tree's Staff Brief, Development, Planner and other unfinished work was not modified or staged.

The previous detail page placed Usage ahead of the exercise, rendered empty optional-content cards, omitted existing setup measurements/notes, and rendered several canonical English labels directly. Material summaries could hide the type/variant behind a custom label. Cards required the small Preview action to open the visual's detail.

The revised detail reads identity, visual, organization, coaching points, variations, setup/materials, usage, source. Difficulty/intensity are secondary facts. User text retains line breaks and is excluded from system translation. Material type, quantity, color, variant and custom label remain visible. Cards retain their layout/actions, with linked visuals/titles and collapsible usage details. Localized accessible action names accompany compact icons. Long custom material labels and titles now stay within their cards.

No editor, image renderer/signer, query semantics, database writes, snapshots, print route, form, builder or bulk-manager logic was changed. Existing translation entries take precedence over newly added dictionary entries.

## Acceptance results

PASS below describes source-boundary inspection and automated local regression evidence, not a live production-data audit. Browser tests mount real presentation components, the real Konva renderer and production CSS with fictional data; server mutations/navigation boundaries are stubbed. Live signed-in Supabase writes and Vercel deployment were not exercised.

| Check | Result |
| --- | --- |
| Library architecture preserved | PASS |
| Search preserved | PASS |
| Filters preserved | PASS |
| Sort preserved | PASS |
| Favorites preserved | PASS |
| Drafts preserved | PASS |
| Archived preserved | PASS |
| Trash preserved | PASS |
| Bulk actions preserved | PASS |
| Import preserved | PASS |
| Drill Card lightly simplified | PASS |
| Core card information preserved | PASS |
| Secondary actions preserved | PASS |
| Drill Detail reordered | PASS |
| Visual before Usage | PASS |
| Organization before Usage | PASS |
| Coaching Points before Usage | PASS |
| Variations before Usage | PASS |
| Setup / Materials before Usage | PASS |
| Usage preserved | PASS |
| Usage semantics unchanged | PASS |
| Usage evidence shown correctly | PASS |
| No fake 0 effectiveness | PASS |
| Source metadata preserved | PASS |
| Empty optional sections hidden | PASS |
| Difficulty preserved | PASS |
| Intensity preserved | PASS |
| Age semantics unchanged | PASS |
| Training snapshot semantics unchanged | PASS |
| Historical Training integrity | PASS: no persistence/snapshot changes; historical fixture unchanged |
| Use in Training audit | PASS |
| Use in Training outcome | DEFERRED |
| German | PASS |
| English | PASS |
| Mobile 320 | PASS |
| Tablet 768 | PASS |
| Desktop 1440 | PASS |
| Existing Drill regressions | PASS |
| Drill Experience browser regression | PASS |
| Session Plan regression | PASS |
| Core stability | PASS |
| Strict i18n | PASS |
| TypeScript | PASS |
| ESLint | PASS |
| Production build | PASS |

## Use in Training audit

`components/sessions/session-form.tsx` owns adding an existing reusable drill into the editable builder state, including block, section, duration, order and groups. The concrete `/trainings/[id]/plan` page loads the instance snapshots through that shared builder. `lib/squad/training-drill-actions.ts` handles creating new reusable/session-only drills, not a standalone existing-drill insertion contract. There is no existing safe preselection navigation contract to reuse.

Use in Training is deferred to Training Plan Builder 2.0. A parallel insertion action would duplicate builder/snapshot responsibilities. No button or incomplete workflow was added.

## Validation executed

- `npm run typecheck`
- `npm run lint`
- `npm run i18n:check` (521 EN/DE keys)
- `npm run i18n:audit:strict` (63 routes)
- `npm run build`
- `npm run test:drill-image-upload`
- `npm run test:drill-import`
- `npm run test:drill-bulk`
- `npm run test:drill-bulk-browser` with isolated QA dependencies
- `npm run test:session-plan`
- `npm run test:session-review`
- `npm run test:training-workflow`
- `npm run test:core-stability` (14 tests)
- `npm run test:localization` (8 tests)
- `node --experimental-strip-types --experimental-loader ./scripts/ts-alias-loader.mjs scripts/drill-experience-2-regression.mjs`
- `COACHBOARD_QA_DEPS=/private/tmp/coachboard-drill-experience-qa node scripts/drill-experience-2-browser.mjs`
- `git diff --check`

The browser harness needs esbuild/Playwright in `COACHBOARD_QA_DEPS` and Chrome at `COACHBOARD_QA_CHROME` (defaults follow the existing repository QA pattern). Build first so production CSS exists. Screenshots are written outside the repository; override with `COACHBOARD_QA_OUTPUT`.

Browser coverage: full/simple details, ordered headings, line breaks, unchanged source/custom labels, complete structured materials, localized dimensions/dates, real nonblank canvas, loaded upload image and unavailable-image fallback, mouse/keyboard visual navigation, independent checkbox/favorite/duplicate/archive actions, cancelled Trash confirmation, draft/archive/trash controls, filter URL values, long-text overflow at 320/768/1440 in both languages. Existing bulk browser coverage also passes at 375/430/768/1440 with 120 fixture drills.

Usage regression exercises the existing batched query function with a filtering mock: ownership, removed instances, future/trash exclusion, repeated use, review evidence, error fallback, unchanged history and four queries for multiple drills. It deliberately preserves the existing date-based definition of historical usage rather than introducing new timestamp semantics.

Local Next production smoke: `/login` returns 200; `/drills` redirects signed-out visitors to `/login` with 307.

## Files changed

- `app/(app)/drills/[id]/page.tsx`
- `components/drills/drill-detail.tsx`
- `components/drills/drill-card.tsx`
- `components/drills/drill-actions.tsx`
- `components/drills/drill-filters.tsx`
- `components/drills/drill-material-label.tsx`
- `lib/drills/display.ts`
- `lib/i18n/drill-experience-de.ts`
- `lib/i18n/german-ui-dictionary.ts`
- `scripts/drill-experience-2-browser.mjs`
- `scripts/drill-experience-2-regression.mjs`
- `scripts/drill-library-bulk-regression.mjs` (localized accessible-label assertion)
- `docs/drill-experience-2-report.md`

## Remaining checks and production actions

PENDING PRODUCTION MIGRATIONS: NONE for this milestone. No SQL or generated database types changed.

A new Vercel deployment is required for these presentation changes. The delivery response records the focused commit and push result; inspect that commit's deployment before production smoke testing.

After deployment, sign in and open a full and a simple owned drill in DE/EN. Verify the new reading order, image, materials, source and usage. Try favorite, duplicate, draft continuation, archive/restore and cancelled Trash. Check filters/sort and open Edit/Print. Confirm a previously saved Training snapshot is unchanged. Production CRUD/print/export checks remain manual; no production records were created, changed or deleted in this task.

The locked dependency install reports 17 existing audit findings (8 moderate, 8 high, 1 critical). Dependency upgrades were not included in this UX change. Build also warns about stale Browserslist data; neither warning failed validation.
