# CoachBoard Bidirectional Language Switching Audit

## 1. Exact Root Cause

The immediate runtime bug was caused by `GermanLocalizationBoundary`.

That component translated English-rendered DOM text into German by mutating text nodes and attributes after React rendered them. When the user switched back to English, React did not know those DOM nodes had been changed manually, so parts of the already-mounted UI could remain German.

This created the observed broken state:

```text
Settings preference = English
Rendered DOM text = German
```

This was not caused by Supabase data loss or user content. It was a client-side localization fallback mutating DOM without restoring the original values.

## 2. Locale Storage Architecture

The authenticated saved preference is stored in:

```text
profiles.preferred_language
```

Canonical values are:

```text
en
de
```

A cookie is now also written when the user changes language:

```text
coachboard_locale
```

The cookie helps the root document and auth/public pages start with the selected locale instead of relying only on browser language.

## 3. Locale Resolution Precedence

The application now resolves locale in this order:

```text
1. Explicit saved user preference, when available
2. coachboard_locale cookie
3. Accept-Language browser header
4. English fallback
```

## 4. Cookie Behaviour

Changing language through Settings writes:

```text
coachboard_locale=en
```

or:

```text
coachboard_locale=de
```

The cookie is path-wide and lasts one year.

## 5. localStorage Behaviour

No authoritative UI locale is read from localStorage in the inspected runtime path.

LocalStorage remains used for unrelated UI preferences and drafts, but it does not override `profiles.preferred_language`.

## 6. Root Provider Behaviour

`I18nProvider` receives the locale from the server layout and now also synchronizes:

```ts
document.documentElement.lang = locale
```

This keeps client-side error boundaries and accessibility language metadata aligned with the active CoachBoard locale.

## 7. Server Component Behaviour

Server Components that call `getUserLocale()` or receive the protected layout locale resolve from the saved user preference first.

Public/auth pages resolve from cookie, then browser language, then English.

## 8. Client Component Behaviour

Client Components using `I18nProvider` receive the same active locale and matching message dictionary.

The German fallback boundary is now reversible and no longer leaves German text behind after switching to English.

## 9. Nested Layout Audit

Inspected nested layouts:

- `app/layout.tsx`
- `app/(app)/layout.tsx`
- `app/(auth)/layout.tsx`

No nested layout hardcodes `defaultLocale = "de"`.

## 10. Hardcoded German Strings Discovered

The immediate stuck-German bug was not caused by hardcoded German strings. It was caused by DOM mutation without restoration.

There may still be hardcoded German strings in documentation, tests, fixtures, dictionaries, or regional-calendar data. Those were not the root cause of the switching failure.

## 11. Hardcoded English Strings Discovered

`npm run i18n:audit` still reports a large hardcoded-copy backlog. This is a known broad localization debt and is not fully resolved in this blocking runtime fix.

The audit script reported `3300` likely hardcoded user-facing strings. The checker is intentionally broad and includes some false positives such as expressions and message-key references.

## 12. Locale-Dependent Configs Discovered

Several pages use locale-specific copy objects and message dictionaries correctly. The broad audit still flags many configs/pages that need future full localization cleanup.

## 13. Cached/Memoized Translations Discovered

The main stale output came from direct DOM mutation, not from a memoized React translation object.

`I18nProvider` memoization already depends on `locale`.

## 14. Dashboard EN/DE

Runtime source uses `getUserLocale()` and `messages.dashboard`.

Status: PASS for locale source. Full visual walkthrough was not run in a browser from this environment.

## 15. Training EN/DE

Runtime source uses `getUserLocale()` and locale-specific copy structures.

Status: PASS for locale source. Full visual walkthrough was not run in a browser from this environment.

## 16. Training Plans EN/DE

Session/training-plan pages use server locale and message dictionaries in several print/export/detail routes.

Status: PASS/WARNING because `i18n:audit` still reports remaining hardcoded text in some session pages.

## 17. Drill Library EN/DE

Drill library uses `getUserLocale()` and localized drill filter copy.

Status: PASS/WARNING because `i18n:audit` still reports drill-detail hardcoded text.

## 18. Squad EN/DE

Squad workspace uses `getUserLocale()`, `I18nProvider`, and message dictionaries.

Status: PASS for the runtime switching root cause.

## 19. Player Profile EN/DE

Player profile uses Squad domain copy in several areas, but the broad audit still reports hardcoded strings.

Status: PASS/WARNING.

## 20. Availability EN/DE

Availability labels are part of the recent Squad availability implementation and use canonical reason IDs.

Status: PASS/WARNING pending full browser walkthrough.

## 21. Player Import EN/DE

Player Import has bilingual mapping data and stable internal IDs.

Status: PASS/WARNING pending full browser walkthrough.

## 22. Action Center EN/DE

`i18n:audit` reports many Action Center strings.

Status: WARNING. This route still needs a full copy-key migration later.

## 23. Analytics EN/DE

Analytics uses locale-specific copy objects, but also has inline conditional strings.

Status: WARNING.

## 24. Settings EN/DE

Settings uses `getRequestLocale(profile?.preferred_language)` and the language switcher.

Status: PASS.

## 25. Export/Print EN/DE

Export/print pages use message dictionaries for major document labels.

Status: PASS/WARNING pending full visual walkthrough.

## 26. Tables/Filters/Dialogs/Tooltips EN/DE

Runtime locale flow is fixed. Broad hardcoded-copy cleanup remains.

Status: WARNING.

## 27. Validation/Error EN/DE

The Squad error boundary now follows active `document.documentElement.lang`, which is synchronized by `I18nProvider`.

Status: PASS for the recently edited boundary. Full validation-copy audit remains broader work.

## 28. Date/Number Formatting EN/DE

Shared `formatDate`, `formatNumber`, and `localeToIntl` already map:

```text
en -> en-GB
de -> de-DE
```

Status: PASS for shared helpers.

## 29. Language Persistence Result

Changing language now updates:

- `profiles.preferred_language`
- `coachboard_locale` cookie
- root layout fallback locale
- client document language through `I18nProvider`

Status: PASS.

## 30. Repeated-Toggle Regression Result

The German fallback boundary now restores original text/attributes on cleanup and before applying German translations.

Expected:

```text
en -> de -> en -> de -> en
```

does not leave mutated German DOM behind.

Status: PASS by code inspection. Browser walkthrough still recommended.

## 31. i18n Parity Result

```bash
npm run i18n:check
```

Result:

```text
PASS: 440 keys in en, de
```

## 32. Hardcoded-String Audit Result

```bash
npm run i18n:audit
```

Result:

```text
WARNING: 3300 likely hardcoded user-facing strings
```

This audit passes as a reporting command but confirms a larger copy migration remains.

## 33. Test/Build Results

Completed:

- `npm run typecheck`
- `npm run lint`
- `npm run i18n:check`
- `npm run i18n:audit`

Production build should be run before deployment after this audit document is committed with the final code.

## 34. Production Actions

No database migration is required for this language-switching fix.

Deploying to Vercel is safe after:

```bash
npm run build
```

passes.

## Bidirectional Toggle Regression

| Scenario | Result |
| --- | --- |
| English -> German | PASS by code inspection |
| German -> English | PASS by code inspection |
| English -> German -> English | PASS by code inspection |
| Deep route language switch | WARNING: browser walkthrough recommended |
| Refresh English | PASS for cookie/root locale fallback |
| Refresh German | PASS for cookie/root locale fallback |
| Team switch English | PASS for saved preference source |
| Team switch German | PASS for saved preference source |
| Saved English vs German browser | PASS for authenticated server components |
| Saved German vs English browser | PASS for authenticated server components |

## Locale Coverage

| Route / Feature | English | German |
| --- | --- | --- |
| Dashboard | PASS | PASS |
| Trainings | PASS/WARNING | PASS/WARNING |
| Training Plans | PASS/WARNING | PASS/WARNING |
| Drill Library | PASS/WARNING | PASS/WARNING |
| Squad | PASS | PASS |
| Player Profile | PASS/WARNING | PASS/WARNING |
| Availability | PASS/WARNING | PASS/WARNING |
| Player Import | PASS/WARNING | PASS/WARNING |
| Action Center | WARNING | WARNING |
| Analytics | WARNING | WARNING |
| Settings | PASS | PASS |
| Export / Print | PASS/WARNING | PASS/WARNING |

## Hardcoded CoachBoard-Owned User-Visible German/English

Result:

```text
WARNING
```

The blocking runtime language-stuck bug is fixed, but the broader hardcoded-copy audit is not clean yet.

Legitimate exceptions include:

- CoachBoard brand name
- user-created content
- test data
- documentation
- canonical football position codes
- technical logs

## Production Action Required

- Database changes required: No
- Locale preference persistence changed: Yes, `coachboard_locale` cookie added
- Production migration required: No
- `i18n:check` passes: Yes
- `i18n:audit` passes as a reporting command: Yes, with warnings/backlog
- Both runtime walkthroughs pass: Not executed in a browser here
- Vercel deployment safe: Yes after production build passes
