# CoachBoard English & German Internationalization Audit

## 1. Existing i18n Architecture Discovered

CoachBoard previously had a small `lib/i18n/en.ts` file used by navigation and a few dashboard labels. There was no German catalog, no locale resolver, no language switcher, and no automated key parity check.

The database already contains `profiles.preferred_language`, so no new Supabase column is needed for this milestone.

## 2. i18n Framework Chosen/Reused

This pass uses a lightweight in-repo message catalog instead of adding `next-intl`. Reason: the app already uses stable authenticated routes without locale prefixes, and the immediate need is server-resolved private-app language rendering with minimal routing risk.

Message files:

- `messages/en.json`
- `messages/de.json`

Helpers:

- `lib/i18n/index.ts`
- `lib/i18n/server.ts`
- `lib/i18n/actions.ts`

## 3. Locale Resolution Architecture

Locale priority:

1. `profiles.preferred_language`
2. `Accept-Language` browser header
3. English fallback

`de`, `de-DE`, `de-AT`, `de-CH`, and other `de-*` values resolve to `de`. Unsupported languages fall back to `en`.

## 4. Saved Preference Implementation

The Settings page writes the authenticated user preference to `profiles.preferred_language`. This is server-side and cross-device.

## 5. Browser Detection Implementation

For users without an explicit saved preference, `Accept-Language` is parsed on the server. Browser detection is not silently persisted as a permanent preference.

## 6. Server/Client Locale Bootstrap

The protected app layout resolves locale server-side and passes it into the client app shell. This avoids a client-only language flash for the shell/navigation.

## 7. Translation Namespace Structure

Current namespaces:

- `app`
- `common`
- `navigation`
- `accessibility`
- `account`
- `teams`
- `settings`
- `auth`
- `dashboard`

This structure is intentionally semantic and can be expanded for feature areas.

## 8. Total Translation Keys

The automated checker reports the current key count when running:

```bash
npm run i18n:check
```

## 9. English/German Parity Result

`npm run i18n:check` verifies:

- EN and DE key parity
- no empty translation values
- parameter parity for `{name}` style placeholders

## 10. Football Terminology Glossary

Initial terminology decisions:

- Squad → Kader
- Team → Mannschaft
- Drill → Übung
- Drill Library → Übungsbibliothek
- Session Plan → Einheitenplan
- Training → Training
- Attendance → Anwesenheit
- Planning Insights → Planungshinweise
- Session Review → Trainingsreflexion

## 11-24. Feature Migration Status

Migrated in this pass:

- App shell navigation
- Sidebar/mobile drawer accessibility labels
- Team switcher shell labels
- Logout label
- Settings language section
- Settings season section
- Auth login/signup/reset pages
- Dashboard high-level labels, actions, empty states and summary strings

Not fully migrated yet:

- Squad full tables and player profile
- Training workflow
- Attendance and ratings
- Session plan builder
- Drill library/editor/forms
- Session review
- Development goals
- Analytics
- Planning Intelligence
- Squad planner
- Imports/exports beyond existing print labels

## 25. Dialogs/Toasts/Errors/Validation Migration

Not complete yet. Existing server actions and validation still contain user-facing English strings. Future work should convert actions to stable error codes mapped through the active locale.

## 26. Accessibility Localization

Migrated for:

- App shell sidebar
- Mobile navigation drawer
- Logout button
- Team switcher shell actions

Remaining accessible labels in feature pages still need migration.

## 27. Date/Time/Number Formatting

Added shared helpers:

- `formatDate`
- `formatNumber`
- `localeToIntl`

English uses `en-GB`; German uses `de-DE`.

## 28. Pluralization

No full ICU pluralization layer has been added yet. Current dynamic messages use parameter replacement only. This is a known limitation.

## 29. Mobile German Text Expansion Fixes

The changed app shell/settings/auth/dashboard surfaces use wrapping flex layouts and existing responsive classes. Full German mobile QA across all feature pages remains required.

## 30. Hardcoded-String Audit Result

The repository still contains many user-facing hardcoded strings. This milestone should not be called complete bilingual coverage yet.

Current rough search result before full migration: more than 2,000 likely string literals across `app/`, `components/`, and `lib/`. Many are technical, but many are user-facing.

## 31. Automated i18n Checks Added

Added:

```bash
npm run i18n:check
```

## 32. Database Migration Created

No migration was created. `profiles.preferred_language` already exists in `supabase/schema.sql` and generated types.

## 33. Generated Type Changes

No generated type changes were required.

## 34. Tests Executed

Run and record results in the final implementation report:

```bash
npm run i18n:check
npm run typecheck
npm run lint
npm run build
```

## 35. Remaining Untranslated Intentional Exceptions

Intentional:

- CoachBoard product name
- Route slugs
- Database table/column names
- Canonical enum values
- Football position codes such as GK, CB, CM, RW
- User-generated titles, notes, names and custom labels
- Developer logs

## 36. Production Actions Required

No Supabase SQL is required for language preference storage if Production already has the current `profiles.preferred_language` column.

Before claiming full bilingual production readiness, migrate the remaining feature modules and run a German walkthrough for auth, dashboard, squad, trainings, sessions, drills, analytics, planning intelligence, settings, mobile drawer, dialogs, validation and print/export.

## Contributor Rule

A feature is not complete unless every new CoachBoard-owned user-visible system string has both an English and German translation.

Workflow:

1. Add a semantic key.
2. Add English text.
3. Add German text.
4. Use the key in UI.
5. Run `npm run i18n:check`.
