# CHECK-IN 2.1 - INLINE OVERALL RATING

Validated 2026-11-04 against origin/main `27a819a` in an isolated worktree.

## Implementation

The existing Check-in 2.0 cards had no rating UI, although the canonical
`updateAttendanceRatingInline` action already existed. Check-in now reuses that
action for instant overall ratings. No default rating is introduced.

Optional details reuse `updateAttendanceRating`. Omitting `overallRating` now
preserves the current database value; explicitly submitting an empty value still
clears it. Category suggestions do not write overall ratings. Nonblank coach
notes preserve their exact text, including whitespace and line breaks.

One transition per player serializes attendance and rating writes. Other players
remain interactive. Exception attendance must be saved before its rating can be
saved. Failed inline writes roll back; failed detail saves keep the form values.
Focus returns after an inline save only if the coach has not moved elsewhere.

In Open, the currently interacted-with card stays available for optional rating
until another card is clicked or the filter changes. It does not count as open.
Removal happens after click, never during pointer-down, to avoid shifting the
next click target. No rating-based completion rule or new filter was added.

## Results

PASS below means local automated validation and/or scoped source inspection,
not an authenticated Production end-to-end test. Browser tests render the real
components with fictional persisted fixtures and simulated network failures.
Server-action tests execute the real actions against an in-memory query adapter.
No Production database writes were made.

| Check | Result |
| --- | --- |
| Present -> Overall Rating visible | PASS |
| Late -> Overall Rating visible | PASS |
| Left early -> Overall Rating visible | PASS |
| Absent -> Rating hidden | PASS |
| Inline 1-5 Rating | PASS |
| Instant save | PASS |
| Optimistic update | PASS |
| Rollback on failure | PASS |
| Clear Rating to null | PASS |
| Rating optional | PASS |
| Missing Rating does not affect Check-in completion | PASS |
| Rating Details disclosure | PASS |
| Technique | PASS |
| Game Understanding | PASS |
| Intensity | PASS |
| Behavior | PASS |
| Coach Note, including whitespace and failed save recovery | PASS |
| Sensitive Note | PASS |
| Details preserve manual Overall Rating | PASS |
| No automatic Overall Rating from attendance or categories | PASS |
| Dedicated Ratings page preserved | PASS |
| Check-in / Ratings canonical record consistency | PASS |
| Absent clears performance Rating | PASS |
| Late penalty semantics preserved | PASS |
| Left early participation semantics preserved | PASS |
| Bulk attendance preserved | PASS |
| Analytics semantics unchanged | PASS |
| Player Hub unchanged | PASS |
| German | PASS |
| English | PASS |
| Mobile 320 | PASS |
| Tablet 768 | PASS |
| Desktop 1440 | PASS |
| Keyboard, aria-pressed, focus retention, no focus stealing | PASS |
| Check-in browser regression | PASS |
| Rating defaults regression | PASS |
| Training Workflow regression | PASS |
| Attendance regressions | PASS |
| Analytics correctness | PASS |
| Core stability | PASS |
| Strict i18n | PASS |
| TypeScript | PASS |
| ESLint | PASS |
| Production build | PASS |

## Commands Executed

```sh
npm run test:check-in-2
node scripts/check-in-inline-rating-regression.mjs
npm run test:rating-defaults
npm run test:training-workflow
npm run test:apply-as-expected
npm run test:attendance-reasons
npm run test:actual-attendance
npm run test:late-cancellation
npm run test:analytics
npm run test:analytics-2
npm run test:core-stability
npm run typecheck
npm run lint
npm run i18n:check
npm run i18n:audit:strict
npm run build
git diff --check
```

Browser runners use the existing `COACHBOARD_QA_DEPS` and
`COACHBOARD_QA_CHROME` conventions. Run a build first for compiled CSS.
Screenshots were inspected at 320 and 1440 pixels; layout assertions also ran
at 768 pixels in both languages.

## Files Changed

- `components/squad/attendance-controls.tsx`
- `lib/squad/attendance-actions.ts`
- `lib/i18n/workflow-copy-de.ts`
- `scripts/check-in-2-regression.mjs`
- `scripts/check-in-inline-rating-regression.mjs`
- `scripts/core-stability-regression.mjs`
- `docs/check-in-2-1-report.md`

No Drill Experience, Analytics definitions, Player Hub, schema, or migration
files changed. Unfinished work in the primary working tree was not staged,
committed, reset, stashed, or edited.

## Production Checklist

PENDING PRODUCTION MIGRATIONS: NONE (this milestone).

Normal push to origin/main is authorized for this change; Vercel should deploy
from main. Verify deployment status rather than assuming the push is live.

After deployment, smoke-test with a test player: Present -> rate 4 -> reload ->
open dedicated Ratings -> return -> toggle 4 off. Save detailed categories and
a sensitive note, then verify an Absent save clears all performance ratings.
Repeat Late and Left early, and check that unrated attendance can complete.

Remaining validation limit: no signed-in live Supabase/Vercel end-to-end test
was performed. Existing non-blocking Browserslist and Node loader warnings
remain; dependencies were not changed for this scoped task.
