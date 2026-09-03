import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sourceDirs = ["app", "components"];
const extensions = new Set([".tsx", ".ts", ".jsx", ".js"]);
const suspicious = [];

const allowPatterns = [
  /CoachBoard/,
  /^[A-Z]{1,4}$/,
  /^\/[a-z0-9/[\]()._-]+$/,
  /^#[a-z0-9-]+$/,
  /^[a-z0-9_.:-]+$/,
  /^https?:\/\//,
  /^mailto:/,
  /^aria-/,
  /^data-/,
  /^className$/,
  /^use client$/,
  /^force-dynamic$/,
  /^no-store$/,
  /^on|off$/,
  /^GET|POST|PUT|PATCH|DELETE$/,
  /^\d/
];

for (const dir of sourceDirs) {
  walk(path.join(root, dir));
}

const unique = [...new Map(suspicious.map((item) => [`${item.file}:${item.line}:${item.text}`, item])).values()];

if (unique.length) {
  console.warn(`i18n audit found ${unique.length} likely hardcoded user-facing string(s).`);
  for (const item of unique.slice(0, 200)) {
    console.warn(`- ${path.relative(root, item.file)}:${item.line}: ${item.text}`);
  }
  if (unique.length > 200) {
    console.warn(`...and ${unique.length - 200} more.`);
  }
  if (process.env.COACHBOARD_I18N_STRICT === "1") {
    process.exitCode = 1;
  }
} else {
  console.log("i18n audit passed: no likely hardcoded user-facing English strings found.");
}

function walk(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(path.join(target, entry));
    }
    return;
  }
  if (!extensions.has(path.extname(target))) return;
  const text = fs.readFileSync(target, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/(?:>|title=|aria-label=|placeholder=|label=)["{`']?([^"`'<>{}]*[A-Za-z][^"`'<>{}]*)["`'}]?/g)) {
      const value = match[1].trim();
      if (isAllowed(value)) continue;
      suspicious.push({ file: target, line: index + 1, text: value });
    }
  });
}

function isAllowed(value) {
  if (!value || value.length < 3) return true;
  if (!/[A-Za-z]/.test(value)) return true;
  if (!/[A-Z]/.test(value) && !/\s/.test(value)) return true;
  return allowPatterns.some((pattern) => pattern.test(value));
}
