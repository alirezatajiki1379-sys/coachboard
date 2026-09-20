# COACHBOARD SQUAD PLANNER UX REPORT

## Implementation

1. **Discoverability:** Squad now has a prominent Planner action without adding a sidebar item.
2. **Squad CTA:** The header button opens `/squad/planner` through Next.js navigation, with English and German labels.
3. **Hierarchy:** The active plan, formation/mode, XI count, pitch, available players, selected player, depth and plan actions have clearer separation. The pitch remains the focal area.
4. **Custom formation:** A Custom plan has an Edit formation mode for moving slots, changing role/label, adding/removing slots, resetting and saving. A built-in formation can be duplicated as a Custom plan without modifying its source.
5. **Coordinates:** Slots use existing normalized 0-100 pitch percentages, independent of browser pixels. The current planner architecture requires exactly 11 positions; add/remove is possible while editing, but save validates the final count.
6. **Labels:** Each custom slot stores its canonical role and optional display label separately.
7. **External drag:** Available players can be dragged onto pitch slots. Touch users can select a player and tap a slot.
8. **Occupied slots:** A dragged starter swaps with the occupant when it comes from another slot; a player from outside replaces the occupant, who returns to the available pool. A player is never intentionally a starter in two slots.
9. **Drag overlay:** A lightweight ghost follows the pointer during native drag.
10. **Drop feedback:** Targets highlight, unassigned is a drop target, invalid drops show a message, and player/slot selection is visible.
11. **Animation:** Pitch cards use short local transitions; no database writes happen during pointer movement.
12. **Persistence:** Custom geometry, role, label and order save to existing `squad_tactical_plan_slots` rows. Assignment changes save on drop/tap only. Live Supabase save/reopen was not tested without a dedicated authenticated test account.
13. **Failure handling:** Failed player assignment restores the prior client state and shows an error. The server attempts to restore prior starter flags after a partial write. Multi-request saves are not a fully atomic database transaction.
14. **Depth:** Existing assignments and ranking are retained; custom geometry is also used in its depth view. Role-fit data is recalculated when a custom slot's canonical role changes.
15. **Existing plans:** Built-in formation definitions, plan operations, depth roles and auto-fill code paths remain in place. The browser fixture exercises planner interactions; live plan-management and auto-fill writes still need a signed-in check.
16. **Mobile:** The pitch and controls fit 320-430px fixtures, including a 390px touch fallback. Tablet and desktop widths were checked too.
17. **Accessibility:** Slot selection supports keyboard activation; player controls expose selected state; Edit formation has a distinct mode. Native HTML drag remains primarily a pointer interaction, with tap controls as the mobile fallback.
18. **EN/DE:** New planner controls and the Squad CTA have both languages. The repository i18n parity check passes. A full authenticated copy review remains advisable.
19. **Migrations:** None for this feature. The existing slot table already stores normalized `x`, `y`, `code`, `label` and order.
20. **Checks:** `npm run build`, `npm run lint`, `npm run typecheck`, `npm run i18n:check`, `npm run db:check`, planner regression test and fictional-data Playwright suite passed. Browser widths: 320, 360, 375, 390, 430, 768, 1440; English and German.
21. **Production action:** No planner SQL. Review the existing unrelated dirty worktree before committing. Push the intended changes to `main` to trigger a Vercel build, then check authenticated persistence, plan duplication, team isolation and auto-fill on the deployed app. Do not apply unrelated pending migrations solely for this planner change.

## SQUAD PLANNER REGRESSION

| Check | Result | Evidence / limit |
| --- | --- | --- |
| Planner prominent from Squad | PASS | Header CTA and browser fixture |
| Open Planner | PASS | Browser fixture |
| Built-in Formation | PASS | 11-slot geometry and browser fixture |
| Custom Formation | PASS | Edit mode and fictional-data browser fixture |
| Move custom position | PASS | Normalized-coordinate browser assertion |
| Add position | PASS | Browser fixture |
| Remove position | PASS | Browser fixture |
| Persist coordinates | WARNING | Server mapping tested; live Supabase reopen not tested |
| External Player to slot | PASS | Mobile tap and desktop drag fixture |
| Slot to slot | PASS | Browser fixture |
| Swap Players | PASS | Browser fixture |
| Player to unassigned | PASS | Browser fixture |
| Drag visual feedback | PASS | Browser fixture and screenshot inspection |
| Drop target feedback | PASS | Browser fixture |
| No duplicate XI Player | PASS | Occupied-slot replacement assertion and server checks |
| Depth | WARNING | Existing path retained; live persistence not tested |
| Auto-fill | WARNING | Existing path retained; live action not tested |
| Mobile | PASS | 320-430px browser fixture; 390px flow |
| English | PASS | Browser fixture and i18n check |
| German | PASS | Browser fixture and i18n check |

## PENDING PRODUCTION MIGRATIONS

None required by this Squad Planner upgrade. This does not certify the unrelated, uncommitted migration in the current worktree or the state of Production Supabase.
