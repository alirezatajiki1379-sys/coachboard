# CoachBoard Bidirectional Localization Report

Date: 2026-09-20

## Overall Status

**INCOMPLETE: the full-app zero-untranslated-text acceptance criterion is not met.**
Targeted localization fixes and their regression checks pass. This is not certification of every authenticated page or every dynamic state.

No product features, database migrations, Production writes, or deployments were added/performed.

## Root Causes and Fixes

- Analytics had translated top-level navigation but English section metrics, mobile summaries, statuses, accessibility labels, dates and number formatting. These now use the current locale when rendered.
- Development forms, category/status labels and timeline events had English display text. These now translate without changing canonical categories or stored notes. Physical development uses the context-specific German label, not the physical-data import label.
- Development count text split plural endings from the sentence. Full interpolation templates now retain zero/singular/plural counts.
- Check-in, Ratings and participant controls now use consistent Expected/Not expected and Present/Late/Absent/Not recorded terminology and translated reasons. Rating values, writes and eligibility rules are unchanged.
- Participant filters compared the English display label "Expected". These now compare canonical participation semantics instead.
- Player Profile attendance history now formats statuses, reasons, dates, numbers and medical-return labels at the locale-aware presentation boundary.
- Built-in session blocks and phases now use a shared label mapper. Existing stored English enum values remain compatible; no saved plans are rewritten.
- Training cards and bulk selection show localized dates, workflow labels and confirmation copy. The destructive confirmation token remains exactly the token validated by the existing server action.
- The Squad error screen used browser language as an override of the selected app language, potentially showing German in English mode. It now uses the app locale. Action Center and relevant loading screens also render locale-aware copy.
- Player names, drill titles, templates, notes and other identified user-content leaf elements are protected with `translate="no"`. This includes a test player named "Quality" and a note saying "Present", both unchanged in German.
- The existing legacy DOM boundary was also verified against React label updates and repeated switching. Its earlier stale-source restoration fix is already present in the repository; it is not a new pending change in this continuation.

## Implementation Boundaries

`lib/i18n/system-text.ts` and `use-system-text.ts` provide explicit render-time translation of **system-owned source messages only**. Interpolation happens after translation, preserving embedded user text.
`workflow-copy-de.ts` supplements the existing dictionary rather than creating another locale preference or storage system.
`training-labels.ts` maps stable presentation identifiers and recognized legacy block enum labels.

Do not pass names, notes, custom titles or arbitrary database text to the system translator.

The legacy DOM boundary is still used by unmigrated surfaces. Removing it before all remaining surfaces are explicit would introduce regressions.

Custom section names that differ from built-in labels are preserved. The helper also supports an explicit custom flag. Old free-form sections whose names exactly match built-in labels cannot be distinguished by name alone; those legacy records require provenance to guarantee that distinction. No schema has been invented to conceal this limitation.

## Verification

| Check | Result |
| --- | --- |
| TypeScript | PASS |
| ESLint | PASS |
| Production build | PASS |
| i18n key parity | PASS: 440 keys per locale |
| All npm test suites | PASS: 11 suites/scripts, including the new localization regressions |
| Existing core-stability browser fixtures | PASS |
| Repeated en -> de -> en -> de | PASS in the tested real-component fixtures |
| Empty/populated Analytics and Development states | PASS for covered fixtures |
| Check-in/Ratings and Player Profile attendance-card terminology | PASS for covered fixtures |
| User content preservation and stale DOM/attribute restore | PASS for covered fixtures |
| No saves on opening/switching locale | PASS in mocked-action fixtures |
| Mobile/tablet/desktop overflow | PASS for covered fixtures at 375/430/768/1440px |
| i18n:audit | WARNING: command exits 0 but reports legacy source-copy candidates |
| Entire authenticated app walkthrough | NOT RUN: no authenticated test session was supplied |

The browser tests use the actual affected components, fictional data and mocked server actions. They are **not** tests of live Supabase writes, persisted locale preferences, active-team selection or a complete signed-in page tree.

All 46 discovered page routes were requested from a local production build in both languages (92 requests). Four public auth pages loaded with the chosen locale and passed responsive smoke checks. All other requests correctly redirected to login. Dynamic URLs used a fictional ID. This verifies the unauthenticated boundary, not authenticated content.

### Test Commands

```bash
npm run typecheck
npm run lint
npm run i18n:check
npm run i18n:audit
npm run i18n:inventory
npm run test:localization
npm run build
node scripts/localization-browser.mjs
node scripts/core-stability-browser.mjs
node scripts/localization-route-smoke.mjs
```

All pre-existing `test:*` scripts were also executed, covering recurrence, calendar, positions, import duplicates/composites, trial sync, availability, ratings, reviews and core stability.

The browser scripts use optional Playwright/esbuild dependencies outside the app at `COACHBOARD_QA_DEPS` (default `/private/tmp/coachboard-stability-tests`). They require an installed Chrome (`COACHBOARD_QA_CHROME` may override its path) and a production build for CSS. The route smoke script requires a local server at `COACHBOARD_QA_URL` (default `http://127.0.0.1:3100`). They never create a Production test route.

## Route-by-Route Runtime Matrix

A public smoke PASS means page load, selected locale and responsive checks, not every form submission/error state.
A WARNING means login protection was tested but authenticated UI was not.

| ROUTE / FEATURE | EN | DE |
| --- | --- | --- |
| `/` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/actions` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/dashboard` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/drills` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/drills/[id]` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/drills/[id]/edit` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/drills/[id]/print` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/drills/new` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/forgot-password` | PASS (public smoke) | PASS (public smoke) |
| `/login` | PASS (public smoke) | PASS (public smoke) |
| `/reset-password` | PASS (public smoke) | PASS (public smoke) |
| `/sessions` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/sessions/[id]` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/sessions/[id]/edit` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/sessions/[id]/field` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/sessions/[id]/print` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/sessions/new` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/settings` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/signup` | PASS (public smoke) | PASS (public smoke) |
| `/squad` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/squad/analysis` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/squad/attendance` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/squad/attendance/[id]` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/squad/attendance/[id]/check-in` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/squad/attendance/[id]/ratings` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/squad/attendance/[id]/review` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/squad/attendance/new` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/squad/development` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/squad/import` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/squad/planner` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/squad/players/[id]` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/squad/players/[id]/edit` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/squad/players/[id]/report` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/squad/players/new` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/squad/ratings` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/teams` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/teams/[id]/settings` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/trainings` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/trainings/[id]` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/trainings/[id]/check-in` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/trainings/[id]/drills/new` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/trainings/[id]/edit` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/trainings/[id]/plan` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/trainings/[id]/ratings` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/trainings/[id]/review` | WARNING (login redirect only) | WARNING (login redirect only) |
| `/trainings/new` | WARNING (login redirect only) | WARNING (login redirect only) |

## UNTRANSLATED COACHBOARD-OWNED ENGLISH WHILE locale=de

**Remaining; not "None".** The targeted reported Analytics labels are absent in German fixture output, but the complete app still has legacy untranslated paths.

Examples found during source review:
- Action Center: "All current open items are classified as high priority.", "Do not show this type", some generated action/evidence descriptions.
- Drill detail: "No drill graphic created yet.", usage-history empty states.
- Attendance/Ratings page wrappers: "Back to event", "Saved after each action", some no-participant explanations.
- Player Profile: other history/medical/notes sections and generated timeline strings need further explicit rendering review.
- Drill editor dialogs, import validation, planning insights and other dynamic errors need signed-in/runtime coverage.

The AST inventory currently finds 1879 candidates across app/components/config/lib. This includes intentionally bilingual copy maps and language-neutral terms; it is not 1879 confirmed visible defects. The older regex audit also includes expression false positives. Neither audit is a zero-English guarantee.

## HARDCODED COACHBOARD-OWNED GERMAN WHILE locale=en

None observed in the covered browser fixtures and public smoke routes. The Squad error browser-language override was fixed and tested in a German-browser context with app locale English.
**Whole-app result remains unverified**, not a global "None" claim.

## Remaining Acceptance Work

1. Use an authenticated local test account/team to walk every protected route in the matrix, including populated/empty/error states, dialogs and mobile navigation.
2. Migrate and translate remaining confirmed source/runtime gaps, especially generated Action Center/planning copy and profile/editor dialog states.
3. Complete user-content provenance/protection on legacy compound renderings, not just the identified leaf elements.
4. Exercise the actual Settings language save and subsequent navigation/refresh across en -> de -> en -> de. Fixtures verify locale rendering, not preference persistence.
5. Re-run all checks and only then mark the full localization milestone complete.

## Production Actions

- Required SQL/migrations: **None**.
- Existing canonical status codes, section values and user records remain unchanged.
- No Production schema assumptions were added.
- Nothing was committed, pushed or deployed automatically.
- Review the pending diff and perform the authenticated acceptance pass before calling this a complete localization release.
- A Git push can deploy this verified subset, but it does not mean the remaining full-app localization work is complete.

## Pending Changed Files

This lists the localization working-tree changes at report creation. Earlier committed stabilization/boundary changes are not relisted as new changes. The unrelated untracked `works` file was left untouched.

- `app/(app)/actions/error.tsx`
- `app/(app)/actions/loading.tsx`
- `app/(app)/dashboard/page.tsx`
- `app/(app)/drills/[id]/edit/page.tsx`
- `app/(app)/drills/[id]/page.tsx`
- `app/(app)/drills/[id]/print/page.tsx`
- `app/(app)/sessions/[id]/edit/page.tsx`
- `app/(app)/sessions/[id]/field/page.tsx`
- `app/(app)/sessions/[id]/page.tsx`
- `app/(app)/sessions/[id]/print/page.tsx`
- `app/(app)/squad/analysis/page.tsx`
- `app/(app)/squad/development/page.tsx`
- `app/(app)/squad/error.tsx`
- `app/(app)/squad/loading.tsx`
- `app/(app)/squad/planner/loading.tsx`
- `app/(app)/squad/players/[id]/page.tsx`
- `app/(app)/teams/[id]/settings/page.tsx`
- `app/(app)/teams/page.tsx`
- `app/(app)/trainings/[id]/page.tsx`
- `app/(app)/trainings/[id]/plan/page.tsx`
- `components/drills/drill-card.tsx`
- `components/drills/drill-editor.tsx`
- `components/layout/team-switcher.tsx`
- `components/sessions/session-card.tsx`
- `components/sessions/session-form.tsx`
- `components/squad/attendance-controls.tsx`
- `components/squad/coach-workspace.tsx`
- `components/squad/player-development.tsx`
- `components/squad/session-player-board.tsx`
- `components/squad/session-review-form.tsx`
- `components/squad/squad-tactical-planner.tsx`
- `components/squad/training-bulk-manager.tsx`
- `components/squad/training-event-card.tsx`
- `components/squad/training-event-form.tsx`
- `components/squad/training-participants-table.tsx`
- `config/development.ts`
- `lib/i18n/german-ui-dictionary.ts`
- `lib/squad/analytics.ts`
- `lib/squad/attendance-format.ts`
- `lib/squad/development.ts`
- `package.json`
- `scripts/ts-alias-loader.mjs`
- `components/i18n/use-system-text.ts`
- `lib/i18n/system-text.ts`
- `lib/i18n/training-labels.ts`
- `lib/i18n/workflow-copy-de.ts`
- `scripts/localization-browser.mjs`
- `scripts/localization-inventory.mjs`
- `scripts/localization-regression.mjs`
- `scripts/localization-route-smoke.mjs`
- `docs/bidirectional-localization-report.md`

