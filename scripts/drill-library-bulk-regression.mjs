import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  addDrillTags,
  chunkDrillBulkItems,
  groupDrillsByResultingTags,
  normalizeBulkDrillIds,
  normalizeBulkDrillTags,
  removeDrillTags
} from "../lib/drills/bulk.ts";

assert.deepEqual(normalizeBulkDrillIds(["a", "a", " ", "b"]), ["a", "b"], "selection IDs are trimmed and deduplicated");
assert.equal(normalizeBulkDrillIds(Array.from({ length: 2_100 }, (_, index) => `drill-${index}`)).length, 2_000, "selection has a defensive upper bound");
assert.deepEqual(chunkDrillBulkItems(Array.from({ length: 501 }, (_, index) => index)).map((chunk) => chunk.length), [100, 100, 100, 100, 100, 1], "500+ drills are processed in bounded batches");

assert.deepEqual(normalizeBulkDrillTags([" Transition ", "transition", "Finishing"]), ["Transition", "Finishing"], "tags are case-insensitively deduplicated");
assert.deepEqual(addDrillTags(["Passing"], ["Transition", "passing"]), ["Passing", "Transition"], "adding tags preserves unrelated existing tags");
assert.deepEqual(removeDrillTags(["Passing", "Transition", "Finishing"], ["transition"]), ["Passing", "Finishing"], "removing tags removes only requested tags");

const grouped = groupDrillsByResultingTags([
  { id: "one", tags: ["Passing"], is_favorite: false, archived_at: null, deleted_at: null },
  { id: "two", tags: ["Passing"], is_favorite: true, archived_at: null, deleted_at: null },
  { id: "three", tags: ["Finishing"], is_favorite: false, archived_at: null, deleted_at: null }
], ["Transition"], "add");
assert.equal(grouped.length, 2, "tag writes are grouped by resulting tag set");
assert.deepEqual(grouped.find((group) => group.tags.includes("Passing"))?.ids, ["one", "two"], "matching tag updates share one bulk write");

const [actionsSource, managerSource, cardSource] = await Promise.all([
  readFile(new URL("../lib/drills/actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../components/drills/drill-library-bulk-manager.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/drills/drill-card.tsx", import.meta.url), "utf8")
]);

assert.match(actionsSource, /\.eq\("user_id", user\.id\)/, "bulk writes remain user scoped");
assert.match(actionsSource, /deleted_at: new Date\(\)\.toISOString\(\)/, "bulk delete uses canonical soft-delete semantics");
assert.doesNotMatch(actionsSource.slice(actionsSource.indexOf("bulkMoveDrillsToTrash")), /deleteDrillImageAsset/, "soft delete does not remove restorable images");
assert.match(managerSource, /Select all visible/, "visible result selection is explicit");
assert.match(managerSource, /Selection stays when filters change/, "filter-selection scope is explained");
assert.match(managerSource, /bulkMoveDrillsToTrash/, "delete confirmation calls the canonical Trash action");
assert.match(managerSource, /role="dialog"/, "bulk confirmation uses an accessible dialog");
assert.match(cardSource, /aria-label=\{selectionLabel \?\? `Select Drill:/, "card selection checkbox has an accessible label");

console.log("Drill Library bulk regression checks passed.");
