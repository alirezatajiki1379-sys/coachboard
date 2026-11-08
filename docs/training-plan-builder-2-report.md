# TRAINING PLAN BUILDER 2.0 - PLAN-FIRST COACHING WORKSPACE

## Scope and evidence

Implemented in an isolated worktree based on `origin/main` at `d453d7e`.
The primary working tree, including unfinished Staff Brief and Development changes,
was not edited, staged, stashed, reset, or restored.

PASS below means verified by source inspection, the existing regression suites,
and/or the real-component browser fixture described here. It does **not** mean a
live authenticated Production database write was executed. The browser fixture
uses the actual shared SessionForm, previews, calculations, local drafts, dialogs,
and localization. Only the server action/navigation boundary is simulated. It
captures the canonical submitted JSON, then reloads the component with that saved
payload. No Production data was changed.

## Implementation

- The same SessionForm remains responsible for reusable and concrete plans.
- Each visible section has Add Drill; a compact global action covers other reusable
  blocks. The picker filters existing loaded data without additional queries.
- Picker controls retain title search, age, focus, block and drill-type filters.
  Duplicate instances use new IDs and the existing insertion/order helper.
- The prior permanent bottom library is replaced by the focused modal/sheet.
- Cards show the existing real visual, title, player count, direct minute input,
  move/remove controls and Details. Duration remains integer and at least one minute.
- Details retain block, execution mode, station sets, groups, starting group, notes,
  session overrides, selected/reordered coaching points, staff and planning fields.
- Details open state is keyed by instance ID. Explicit summary activation avoids
  asynchronous native toggle events closing a card when station changes reparent it.
- Concrete Training metadata is collapsed beneath date/time/focus/player/target context.
  Reusable metadata starts expanded. Title validation opens the metadata and focuses it.
- Section settings, staff management and Review carry-forward remain available.
- Material summary is compact; Block Structure is preserved behind a disclosure.
- Configured section duration and calculated drill duration are displayed separately.
  The existing manual-duration precedence is not changed.
- Snapshot source IDs are passed only as presentation metadata for picker usage counts.
  Existing snapshot IDs, content, overrides and save behavior remain unchanged.
- System text is translated; custom titles, notes, staff and material labels remain raw.

## Acceptance checklist

| Requirement | Result | Evidence |
| --- | --- | --- |
| Existing Training model preserved | PASS | No domain, schema or server-action rewrite |
| Reusable Plans preserved | PASS | Shared builder fixture in template mode |
| Concrete Session Plans preserved | PASS | Shared builder fixture in session mode |
| Snapshot semantics preserved | PASS | Snapshot remains separate; source/snapshot input objects unchanged; existing action assertions |
| Plan-first hierarchy | PASS | Context then section workspace; advanced fields collapsed |
| Add Drill inside section | PASS | Actual section button/picker interactions |
| Target section preserved | PASS | Submitted payload and mock reload |
| Drill picker | PASS | Modal/sheet with real controls |
| Picker Search | PASS | Matches and empty results |
| Picker Filters | PASS | Combined age/focus/block/type filters |
| Duplicate Drill use | PASS | Distinct UUIDs, independent duration, count and Add again |
| Bottom Library dependency removed/demoted | PASS | Permanent list removed; global and section actions retained |
| Drill cards simplified | PASS | Closed Details and compact preview screenshots |
| Visual preserved | PASS | Real renderer and nonblank canvas pixel assertion |
| Quick duration editing | PASS | Direct numeric input without opening Details |
| Total duration live update | PASS | Sequential and station numeric assertions |
| Target duration context | PASS | Total/target and translated remaining minutes |
| Drag & Drop preserved | PASS | HTML5 handler tests and native mouse drag between sections |
| Move up/down preserved | PASS | Actual button interactions and ordered IDs |
| Remove preserved | PASS | Actual remove action, zero remaining instances |
| Details progressive disclosure | PASS | Starts closed, remains open on station changes |
| Sequential mode preserved | PASS | Default insertion; return from simultaneous |
| Station mode preserved | PASS | Conditional controls and saved payload |
| Station sets preserved | PASS | Set change alters canonical total |
| Station duration semantics preserved | PASS | `max(12*2, 15) + 10 = 34`; separate sets total 49 |
| Player groups preserved | PASS | Create groups and assign both |
| Starting groups preserved | PASS | Select second group; mock save/reload |
| Training details compact in Session mode | PASS | Closed metadata, visible context |
| Template details preserved | PASS | Expanded metadata and original fields |
| Review carry-forward | PASS | Visible note; apply modifies current planning values |
| Session-only customization | PASS | Title, description, organization, note, briefing and instruction |
| Library Drill unchanged by Session override | PASS | Source input identity/content assertions; actions unchanged |
| Selected Coaching Points | PASS | Select two of five, reorder, reload |
| Coach Notes | PASS | Exact note survives draft recovery and mock save |
| Staff responsibility | PASS | Section Coach A; instance Coach B; inheritance remains available |
| Planning status | PASS | `needs_planning` retained in payload and reload |
| Material Summary | PASS | Sequential maximum and simultaneous sums displayed |
| Material calculation unchanged | PASS | `calculateSessionMaterials` untouched |
| Block Structure | DEMOTED | Existing information retained in disclosure |
| Local Draft | PASS | Real debounced localStorage, refresh and recover |
| Unsaved Changes protection | PASS | Cancel opens existing dialog; Stay preserves data |
| Save model preserved | PASS | No action calls before explicit Save; same hidden payload/action |
| No new auto-persist architecture | PASS | No new API, server mutation or storage model |
| German | PASS | System translations, DE browser matrix and inspected screenshots |
| English | PASS | EN browser matrix; custom content not translated |
| Mobile 320 | PASS | Both modes; picker and expanded/compact layout |
| Tablet 768 | PASS | Both modes, no horizontal overflow |
| Desktop 1440 | PASS | Plan plus compact material summary |
| Wide Desktop 1920 | PASS | Constrained content, both modes |
| Training Plan Builder browser regression | PASS | All 16 viewport/language/mode combinations plus advanced cases |
| Existing Training Plan regressions | PASS | `test:session-plan` |
| Session Plan regressions | PASS | Shared fixture and `test:session-plan` |
| Snapshot regressions | PASS | Existing action/source assertions plus snapshot customization fixture |
| Training Workflow regression | PASS | `test:training-workflow`, 7 tests |
| Review to Next Training regression | PASS | `test:review-next-training`, 4 tests |
| Drill regression | PASS | Image upload, import, bulk and Drill Experience browser suites |
| Staff Brief regression | PASS | Domain regression and EN/DE copy/share/print/PDF browser suite |
| Core stability | PASS | `test:core-stability`, 14 tests |
| Strict i18n | PASS | `i18n:check`, `i18n:audit:strict`, `test:localization` |
| TypeScript | PASS | `npm run typecheck` |
| ESLint | PASS | `npm run lint` |
| Production build | PASS | `npm run build` |

Additional checks: nonempty-section deletion is blocked; empty sections can be
deleted; long custom section titles do not cause horizontal page overflow; failed
save retains all overrides and the local draft; hidden title validation becomes
visible; picker Escape/focus return/Tab trap work; opening the picker or Details
does not submit the form. No browser page errors occurred.

## Files changed

- `app/(app)/trainings/[id]/plan/page.tsx`: presentation-only snapshot source identity.
- `components/sessions/session-form.tsx`: plan-first shared workspace and disclosure.
- `components/sessions/session-drill-picker.tsx`: targeted, accessible drill picker.
- `components/sessions/material-summary-list.tsx`: optional locale-aware structured
  display; callers without locale retain the existing label behavior.
- `lib/i18n/german-ui-dictionary.ts`: register builder copy and duration patterns.
- `lib/i18n/training-plan-builder-de.ts`: focused German builder translations.
- `scripts/training-plan-builder-2-browser.mjs`: real-component regression fixture.
- `docs/training-plan-builder-2-report.md`: this report.

## Reproduce browser validation

Build first so production Tailwind CSS exists. QA dependencies `esbuild` and
`playwright` are external test tooling, not new application dependencies.

```bash
npm run build
COACHBOARD_QA_DEPS=/private/tmp/coachboard-drill-experience-qa \
  node scripts/training-plan-builder-2-browser.mjs
```

Set `COACHBOARD_QA_CHROME` to a Chrome executable if it is not installed at the
standard macOS path. Screenshots default to
`/private/tmp/coachboard-training-plan-builder-2-screenshots`.

## Remaining limits and Production actions

- Live signed-in save/reload against Supabase and Production deployment health
  still require a post-deploy smoke test with a test account. They were not claimed
  as browser-fixture coverage.
- Chrome was exercised; no claim of a separate real iPhone or Safari run.
- Existing save actions and their database transaction/error behavior were not rewritten.
- Build emits the existing advisory about outdated Browserslist data; it is not
  a build failure. Dependencies were intentionally not changed.
- PENDING PRODUCTION MIGRATIONS: **NONE** for this milestone. No SQL was changed or applied.
- Deploy the focused commit through the normal `main`-branch Vercel integration.
  The final response records the resulting commit and push outcome.

Post-deploy smoke test: open a concrete Training plan and a reusable plan; add the
same drill to two sections; change one duration; configure one station and group;
save and reopen. Confirm both instances, ordering, notes and existing snapshots
remain intact. Check the Staff Brief and uploaded-image preview on one real plan.
