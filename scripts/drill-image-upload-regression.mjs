import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DrillImageError, maxDrillImageBytes, validateDrillImageFile } from "../lib/drills/image-upload.ts";

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

console.log("PASS: JPEG, PNG, WebP, invalid content, 10 MB limit, private bucket schema and Storage RLS.");
