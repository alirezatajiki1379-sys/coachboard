import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const schemaPath = path.join(root, "supabase", "schema.sql");
const sourceRoots = ["app", "components", "lib", "types"].map((dir) => path.join(root, dir));
const schema = readFileSync(schemaPath, "utf8");
const sqlKeywords = new Set([
  "constraint",
  "primary",
  "foreign",
  "unique",
  "check",
  "exclude"
]);

const tables = parseSchemaTables(schema);
const findings = [];

for (const filePath of sourceRoots.flatMap(walkSourceFiles)) {
  const source = readFileSync(filePath, "utf8");
  auditSupabaseChains(filePath, source, findings);
}

const failures = findings.filter((finding) => finding.severity === "FAIL");
const warnings = findings.filter((finding) => finding.severity === "WARNING");

if (failures.length || warnings.length) {
  console.log("Supabase schema consistency check");
  for (const finding of findings) {
    console.log(`${finding.severity}: ${relative(finding.file)}:${finding.line} ${finding.message}`);
  }
}

if (failures.length) {
  process.exitCode = 1;
} else {
  console.log("Supabase schema consistency check passed.");
}

function parseSchemaTables(sql) {
  const result = new Map();
  const tableBlockPattern = /create\s+table\s+if\s+not\s+exists\s+public\.([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\n\);/gi;
  for (const match of sql.matchAll(tableBlockPattern)) {
    const table = match[1];
    const columns = result.get(table) ?? new Set();
    for (const line of match[2].split("\n")) {
      const trimmed = line.trim();
      const column = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+/)?.[1];
      if (!column || sqlKeywords.has(column.toLowerCase())) continue;
      columns.add(column);
    }
    result.set(table, columns);
  }

  const alterBlockPattern = /alter\s+table\s+public\.([a-zA-Z0-9_]+)\s+add\s+column\s+if\s+not\s+exists\s+([\s\S]*?);/gi;
  for (const match of sql.matchAll(alterBlockPattern)) {
    const table = match[1];
    const columns = result.get(table) ?? new Set();
    const body = `add column if not exists ${match[2]}`;
    for (const columnMatch of body.matchAll(/add\s+column\s+if\s+not\s+exists\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+/gi)) {
      columns.add(columnMatch[1]);
    }
    result.set(table, columns);
  }

  return result;
}

function auditSupabaseChains(filePath, source, output) {
  const fromPattern = /\.from\(\s*["']([a-zA-Z0-9_]+)["']\s*\)/g;
  for (const fromMatch of source.matchAll(fromPattern)) {
    const table = fromMatch[1];
    const columns = tables.get(table);
    const line = lineNumber(source, fromMatch.index ?? 0);
    if (!columns) {
      output.push({ severity: "FAIL", file: filePath, line, message: `references unknown table "${table}"` });
      continue;
    }

    const chain = source.slice(fromMatch.index ?? 0, findChainEnd(source, (fromMatch.index ?? 0) + fromMatch[0].length));
    const referenced = new Set();

    for (const select of extractMethodStringArgs(chain, "select")) {
      for (const column of parseSelectColumns(select)) referenced.add(column);
    }

    for (const method of ["eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "not", "order", "contains", "containedBy", "like", "ilike"]) {
      for (const column of extractMethodStringArgs(chain, method)) referenced.add(normalizeColumnReference(column, table));
    }

    for (const method of ["insert", "update", "upsert"]) {
      for (const column of extractTopLevelObjectKeys(chain, method)) referenced.add(column);
    }

    for (const column of referenced) {
      if (!column || column === "*" || column.includes("*")) continue;
      if (column.includes(".") || column.includes("->") || column.includes(":")) continue;
      if (!columns.has(column)) {
        output.push({ severity: "FAIL", file: filePath, line, message: `references missing column "${table}.${column}"` });
      }
    }
  }
}

function extractMethodStringArgs(chain, method) {
  const values = [];
  const pattern = new RegExp(`\\.${method}\\(\\s*([\"'\`])([\\s\\S]*?)\\1`, "g");
  for (const match of chain.matchAll(pattern)) {
    values.push(match[2]);
  }
  return values;
}

function extractTopLevelObjectKeys(chain, method) {
  const values = [];
  const pattern = new RegExp(`\\.${method}\\(`, "g");
  for (const match of chain.matchAll(pattern)) {
    const openParen = (match.index ?? 0) + match[0].length - 1;
    const closeParen = findMatchingDelimiter(chain, openParen, "(", ")");
    if (closeParen < 0) continue;
    const args = chain.slice(openParen + 1, closeParen).trim();
    if (!args.startsWith("{")) continue;
    const closeBrace = findMatchingDelimiter(args, 0, "{", "}");
    if (closeBrace < 0) continue;
    const body = args.slice(1, closeBrace);
    for (const part of splitTopLevelCommas(body)) {
      const key = part.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/)?.[1];
      if (key) values.push(key);
    }
  }
  return values;
}

function parseSelectColumns(select) {
  const withoutNested = stripNestedSelects(select);
  return splitTopLevelCommas(withoutNested)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(/\s+/)[0])
    .map((part) => part.replace(/!inner|!left|!right|!full/g, ""))
    .map((part) => part.includes(":") ? part.split(":").at(-1) ?? "" : part)
    .map((part) => part.replace(/[^a-zA-Z0-9_.*-]/g, ""))
    .filter((part) => part && part !== "*" && !part.includes("*") && !part.includes("-"));
}

function stripNestedSelects(value) {
  let result = "";
  let depth = 0;
  for (const char of value) {
    if (char === "(") {
      result = result.replace(/[a-zA-Z_][a-zA-Z0-9_!]*\s*$/, "");
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) result += char;
  }
  return result;
}

function findMatchingDelimiter(source, openIndex, open, close) {
  let depth = 0;
  let quote = null;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];
    if (quote) {
      if (char === quote && previous !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function normalizeColumnReference(value, currentTable) {
  const column = value.trim();
  if (column.startsWith(`${currentTable}.`)) return column.slice(currentTable.length + 1);
  return column;
}

function findChainEnd(source, start) {
  const nextFrom = source.indexOf(".from(", start);
  const nextAwait = source.indexOf("\n  const ", start);
  const nextReturn = source.indexOf("\n  return ", start);
  const candidates = [nextFrom, nextAwait, nextReturn].filter((index) => index > start);
  return candidates.length ? Math.min(...candidates) : Math.min(source.length, start + 5000);
}

function splitTopLevelCommas(value) {
  const parts = [];
  let current = "";
  let depth = 0;
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const previous = value[index - 1];
    if (quote) {
      current += char;
      if (char === quote && previous !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth += 1;
    if (char === ")" || char === "]" || char === "}") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function walkSourceFiles(dir) {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  const files = [];
  for (const entry of readdirSync(dir)) {
    const filePath = path.join(dir, entry);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      files.push(...walkSourceFiles(filePath));
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
      files.push(filePath);
    }
  }
  return files;
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function relative(filePath) {
  return path.relative(root, filePath);
}
