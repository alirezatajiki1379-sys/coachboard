import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const report = read("components/squad/player-conversation-report.tsx");
const reportPage = read("app/(app)/squad/players/[id]/report/page.tsx");
const actions = read("lib/squad/player-review-actions.ts");
const conversations = read("lib/squad/player-review-conversations.ts");
const hub = read("lib/squad/player-hub.ts");
const hubPage = read("app/(app)/squad/players/[id]/page.tsx");
const workspace = read("components/squad/coach-workspace.tsx");
const pack = read("app/(app)/squad/reports/page.tsx");
const globalStyles = read("app/globals.css");

assert.doesNotMatch(report, /summary\.highestRatedArea[\s\S]{0,160}strengths/, "Strengths are never inferred from the highest rating");
assert.doesNotMatch(report, /summary\.lowestRatedArea[\s\S]{0,160}developmentFocus/, "Development focus is never inferred from the lowest rating");
assert.match(report, /name="strengths"/); assert.match(report, /name="developmentFocus"/);
assert.match(report, /name="playerPerspective"/); assert.match(report, /name="coachSummary"/); assert.match(report, /name="agreedNextSteps"/); assert.match(report, /name="nextReviewOn"/);
assert.match(actions, /status: complete \? "finalized" : "draft"/, "Draft and completion states are explicit");
assert.match(actions, /content_snapshot: contentSnapshot/, "Completion persists the report snapshot");
assert.match(actions, /player_review_conversation_notes/, "Selected notes use the existing junction table");
assert.match(actions, /last_performance_review_date/, "Completion updates the canonical review date");
assert.match(reportPage, /conversation\?\.status === "finalized"[\s\S]*completedSnapshot/, "Completed conversations load their stored snapshot");
assert.match(reportPage, /The completed Player Conversation snapshot is unavailable/, "A missing historical snapshot never silently falls back to live analytics");
assert.match(hub, /conversations\.filter\(\(item\) => item\.status === "finalized"\)/, "Only completed conversations enter the timeline");
assert.match(hubPage, /LatestReviewCard/); assert.match(hubPage, /ReviewsTab/, "Player Hub exposes Latest Review and Reviews");
assert.match(report, /const safePlayer = \{[\s\S]*firstName: player\.firstName[\s\S]*jerseyNumber: player\.jerseyNumber/, "Snapshot uses an identity allowlist instead of the full Player record");
assert.match(report, /coachNote: undefined/, "Player Conversation snapshots strip private Training notes");
assert.match(workspace, /Generate reports|Reports erstellen/, "Squad bulk action exposes report generation");
assert.match(pack, /\.is\("archived_at", null\)\.is\("deleted_at", null\)/, "Bulk packs reject archived and deleted Players server-side");
assert.doesNotMatch(pack, /completePlayerConversation|player_review_conversations/, "Bulk packs never complete conversations");
assert.match(globalStyles, /\.report-pack-item \+ \.report-pack-item[\s\S]*page-break-before:\s*always/, "Every subsequent Player starts on a new print page");
assert.doesNotMatch(pack, /<style>|@page/, "Bulk reports use the shared print stylesheet without competing page rules");
assert.match(pack, /<PrintButton \/>/, "One report-pack print action is available");
assert.match(conversations, /contentSnapshot: row\.content_snapshot/, "Conversation history retains its snapshot");

console.log("Player Report 2.0 completion regression: PASS (26 checks)");
