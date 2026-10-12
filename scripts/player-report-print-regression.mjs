import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const styles = read("app/globals.css");
const shell = read("components/layout/app-shell.tsx");
const report = read("components/squad/player-conversation-report.tsx");
const pack = read("app/(app)/squad/reports/page.tsx");

assert.match(shell, /app-shell-content[\s\S]*lg:pl-\[var\(--app-sidebar-width\)\]/, "The shell has a stable semantic print hook without changing its desktop layout");
assert.match(styles, /\.app-shell-content\s*\{[\s\S]*?padding-left:\s*0 !important;[\s\S]*?width:\s*100% !important;[\s\S]*?max-width:\s*none !important;[\s\S]*?\}/, "Printing removes the dynamic sidebar reservation");
assert.match(styles, /\.app-main\s*\{[\s\S]*?width:\s*100% !important;[\s\S]*?max-width:\s*none !important;[\s\S]*?padding:\s*0 !important;[\s\S]*?margin:\s*0 !important;[\s\S]*?\}/, "The printable app content uses the available page width");
assert.match(styles, /@page player-report\s*\{[\s\S]*?size:\s*A4 portrait;[\s\S]*?margin:\s*10mm 12mm;[\s\S]*?\}/, "Player Reports have one canonical A4 portrait definition");
assert.match(styles, /@page staff-brief\s*\{/, "The named Staff Brief page definition remains intact");
assert.match(styles, /\.player-report-sheet\s*\{\s*page:\s*player-report;/, "Player Report sheets opt into their named page");
assert.match(report, /player-report-header-grid/, "The report header has a print-specific two-column layout hook");
assert.match(report, /player-report-identity-grid/, "The Player Card has a compact horizontal print grid");
assert.match(report, /player-report-metrics-five/, "Attendance metrics use a compact print grid");
assert.match(report, /player-report-metrics-four/, "Performance metrics use a compact print grid");
assert.doesNotMatch(report, /<style>|@page/, "The individual report has no competing inline print rules");
assert.doesNotMatch(pack, /<style>|@page/, "The bulk report has no competing inline print rules");
assert.match(styles, /\.report-pack-item \+ \.report-pack-item\s*\{[\s\S]*?break-before:\s*page;[\s\S]*?page-break-before:\s*always;/, "Every subsequent bulk Player starts on a new page");
assert.doesNotMatch(report, /function ReportSection[\s\S]{0,180}print-avoid-break/, "Potentially long report sections can break naturally");

console.log("Player Report print regression: PASS (14 checks)");
