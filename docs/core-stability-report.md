# COACHBOARD CORE STABILITY REPORT

Date: 2026-09-19

Overall status: **WARNING - stabilization is not fully signed off.** Confirmed regressions found in this pass have been fixed and local regression checks pass. The complete authenticated coaching workflow has not been exercised against real saved records. No deployment or Production SQL was executed.

## Status by area

PASS refers only to the evidence stated in the row. WARNING means a required runtime or end-to-end check remains outstanding; a successful build is not evidence of an authenticated page working.

| Area | Status | Evidence and remaining check |
| --- | --- | --- |
| Dashboard | WARNING | Upcoming/next-training selection now uses canonical Berlin date/time. Build and unauthenticated redirect pass. Authenticated metrics/team/click-through still need verification. |
| Trainings | WARNING | One filtered dataset drives cards; the existing team/filter component key and prop synchronization remain. List and metrics use a single captured current time. Authenticated filter clicks still need verification. |
| Past filter | PASS | Executable regression covers yesterday, today before/after now, tomorrow, equality at now, Completed/Rating-open overlap, Trash exclusion, empty data and stable URL IDs. This is a logic pass, not an authenticated calendar browser pass. |
| Training detail | WARNING | Auto-sync now excludes earlier sessions today, and medical prefill does not rewrite historical planned state. Build/redirect/schema probes pass; authenticated page and actual snapshot need verification. |
| Participants | WARNING | Manual/final attendance is protected in the corrected synchronization paths; unchanged rows are no longer rewritten on every detail load. In-memory regressions pass. Live participant/group operations were not performed. |
| Quick Check-in | PASS | Real-component browser tests cover rating toggles and rollback after a failed attendance request. Real server-action tests with a fake database cover all nine absence reasons, rating cleanup, preserved planned status and workflow transitions. German phone overflow fixed. Production persistence remains unverified. |
| Ratings | PASS | Expected+Present/Late default 3 stays UI-only; saved ratings win; same-button toggling yields null; cleared rating remains clear after a simulated refreshed prop. Both save paths reject nonparticipants and noninteger/out-of-range values. Failed requests preserve notes. |
| Session Review | PASS | Real-component browser tests preserve long text after failure, keep later edits dirty after success and preserve edits made during a pending save. Cumulative stars and EN/DE responsive rendering pass. Action/loader tests round-trip player_response and retry without duplicate reviews. Production save remains unverified. |
| Squad | WARNING | Existing position, duplicate-import, composite-import and trial eligibility tests pass. Protected route redirects correctly. Authenticated active-team data was not read. |
| Player Profile | WARNING | Availability date classification now uses the canonical timezone; independent analytics loading is parallelized. Protected route/build pass. Full authenticated profile walkthrough remains. |
| Availability | PASS | In-memory synchronization tests preserve past-today, previous-day, manual, final, completed, in-progress and trashed records, and keep participants in the snapshot. General absence reason tests pass. Actual availability dialog saves and medical lifecycle need authenticated verification. |
| Development | WARNING | Existing code inspected and route compiled; unauthenticated redirect passes. Real goal/progress data and mutations were not tested. |
| Analytics | WARNING | Existing null-filtered rating calculation inspected; regression verifies UI defaults are not written/countable and null ratings are ignored. Production metrics and cross-team filtering need verification. |
| Navigation | WARNING | Sidebar still uses Next Link with correct /dashboard, /trainings, /squad, /squad/analysis and /settings routes. Removed pending-state preventDefault and aria-disabled. Loading indicators remain. Authenticated sidebar clicks across routes were not available. |
| Loading/performance | WARNING | Removed redundant filtered-list loads, avoided unchanged participant writes, batched availability reads/writes and parallelized independent detail/profile reads. Existing loading.tsx skeletons remain. No Production latency benchmark or large-dataset load test was performed. |
| Production schema compatibility | PASS | Read-only, zero-row REST probes returned HTTP 200 for the eight core tables/column sets listed below. Local db:check passes. This does not validate the full migration ledger, constraints, triggers, indexes or authenticated RLS behavior. |

## Confirmed defects fixed

1. Session Review's success effect depended on the live form signature. Once a save succeeded, subsequent edits reset the saved baseline and incorrectly appeared clean. The baseline now advances only to the submitted snapshot after success.
2. Review navigation/unload protection was disabled while saving. It now stays active while dirty. Request exceptions return an error without unmounting or clearing controlled text inputs.
3. The review attendance summary added Late twice: the canonical Present count already includes Late. The summary now uses that count directly.
4. Post-training ratings could be written for absent/unrecorded participants. Both rating write paths now enforce Present/Late in the database UPDATE predicate, including when attendance changes concurrently.
5. Rating parsing accepted malformed strings/decimals through integer truncation. Ratings and review scores now require integers from 1 to 5. Empty rating values remain null.
6. Post-training save errors could escape to an error boundary and discard local notes. Save returns a structured result and the form retains controlled note fields. Saving a cleared rating no longer immediately reselects default 3 after refreshed props.
7. Quick Check-in controls had independent pending states and did not catch rejected requests. Status, reason and rating controls now share a row-level pending state; failed requests restore the previous display.
8. Automatic event status updates could regress Rating open to In progress or Prepared. Transitions now move forward only and preserve Completed. If an attendance/rating write succeeds but the separate status update fails, the UI retains the saved value and shows a warning.
9. Availability and roster auto-sync treated all of today as future. They now compare the scheduled start time in Europe/Berlin; earlier sessions today are protected. Medical display prefill also leaves historical planned state intact.
10. Availability synchronization reloaded the same player's periods per event. It now loads each period table once and batches identical updates. Write predicates re-check manual/final status protection.
11. Training detail rewrote all default participant rows on every read. It now updates only changed rows. Independent player/medical reads and profile analytics requests run concurrently.
12. Trainings loaded all nontrashed events and then repeated the full load for most filters. The existing all-events data now supplies filters and counts, with a separate query only for Trash.
13. Dashboard Upcoming used date-only UTC comparisons and could choose a session earlier today. It now uses the same chronological predicate as Trainings.
14. Sidebar loading state temporarily disabled a clicked link, preventing a retry if navigation stalled. The loading indicator no longer disables navigation; modified clicks keep standard browser behavior.
15. German Quick Check-in labels overflowed the 375px phone fixture. The status buttons now wrap. English-only Session Review drill feedback text was moved into its existing EN/DE copy; relevant rating/error dictionary entries were added.

## Checks executed

| Check | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run lint | PASS |
| All ten npm test:* scripts | PASS: 63 node:test cases plus the existing trial-sync and availability assertion scripts |
| npm run i18n:check | PASS: 440 matching EN/DE message keys |
| npm run i18n:audit | WARNING: 3,299 heuristic candidates for hardcoded strings; includes false positives and existing runtime-translated content. A complete language audit is not claimed. |
| npm run db:check | PASS: local application/schema consistency |
| npm run build | PASS |
| Isolated Chrome browser regression | PASS: actual SessionReviewForm, RatingRow and CheckInRow components, mocked server actions, real production CSS and German localization wrapper |
| Responsive browser checks | PASS: review, ratings and check-in at 375, 430, 768 and 1440px in EN/DE; no horizontal overflow or uncaught page errors |
| Local production-server HTTP checks | PASS: /login and /forgot-password return 200; protected core routes return 307 to /login, not 500 |
| Authenticated end-to-end coaching workflow | WARNING: no test login/session available; real writes and actual sidebar clicks not performed |

The optional browser tools were installed in a temporary directory, not added to application dependencies. The fixture runs on a temporary localhost port, uses fictional data and closes Chrome and its server afterward. No QA route is added to the app.

Re-run the browser fixture after building:

```bash
npm run build
npm install --prefix /private/tmp/coachboard-stability-tests --no-audit --no-fund --package-lock=false playwright esbuild
COACHBOARD_QA_DEPS=/private/tmp/coachboard-stability-tests node scripts/core-stability-browser.mjs
```

The fixture defaults to the installed macOS Google Chrome executable. Set COACHBOARD_QA_CHROME to another Chrome executable when necessary.

## Production schema check

GET requests used the configured Supabase public key, select=the required columns and limit=0. No private rows, credentials or tokens were printed. All returned 200:

- squad_training_events: ownership, team, date/start_time, status, trash/archive and participant snapshot fields.
- squad_attendance_records: ownership, event/player IDs, planned status/reason/source, actual_absence_reason, final_status, ratings and notes.
- player_availability_periods: ownership, player/team, reason, dates, status and note.
- player_medical_periods: ownership, player, start/end/return dates, status and type.
- training_session_reviews: ownership, team/event, quality, intensity, player_response, objective outcome and written feedback.
- training_session_drill_reviews: ownership and review/drill-instance relationships.
- squad_players: player ownership and squad_id.
- squads: team ownership.

PENDING PRODUCTION MIGRATIONS: **None newly required or discovered by this pass.** The prior full migration audit is not replaced by these targeted probes. No schema or generated database type changed.

## Remaining authenticated acceptance run

Use a test team and fictional players; do not use real attendance history for destructive testing.

1. Squad -> Player Profile: verify active team, player ID and the same saved positions/contact information.
2. Availability: create/edit/remove a future school/holiday absence; verify current/upcoming dates around Berlin midnight. Repeat with existing sickness/injury actions. The player must remain a participant, with future planned status/reason updated. Verify a manual override and an earlier training today remain untouched.
3. Training -> Participants: open that future training and refresh. Confirm no duplicate rows, correct team and preserved manual choices. Open an old completed training and compare its snapshot.
4. Quick Check-in: record Present, Late and every absence reason; reload each. Present/Late may have ratings; Absent must clear all rating fields. Planned status must remain independent. Not recorded must not receive a default rating.
5. Ratings: open an eligible unrated Expected participant and confirm 3 is selected but nothing is saved until submission. Toggle it off, save, and check that Quick Check-in and Analytics read the saved null. Save 4 and verify reopening shows 4. A nonexpected actual participant may be rated without default 3.
6. Session Review: load an old review, save all three 1-5 scores including player_response and long feedback, then reopen. Simulate a failed network request and verify text remains. After a successful save, type again and verify Unsaved changes returns.
7. Past Trainings: click Past, Upcoming, Completed, Rating open and Trash. Verify date/time membership, visible counts, empty states, EN/DE, refresh and active-team preservation.
8. Analytics: verify only saved numeric ratings count, cleared/unrated values do not become zero, and absence records do not retain performance ratings.
9. Click Dashboard/Trainings/Squad/Analytics/Settings from Squad, Player Profile, Attendance and Analytics. Verify immediate loading feedback, real URL navigation, no 500, correct team and no stale values.

## Remaining risks

- Full signed-in persistence, Production RLS isolation, active-team navigation and historical dataset integrity were not tested live. These remain mandatory before declaring stabilization complete.
- Session Review and event workflow updates still use multiple database operations. Review retries are idempotent, and failures preserve form data; no new transactional RPC/migration was introduced. A failed later operation can follow a successful earlier write.
- Some existing pages use the German DOM localization boundary. The targeted browser fixture covers its interaction with these forms, not every application page or label.
- Large event/attendance histories still need workload-specific pagination and query profiling; no new pagination feature was introduced.
- There is no new offline synchronization system. Failed requests preserve/restore local component state; reopening an unrelated page does not imply an unsaved review has been stored remotely.

## Files changed

- app/(app)/dashboard/page.tsx
- app/(app)/trainings/page.tsx
- app/(app)/squad/players/[id]/page.tsx
- components/layout/app-shell.tsx
- components/squad/attendance-controls.tsx
- components/squad/player-unavailability-form.tsx
- components/squad/session-review-form.tsx
- lib/i18n/german-ui-dictionary.ts
- lib/squad/attendance-actions.ts
- lib/squad/attendance-queries.ts
- lib/squad/attendance-utils.ts
- lib/squad/availability.ts
- lib/squad/player-hub.ts
- lib/squad/session-review-actions.ts
- package.json
- scripts/core-stability-regression.mjs
- scripts/core-stability-browser.mjs
- docs/core-stability-report.md

The pre-existing untracked file `works` was left untouched.

## Deployment checklist

1. No new Supabase migration is required. Do not apply replacement SQL.
2. Complete the authenticated acceptance run above before signing off stabilization.
3. Review/commit these changes and push only when ready. A push to the connected Production branch can trigger Vercel automatically.
4. After the approved deployment, repeat Past filtering, rating save/clear, availability propagation and Session Review save/reload against the deployed app.
5. For future schema-dependent changes: create and name the migration first, apply it to Production before the dependent app deployment, and list it explicitly in the deployment checklist.
