# COACHBOARD MOBILE UX AUDIT

Date: 2026-09-20

## Outcome and Evidence Limits

Responsive fixes are implemented. Automated component checks pass at 320, 360,
375, 390, 430, 768 and 1440px in English and German. Chrome and WebKit were used
with actual application components, actual generated CSS and fictional records.
Landscape navigation was checked at 844x390; dialogs were checked with a 320px
height and a simulated keyboard-reduced visual viewport.

**Full authenticated mobile acceptance is not complete.** No signed-in test
session was available. The user indicated a test account may exist on the
deployed system, but no account was accessed and no Production data was changed.
WebKit automation is not a physical iPhone Safari/VoiceOver test.

PASS below means the stated component/layout test passed, not a claim that
Production saves, authentication or complete server-loaded pages were tested.
WARNING identifies missing live coverage or an existing issue outside this pass.
There are no remaining failures in the executed automated checks.

## Audit Matrix

| Area | Status | Evidence / remaining verification |
| --- | --- | --- |
| Navigation | PASS | Actual shell: drawer, Settings link target, Escape, desktop-resize cleanup, landscape scroll, dirty navigation dialog above drawer. Real Next.js signed-in transitions still require account walkthrough. |
| Dashboard | WARNING | Shared header/actions tested; responsive grids inspected. Signed-in dashboard and real counts not browser-tested. |
| Trainings | WARNING | Create form and header tested; overview grids inspected. Authenticated filters, lists and mutations remain manual QA. |
| Training detail | WARNING | Actual participant component tested, including long names; full server-loaded detail not opened signed in. |
| Quick Check-in | PASS | Actual controls, rating toggles, failed mutation rollback, 44px targets and responsive EN/DE rendering tested. Mutations mocked. |
| Session Review | PASS | Actual form, cumulative stars, long text after failed save, edits during pending save and responsive rendering tested. Mutations mocked. |
| Training Plans | WARNING | Actual create form and library candidate rendered at all widths. Populated saved-plan reordering/group workflows need authenticated QA. |
| Drill Library | PASS | Actual filters and card, title/action stacking, full material popover, Escape closing, responsive filter disclosure in Chrome/WebKit. Graphic rendering logic unchanged. |
| Squad | WARNING | Shell/subtabs tested; existing mobile cards inspected; removed sticky mobile filter bar and fixed saved-view minimum width. Real populated Squad not opened signed in. |
| Player Profile | WARNING | Actual create/edit form, history component, Development and availability form tested; full profile sections require live account walkthrough. |
| Availability | PASS | Actual medical/general form, School selection and date input at all widths; no database submission. |
| Attendance | WARNING | Check-in and participant components tested. Historical/overview server-loaded data not tested with account. |
| Ratings | PASS | Actual saved/default/toggle controls and failed-save preservation tested; no automatic writes on open. |
| Development | PASS | Actual populated/empty section and forms tested across widths and language changes. Database actions mocked. |
| Analytics | WARNING | Actual summary panels tested in EN/DE across widths. Full server-loaded page, filters and real-data table/chart cases still need account. |
| Action Center | WARNING | Grid/filter source inspected; loading/error components tested; fixed 320px skeleton overflow. Live action cards not tested. |
| Settings | WARNING | Responsive source inspected and drawer link checked. Account/Team setting writes not exercised. |
| Dialogs | PASS | Unsaved dialog tested for stacking, keyboard loop, Escape, reduced height and simulated keyboard viewport. Recovery/bulk/recurrence/email dialogs share the same sizing, portal and focus helper; individual destructive submissions not tested. |
| Forms | PASS | Player, Training, plan, drill, material row, absence, review and 49-row import mapping fixtures tested. Database save/load not covered by layout fixtures. |
| English | PASS | Requested viewport matrix and tested workflows; not a full linguistic audit. |
| German | WARNING | Responsive matrix passes, including long labels. Existing secondary English strings remain in places such as the preview placeholder, age label, material-more label and position text; this pass does not certify complete localization. |

## Bugs Found and Fixed

1. Drawer content had no scroll container: lower links and account actions could
   become unreachable in short landscape viewports or when the Team menu expanded.
   The drawer now scrolls, respects safe areas and closes when resized to desktop,
   restoring the previous body scroll state.
2. The mobile header squeezed brand/logout text. It now uses the existing labelled
   icon-only logout variant and 44px menu/close targets. Pending navigation remains
   visible after the drawer closes.
3. Small form text could trigger iOS focus zoom. Screen-only shared rules keep
   text/date/select/textarea controls at 16px on phones and allow them to shrink.
   Checkbox/radio/range/color/hidden controls are excluded from input sizing.
4. Shared buttons had fixed 40px heights. Mobile shared buttons now have minimum
   44px dimensions and can grow for wrapped labels. Desktop sizing is retained.
5. Squad tabs wrapped into rows; shared mobile tabs now scroll horizontally, and
   Squad links expose the active page. Profile tab links have 44px targets.
6. Mobile sticky Squad/participant controls consumed too much vertical space.
   They remain sticky only on desktop. A 288px minimum saved-view menu width was
   also restricted to desktop. Participant metrics use two phone columns.
7. Drill filters occupied a long permanent column. Search/apply stay visible;
   optional filters can collapse on phones and show automatically on tablet/desktop.
   Applied optional filters start expanded. All original controls remain in the
   same GET form; collapsed fields still submit. Explicit responsive state fixes
   WebKit's inability to expose a closed details element using CSS alone.
8. Enlarged drill action buttons squeezed the title. Phone card actions now sit
   below the title. Material popovers anchor inside the card, with bounded vertical
   scrolling, instead of overflowing left when the trigger wraps near the left edge.
9. Rating buttons were 36-40px. Numeric ratings and review stars are now 44px, with
   tighter review padding/gaps to fit small phones. No rating logic changed.
10. Long dialogs could exceed the screen. Shared panel sizing/scrolling now uses
    dynamic viewport height and safe-area allowances. A portal tracks
    `visualViewport.height/offsetTop` for keyboard-reduced Safari viewports.
11. Unsaved warnings were below the mobile drawer and trapped inside page stacking
    contexts. Dialogs now portal outside those contexts, above the drawer, retaining
    locale context. Focus enters the panel, Tab wraps, Escape dismisses and focus
    returns to the trigger. This does not change draft or save decisions.
12. Loading skeleton fixed/intrinsic widths overflowed at 320px. Skeleton widths
    are constrained and the Action Center grid child can shrink.

## Files Changed in This Pass

The working tree already contained localization work. That work was preserved;
the list below is specific to this mobile pass (some files also contain earlier edits).

- `app/globals.css`
- `app/layout.tsx`
- `app/(app)/actions/loading.tsx`
- `app/(app)/squad/loading.tsx`
- `app/(app)/squad/players/[id]/page.tsx` (tab target size only)
- `components/layout/app-shell.tsx`
- `components/layout/page.tsx`
- `components/ui/button.tsx`
- `components/drills/drill-card.tsx`
- `components/drills/drill-filters.tsx`
- `components/shared/dialog-portal.tsx` (new)
- `components/shared/use-dialog-focus.ts` (new)
- `components/shared/local-draft.tsx` (dialog presentation only)
- `components/shared/use-unsaved-changes-protection.tsx` (dialog presentation only)
- `components/squad/attendance-controls.tsx` (sizing only)
- `components/squad/session-review-form.tsx` (sizing only)
- `components/squad/coach-workspace.tsx`
- `components/squad/squad-nav.tsx`
- `components/squad/training-participants-table.tsx`
- `components/squad/training-event-actions.tsx` (dialog presentation only)
- `components/squad/training-bulk-manager.tsx` (dialog presentation only)
- `scripts/mobile-browser.mjs` (new)
- `scripts/core-stability-browser.mjs`
- `scripts/localization-browser.mjs`
- `scripts/localization-route-smoke.mjs`
- `docs/mobile-ux-audit.md` (this report)

No editor geometry, duration, materials, attendance/rating persistence,
authentication, templates or PDF/print logic was changed. Screen adaptations do
not replace the existing print rules. There are no schema or migration changes.

## Intentional Horizontal Scrolling

- Shared page tabs, including Squad navigation.
- Player Profile tab strip.
- Squad workspace view tabs and Check-in filter tabs.
- Import progress steps, detailed source-column mapping table, and raw sheet preview.
  Composite mapping summaries remain responsive, unframed groups/cards as before.
- Analytics drill-usage table (620px minimum).
- Desktop Squad/participant tables (900px minimum) where needed. Their existing
  phone/tablet card alternatives remain in use below the desktop breakpoint.
- Desktop Development table (920px minimum) and Analytics comparison table;
  existing mobile cards remain available.
- Drill editor canvas viewport when zoomed larger than its container, intentionally
  scrollable independently of the page. Detailed canvas work remains tablet/desktop-first.

No new whole-page overflow hiding was introduced. Browser tests inspect child
bounds as well as document width so existing shell clipping cannot conceal failures.

## Executed Checks

- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run i18n:check`: PASS, 440 keys in each locale.
- `npm run build`: PASS.
- All 11 existing `test:*` scripts: PASS (recurrence, calendar, positions, duplicate
  import, composite import, trial sync, availability, rating defaults, review,
  core stability, localization). Node emits existing module/loader warnings.
- `node scripts/mobile-browser.mjs`: PASS in Chrome and WebKit, EN/DE,
  320/360/375/390/430/768/1440px, including 49-row import mapping, material rows,
  drawer landscape, modal stacking/focus, reduced-height and simulated keyboard viewport.
- `node scripts/core-stability-browser.mjs`: PASS in Chrome and WebKit; Review,
  Check-in, Ratings, failure recovery and responsive checks. WebKit also verified
  the added 44px rating/status target assertions.
- `node scripts/localization-browser.mjs`: PASS, actual Analytics/Development/history
  components, language switching and responsive checks in both languages.
- `node scripts/localization-route-smoke.mjs`: PASS, 46 route requests per locale
  against the locally built server. Four public pages render; protected pages redirect
  to login. These redirects are NOT signed-in page coverage.
- `git diff --check`: PASS.

Browser scripts use optional QA dependencies installed outside the app via
`COACHBOARD_QA_DEPS`; they do not add test routes or data to Production. Chrome path
can be supplied with `COACHBOARD_QA_CHROME`. To repeat Safari-engine checks, use
`COACHBOARD_QA_WEBKIT=1` and the matching `PLAYWRIGHT_BROWSERS_PATH`. Styles default
to the production build; `COACHBOARD_QA_CSS` supports an explicitly generated QA stylesheet.

## Remaining Manual Acceptance

Using a dedicated test account and fictional records, at 390px in both languages:

1. Log in, open Dashboard, select the intended Team and verify drawer navigation.
2. Open Squad and a Player Profile. Scroll all tabs and open Add unavailability.
3. Enter School/Holiday dates and a long note, with the native phone keyboard open;
   save and reopen to verify the record and Team. Repeat a medical absence.
4. Open Trainings, then Participants. Confirm the same Team and correct player list.
5. Check in Present/Late, toggle a rating, change to Absent and choose a reason.
   Reopen to verify saved status and rating removal.
6. Open Ratings and Session Review. Enter long feedback, save and reopen. Test a
   network failure without losing text. Check cumulative stars.
7. Open a populated plan. Reorder drills using Up/Down, edit groups/durations and save.
8. Create/edit a drill, edit materials and a graphic. Use drawer navigation while
   dirty; verify the warning is above the drawer and Stay/Draft & leave work.
9. Open Analytics and Settings; use period filters and language switching. Confirm
   no controls are obscured and no unexpected full-page horizontal scrolling occurs.
10. Repeat at 375px, tablet, desktop and phone landscape. On a physical iPhone,
    verify browser toolbar collapse, home-indicator safe area, keyboard, VoiceOver
    and focus restoration. Exercise recovery, recurrence, bulk and email dialogs.

## Production Action

No Supabase SQL is required. No Production changes, commit, push or deployment were
performed. Review the working tree, including the earlier localization changes,
then commit and deploy through the existing GitHub/Vercel workflow. Complete the
authenticated test-account walkthrough before declaring mobile acceptance complete.
