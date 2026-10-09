import { File as NodeFile } from "node:buffer";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseDrillImportPackage } from "../lib/drills/import-package.ts";

if (!globalThis.File) globalThis.File = NodeFile;

const input = process.argv[2];
if (!input) {
  console.error("Usage: npm run validate:drill-import -- /path/to/coachboard-import.zip");
  process.exitCode = 1;
} else {
  try {
    const path = resolve(input);
    const bytes = await readFile(path);
    const file = new File([bytes], path.split("/").pop() ?? "coachboard-import.zip", { type: "application/zip" });
    const parsed = await parseDrillImportPackage(file);
    const errors = parsed.manifest.drills.flatMap((entry) => entry.issues.filter((issue) => issue.severity === "error").map((issue) => `Drill ${entry.index + 1}: ${issue.field} (${issue.code})`));
    const warnings = parsed.manifest.drills.flatMap((entry) => entry.issues.filter((issue) => issue.severity === "warning"));
    console.log(`PASS: schema v${parsed.manifest.schemaVersion}, ${parsed.manifest.drills.length} Drills, ${parsed.images.size} validated images, ${warnings.length} warnings.`);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
