import assert from "node:assert/strict";
import { File as NodeFile } from "node:buffer";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";

if (!globalThis.File) globalThis.File = NodeFile;
const { parseDrillImportPackage } = await import("../lib/drills/import-package.ts");
const { findDrillDuplicate, parseDrillImportManifest } = await import("../lib/drills/import-schema.ts");

const manifest = {
  schemaVersion: 1,
  batch: { name: "Regression", source: { publisher: "Synthetic publisher" } },
  drills: [
    baseDrill("source-1", "Passing square", "images/a.jpg"),
    baseDrill("source-2", "Finishing wave", "images/b.png"),
    baseDrill("source-3", "Transition game", "images/c.webp"),
    baseDrill("duplicate-title", "Passing square"),
    { title: "Incomplete" }
  ]
};
const parsedManifest = parseDrillImportManifest(manifest);
assert.equal(parsedManifest.drills.length, 5);
assert.equal(parsedManifest.drills[4].issues.filter((issue) => issue.severity === "error").length, 2);
assert.equal(parsedManifest.drills[4].item.durationMinutes, 10);

const zip = new JSZip();
zip.file("drills.json", JSON.stringify(manifest));
zip.file("images/a.jpg", Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]));
zip.file("images/b.png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
zip.file("images/c.webp", new TextEncoder().encode("RIFF0000WEBP"));
const valid = await packageFile(zip);
const parsed = await parseDrillImportPackage(valid);
assert.equal(parsed.images.size, 3);
assert.equal(parsed.manifest.drills[0].issues.some((issue) => issue.field === "image"), false);

await assert.rejects(() => parseDrillImportPackage(new File(["bad"], "bad.zip", { type: "application/zip" })), /invalid|corrupted/i);
const missingManifest = new JSZip(); missingManifest.file("images/a.jpg", Uint8Array.from([0xff, 0xd8, 0xff]));
await assert.rejects(() => packageFile(missingManifest).then(parseDrillImportPackage), /drills\.json/i);
const unsupported = new JSZip(); unsupported.file("drills.json", JSON.stringify({ ...manifest, schemaVersion: 99 }));
await assert.rejects(() => packageFile(unsupported).then(parseDrillImportPackage), /schema version/i);
const missingImageManifest = structuredClone(manifest); missingImageManifest.drills[0].image = "images/missing.jpg";
const missingImageZip = new JSZip(); missingImageZip.file("drills.json", JSON.stringify(missingImageManifest));
const missingImage = await packageFile(missingImageZip).then(parseDrillImportPackage);
assert.equal(missingImage.manifest.drills[0].issues.some((issue) => issue.code === "missing_file"), true);
const invalidImageZip = new JSZip(); invalidImageZip.file("drills.json", JSON.stringify({ ...manifest, drills: [baseDrill("bad", "Bad image", "images/bad.jpg")] })); invalidImageZip.file("images/bad.jpg", "not an image");
const invalidImage = await packageFile(invalidImageZip).then(parseDrillImportPackage);
assert.equal(invalidImage.manifest.drills[0].issues.some((issue) => issue.code === "invalid_file"), true);
const traversalZip = new JSZip(); traversalZip.file("drills.json", JSON.stringify({ ...manifest, drills: [baseDrill("unsafe", "Unsafe", "../bad.jpg")] }));
assert.equal(parseDrillImportManifest(JSON.parse(await traversalZip.file("drills.json").async("string"))).drills[0].issues.some((issue) => issue.code === "unsafe_path"), true);

const candidates = [{ id: "existing", title: "Passing square", importExternalId: "source-1", sourceTitle: "Book", sourcePage: "4" }];
assert.equal(findDrillDuplicate(parsedManifest.drills[0].item, candidates)?.kind, "external_id");
assert.equal(findDrillDuplicate({ ...parsedManifest.drills[1].item, externalId: undefined, source: {} }, candidates), undefined);
assert.equal(findDrillDuplicate({ ...parsedManifest.drills[1].item, externalId: undefined, title: "Passing square", source: {} }, candidates)?.safeToUpdate, false);

const largeManifest = { schemaVersion: 1, batch: { name: "55 Drills" }, drills: Array.from({ length: 55 }, (_, index) => baseDrill(`large-${index}`, `Synthetic Drill ${index + 1}`)) };
assert.equal(parseDrillImportManifest(largeManifest).drills.length, 55);

const component = await readFile(new URL("../components/drills/drill-import-studio.tsx", import.meta.url), "utf8");
const actions = await readFile(new URL("../lib/drills/import-actions.ts", import.meta.url), "utf8");
const docs = await readFile(new URL("../docs/drill-import-format.md", import.meta.url), "utf8");
assert.match(component, /Select all ready/);
assert.match(component, /Alle bereiten auswählen/);
assert.match(component, /pageSize = 20/);
assert.match(component, /storeDrillImportPackage/);
assert.match(actions, /finalizeDrillVisualUpload/);
assert.match(actions, /safeToUpdate/);
assert.match(actions, /archiveDrillImportBatch/);
assert.match(docs, /schemaVersion/);

console.log("PASS: manifest, ZIP, JPG/PNG/WebP, invalid packages/images, traversal, defaults, duplicates, recovery hooks, 55-Drill scaling, EN/DE and batch archive coverage.");

function baseDrill(externalId, title, image) { return { externalId, title, mainFocus: "Passing", drillType: "Technical drill", durationMinutes: 10, minPlayers: 4, maxPlayers: 8, image, source: { title: "Synthetic source", page: externalId } }; }
async function packageFile(value) { return new File([await value.generateAsync({ type: "uint8array" })], "package.zip", { type: "application/zip" }); }
