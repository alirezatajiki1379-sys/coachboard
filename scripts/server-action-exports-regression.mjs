import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ignoredDirectories = new Set([".git", ".next", "node_modules"]);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : sourceFiles(join(directory, entry.name));
    }
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [join(directory, entry.name)] : [];
  });
}

const files = sourceFiles(root).filter((file) => /^"use server"/.test(readFileSync(file, "utf8")));

assert.ok(files.length > 0, "The audit found use server modules");

const invalidExports = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const runtimeExports = source.match(/^export\s+(?:default\s+)?(?:const|let|var|class|function|\{)[^\n]*/gm) ?? [];
  for (const declaration of runtimeExports) {
    if (!/^export\s+(?:default\s+)?async\s+function\b/.test(declaration)) {
      invalidExports.push(`${relative(root, file)}: ${declaration}`);
    }
  }
}

assert.deepEqual(
  invalidExports,
  [],
  `A use server module may only runtime-export async functions:\n${invalidExports.join("\n")}`
);

console.log(`Server Action export audit: PASS (${files.length} use server modules)`);
