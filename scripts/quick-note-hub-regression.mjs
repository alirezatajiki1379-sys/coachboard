import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const actions = read("lib/squad/player-note-actions.ts");
const notes = read("lib/squad/player-notes.ts");
const notesComponent = read("components/squad/player-notes.tsx");
const conversations = read("lib/squad/player-review-conversations.ts");
const hub = read("lib/squad/player-hub.ts");

assert.match(actions, /from\("player_notes"\)\.insert/, "Quick Note writes to the canonical player_notes table");
assert.match(actions, /revalidatePlayer\(playerId\)/, "A successful Quick Note refreshes the Player Hub");
assert.match(actions, /revalidatePath\(`\/squad\/players\/\$\{playerId\}`\)/, "The Player Overview path is revalidated");
assert.match(notesComponent, /action=\{action\}/, "Quick Note stays in the inline Server Action flow");
assert.match(notesComponent, /formRef\.current\?\.reset\(\)/, "The input clears only after a successful action");
assert.doesNotMatch(notesComponent, /router\.push|window\.location/, "Quick Note never navigates away from the Player profile");
assert.match(notes, /if \(error\) throw new Error\(error\.message\)/, "Player Note read failures remain visible and are not silently hidden");
assert.match(conversations, /listPlayerReviewConversationsForHub[\s\S]*try[\s\S]*listPlayerReviewConversations[\s\S]*catch[\s\S]*player_hub_review_conversations_load_failed[\s\S]*return \[\]/, "Optional Player Conversation failures degrade only the review widgets");
assert.match(hub, /listPlayerReviewConversationsForHub\(db, userId, playerId\)/, "The Player Hub uses the isolated optional review loader");
assert.doesNotMatch(hub, /listPlayerReviewConversations\(db, userId, playerId\)/, "The Player Hub no longer places the strict review loader in its critical Promise.all");
assert.match(hub, /for \(const note of notes\)/, "Saved Quick Notes still enter the unified Player timeline");
assert.match(hub, /conversations\.filter\(\(item\) => item\.status === "finalized"\)/, "Finalized conversations still enter History when available");

console.log("Quick Note Player Hub regression: PASS (12 checks)");
