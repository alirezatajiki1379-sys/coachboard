import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DrillImageError, maxDrillImageBytes, validateDrillImageFile } from "../lib/drills/image-upload.ts";
import { resolveStoredDrillVisual } from "../lib/drills/graphics.ts";

const jpeg = new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])], "drill.jpg", { type: "image/jpeg" });
const png = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "drill.png", { type: "image/png" });
const webp = new File([new TextEncoder().encode("RIFF0000WEBP")], "drill.webp", { type: "image/webp" });

assert.equal(await validateDrillImageFile(jpeg), "image/jpeg");
assert.equal(await validateDrillImageFile(png), "image/png");
assert.equal(await validateDrillImageFile(webp), "image/webp");

await assert.rejects(
  () => validateDrillImageFile(new File(["not an image"], "fake.jpg", { type: "image/jpeg" })),
  (error) => error instanceof DrillImageError && error.code === "unsupported_format"
);

const storedPath = "user-id/drill-id/persisted-image.webp";
const signedDisplayUrl = "https://project.supabase.co/storage/v1/object/sign/drill-images/persisted-image.webp?token=fresh";
const persistedVisual = resolveStoredDrillVisual({
  drill_id: "drill-id",
  canvas_json: { version: 1, pitch: "Full football pitch", pitchStyle: "Plain green", objects: [] },
  visual_source: "upload",
  uploaded_image_path: storedPath,
  uploaded_image_mime_type: "image/webp",
  uploaded_image_size_bytes: 512
}, signedDisplayUrl);
assert.equal(persistedVisual.source, "upload");
assert.equal(persistedVisual.uploadedImagePath, storedPath);
assert.equal(persistedVisual.uploadedImageUrl, signedDisplayUrl);
assert.doesNotMatch(persistedVisual.uploadedImagePath ?? "", /^(blob:|data:|https?:)/);

const editorVisualWithPreservedUpload = resolveStoredDrillVisual({
  drill_id: "drill-id",
  canvas_json: { version: 1, pitch: "Full football pitch", pitchStyle: "Plain green", objects: [] },
  visual_source: "editor",
  uploaded_image_path: storedPath,
  uploaded_image_mime_type: "image/webp",
  uploaded_image_size_bytes: 512
}, signedDisplayUrl);
assert.equal(editorVisualWithPreservedUpload.source, "editor");
assert.equal(editorVisualWithPreservedUpload.uploadedImagePath, storedPath);

await assert.rejects(
  () => validateDrillImageFile(new File([new Uint8Array(maxDrillImageBytes + 1)], "large.jpg", { type: "image/jpeg" })),
  (error) => error instanceof DrillImageError && error.code === "file_too_large"
);

const migration = await readFile(new URL("../supabase/migrations/20261001_drill_image_upload.sql", import.meta.url), "utf8");
assert.match(migration, /visual_source text not null default 'editor'/);
assert.match(migration, /uploaded_image_path text/);
assert.match(migration, /'drill-images'/);
assert.match(migration, /false,\s*10485760/);
assert.match(migration, /users can read own drill images/);
assert.match(migration, /users can upload own drill images/);
assert.match(migration, /users can delete own drill images/);

const form = await readFile(new URL("../components/drills/drill-form.tsx", import.meta.url), "utf8");
const actions = await readFile(new URL("../lib/drills/actions.ts", import.meta.url), "utf8");
const nextConfig = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
assert.match(form, /createBrowserClient/);
assert.match(form, /storage\.from\(drillImageBucket\)\.upload/);
assert.doesNotMatch(form, /formData\.set\("uploadedImage"/);
assert.match(actions, /finalizePendingDrillImageUpload/);
assert.match(actions, /finalizeDrillVisualUpload/);
assert.match(actions, /completedImageUpload:/);
assert.doesNotMatch(actions, /finalizePendingDrillImageUpload[\s\S]*?redirect\(destination/);
assert.match(form, /finalizationStarted = true/);
assert.match(form, /if \(!finalizationStarted\)/);
assert.match(form, /router\.push\(result\.completedImageUpload\.destination\)/);
assert.doesNotMatch(nextConfig, /bodySizeLimit/);

console.log("PASS: JPEG, PNG, WebP, invalid content, 10 MB limit, stable finalization handshake, direct-to-Supabase upload, private bucket schema and Storage RLS.");
