# CoachBoard Complete German Localization Audit

## 1. Root Cause(s) Of Remaining English Pages

The app had a partial i18n architecture: navigation, settings and a few server pages used message files, but many Server and Client Components still rendered hardcoded English strings directly in JSX, config objects, table definitions, validation helpers and server action messages.

Player Import was one of the clearest examples because its workflow component owned most labels locally.

## 2. Locale Provider/Runtime Fixes

The authenticated app already resolves locale from saved profile preference, then browser language, then English fallback.

This pass adds a deterministic German runtime localization boundary for authenticated and auth layouts. It activates only for `locale = de` and translates exact CoachBoard-owned system phrases plus selected count/status patterns.

The dictionary was expanded for the most visible CoachBoard areas: Dashboard, Action Center, Squad, Player Import, Training calendar, Training detail, training plans, ratings, development, analytics, drill library, drill editor controls, autosave/draft dialogs, print/export labels and team/account controls.

## 3. Route Inventory

Discovered route pages:

- `/`
- `/dashboard`
- `/actions`
- `/drills`
- `/drills/new`
- `/drills/[id]`
- `/drills/[id]/edit`
- `/drills/[id]/print`
- `/sessions`
- `/sessions/new`
- `/sessions/[id]`
- `/sessions/[id]/edit`
- `/sessions/[id]/print`
- `/sessions/[id]/field`
- `/settings`
- `/teams`
- `/teams/[id]/settings`
- `/trainings`
- `/trainings/new`
- `/trainings/[id]`
- `/trainings/[id]/edit`
- `/trainings/[id]/plan`
- `/trainings/[id]/check-in`
- `/trainings/[id]/ratings`
- `/trainings/[id]/review`
- `/trainings/[id]/drills/new`
- `/squad`
- `/squad/import`
- `/squad/planner`
- `/squad/attendance`
- `/squad/attendance/new`
- `/squad/attendance/[id]`
- `/squad/attendance/[id]/check-in`
- `/squad/attendance/[id]/ratings`
- `/squad/attendance/[id]/review`
- `/squad/ratings`
- `/squad/development`
- `/squad/analysis`
- `/squad/players/new`
- `/squad/players/[id]`
- `/squad/players/[id]/edit`
- `/squad/players/[id]/report`
- `/login`
- `/signup`
- `/forgot-password`
- `/reset-password`

## 4. Translation Architecture

Existing `messages/en.json` and `messages/de.json` remain the semantic i18n source for already-localized routes. The new runtime boundary in `components/i18n/german-localization-boundary.tsx` is a deterministic guard for hardcoded CoachBoard-owned text.

## 5. Hardcoded String Audit Method

Used:

- `find app -name page.tsx -o -name layout.tsx`
- `npm run i18n:audit`
- `npm run i18n:check`

## 6. Dashboard Result

WARNING: Existing message-backed labels remain localized. The runtime boundary covers many remaining common labels, but source audit still finds hardcoded strings.

## 7. Squad Result

WARNING: Main navigation and key tabs are localized. Runtime boundary covers common table/action/status labels.

## 8. All Squad Tables Result

WARNING: Common columns such as Player, Position, Status, Attendance, Rating, Average, Trend, Action and Actions are covered by the boundary. Full source-level migration remains.

## 9. Player Profile Result

WARNING: Common profile labels are covered. User content remains unchanged by design.

## 10. Player Import Result

PASS for the newly implemented import/composite workflow labels covered in this pass.

## 11. Import Mapping Result

PASS for system labels including Upload, Mapping, Address, Street, PLZ/Postal code, City, Contact, Football, Physical, Matched/Unmapped/Review states.

## 12. Import Preview Result

PASS for grouped preview labels: Name, Birth date, Address, Contact, Football and Physical.

## 13. Training Result

WARNING: Common labels are covered, but full source-level semantic migration remains.

## 14. Training Participant Tables Result

WARNING: Common participant table terms are covered.

## 15. Session Plan Result

WARNING: Existing export/session message keys plus runtime boundary improve German coverage.

## 16. Drill Library Result

WARNING: Common drill/action/material terms are covered. Drill/editor source-level hardcoded strings remain.

## 17. Drill Editor Result

WARNING: Broad common terms are covered, but editor-specific tooltips and controls need a later direct semantic i18n migration.

## 18. Session Review Result

WARNING: Core review terms are covered in the boundary.

## 19. Development Result

WARNING: Development table and goal terms are partially covered.

## 20. Analytics Result

WARNING: Common analytics table terms are covered, but chart-specific text still needs direct migration.

## 21. Planning Insights Result

WARNING: Common labels are covered. Generated dynamic messages still need semantic translation keys.

## 22. Export/Print Result

WARNING: Existing export message usage remains. Boundary covers common print/export labels.

## 23. Settings Result

PASS for existing Settings language/profile area and common settings labels.

## 24. Team Management Result

WARNING: Common team settings and danger-zone labels are covered.

## 25. Sidebar/Mobile Result

PASS for existing sidebar/mobile labels that already use `messages`.

## 26. Dialogs/Tooltips/Toasts Result

WARNING: Boundary translates common `title`, `aria-label`, `alt`, `placeholder` attributes and text nodes. Browser-native confirm strings inside JavaScript cannot be fully intercepted safely.

## 27. Validation/Error Localization

WARNING: Import validation strings for date, number, email, missing date, missing position and missing player name are covered by exact phrase translation. Server action errors still need stable error-code migration.

## 28. Accessibility Localization

WARNING: Boundary covers many aria-label attributes; existing message-backed accessibility labels remain localized.

## 29. Date/Time/Number Localization

PASS where existing code uses `formatDate`, `formatNumber`, or `localeToIntl`. Some older hardcoded formatting helpers still need route-by-route migration.

## 30. Translation Key Parity

PASS: `npm run i18n:check`

## 31. Hardcoded English Audit Result

WARNING: `npm run i18n:audit` still reports hardcoded source literals. The runtime boundary reduces visible German-locale English for covered phrases but does not eliminate all source literals.

## 32. Tests Executed

Passed:

- `npm run typecheck`
- `npm run lint`
- `npm run i18n:check`
- `npm run i18n:audit`
- `npm run build`

Important result:

- `npm run i18n:audit` exits successfully but still reports 3316 likely hardcoded source strings. This is a source-level warning, not a failed build. The runtime boundary translates many of those visible strings when German is active, but the strict source-level standard is not complete.

## 33. Remaining Intentional Exceptions

- CoachBoard brand name
- Player names
- Team names
- User-created drill/training/session names
- User-created notes
- Custom group names
- Canonical position abbreviations such as GK, CB, CDM, CM, CAM, RW, LW, ST
- Stable internal IDs and route slugs

## 34. Production Actions

No database migration is required for this localization boundary. Deploy after normal checks pass.

## PLAYER IMPORT GERMAN REGRESSION

| Area | Result |
| --- | --- |
| Upload | PASS |
| Mapping | PASS |
| Address composite mapping | PASS |
| Preview | PASS |
| Validation | PASS |
| Result | PASS |
| Mobile | WARNING |

Mobile layout uses responsive cards plus an existing horizontally scrollable detailed mapping table.

## TABLE LOCALIZATION REGRESSION

| Area | Result |
| --- | --- |
| Squad Players | WARNING |
| Training Participants | WARNING |
| Attendance | WARNING |
| Ratings | WARNING |
| Development | WARNING |
| Analytics | WARNING |
| Import Mapping | PASS |

## Runtime Walkthrough Limitation

WARNING: A full authenticated click-through with production-like data was not completed in this pass. The implementation was validated through route inventory, source inspection, i18n checks, lint, typecheck and production build. A final manual browser walkthrough in German is still recommended before calling the full-app localization standard complete.

## UNTRANSLATED COACHBOARD-OWNED USER-VISIBLE ENGLISH

Not None.

The source audit still reports thousands of likely hardcoded strings. This patch adds a deterministic German runtime boundary and covers the most common visible labels, especially Player Import, Dashboard/Squad/Training/Drill terms, autosave dialogs, import review and table labels, but a complete source-level localization migration remains necessary before the strict acceptance standard can honestly be called fully complete.

## PRODUCTION ACTION REQUIRED

- Database changes necessary: no
- Generated Supabase types changed: no for this localization pass
- Locale persistence: existing saved preference remains active in authenticated app layout
- `i18n:check`: pass expected
- `i18n:audit`: warning expected until source-level migration is complete
- German full-app walkthrough: not fully passed at source-audit standard
- English regression walkthrough: boundary inactive for English
- Vercel deployment: safe after final build/lint pass
