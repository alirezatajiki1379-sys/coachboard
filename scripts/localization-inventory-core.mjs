import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const sourceDirectories = ["app", "components", "config", "lib"];
const uiAttributes = new Set(["label", "title", "description", "placeholder", "aria-label", "aria-description", "alt", "empty", "emptyText", "eyebrow", "hint", "helpText", "subtitle"]);
const uiProperties = new Set(["label", "title", "description", "error", "message", "emptyText", "placeholder", "eyebrow", "hint", "helpText", "subtitle", "supportingText"]);
const browserCopyCalls = new Set(["alert", "confirm", "window.alert", "window.confirm"]);
const neutralPatterns = [
  /^(CoachBoard|PDF|CSV|XLSX|HTTP|URL|ID|EN|DE)$/,
  /^(GK|CB|LB|RB|DM|CDM|CM|AM|CAM|LW|RW|ST)$/,
  /^(min|cm|kg|km|%|×|-)$/i,
  /^https?:\/\//,
  /^\//,
  /^[a-z0-9_.:@/-]+$/,
  /^#[0-9a-f]{3,8}$/i
];
const englishSingleLabels = new Set([
  "actions", "active", "add", "all", "analytics", "archive", "archived", "assessment", "attendance", "available",
  "back", "cancel", "categories", "category", "clear", "close", "completed", "confirm", "contact", "continue", "create",
  "critical", "dashboard", "delete", "description", "details", "detected", "development", "disabled", "dismiss", "dismissed",
  "done", "draft", "drill", "drills", "edit", "email", "empty", "error", "errors", "evidence", "expected", "failed",
  "favorite", "filter", "filters", "focus", "height", "help", "high", "history", "holiday", "ignore", "ignored", "inactive",
  "include", "information", "injured", "instructions", "late", "loading", "location", "low", "mapping", "material", "materials",
  "medical", "medium", "missing", "name", "next", "none", "notes", "observation", "open", "organization", "other", "overview",
  "past", "performance", "player", "players", "position", "present", "preview", "private", "profile", "progress", "rating", "ratings",
  "reason", "refresh", "remove", "report", "reports", "reset", "restore", "review", "reviews", "roster", "save", "saved", "saving",
  "school", "search", "select", "selected", "settings", "sick", "skip", "skipped", "snooze", "snoozed", "sort", "source", "status",
  "street", "success", "team", "teams", "template", "templates", "threshold", "today", "tomorrow", "training", "trainings", "trial",
  "unavailable", "unexcused", "unknown", "update", "updated", "upcoming", "upload", "variation", "variations", "warning", "warnings",
  "weight", "work"
]);
const englishSentenceWords = /\b(?:a|an|and|are|as|at|because|before|below|can|could|do|does|every|for|from|has|have|in|into|is|it|no|not|of|on|only|or|please|select|should|the|this|to|was|were|when|which|with|without|you|your)\b/i;

function filesIn(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? filesIn(path.join(directory, entry.name))
    : /\.(tsx?|jsx?)$/.test(entry.name) ? [path.join(directory, entry.name)] : []);
}

export function localizationInventory(root = process.cwd()) {
  const translations = translationCoverage(root);
  const candidates = [];
  const files = sourceDirectories.flatMap((directory) => filesIn(path.join(root, directory)));
  const routes = files
    .filter((file) => file.startsWith(path.join(root, "app") + path.sep) && /\/page\.tsx$/.test(file))
    .map((file) => ({
      route: `/${path.relative(path.join(root, "app"), path.dirname(file)).split(path.sep).filter((part) => !part.startsWith("(")).join("/")}`,
      file: path.relative(root, file)
    }))
    .sort((a, b) => a.route.localeCompare(b.route));

  for (const file of files) {
    if (file.includes(`${path.sep}i18n${path.sep}`)) continue;
    const content = fs.readFileSync(file, "utf8");
    const tree = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const add = (node, rawText, kind) => {
      const text = rawText.replace(/\s+/g, " ").trim();
      if (!isCandidateText(text) || isProtectedContent(node) || isLocaleCopy(node)) return;
      const coveredBy = translations.has(text) ? "dictionary" : translations.patterns.some((pattern) => pattern.test(text)) ? "pattern" : undefined;
      candidates.push({
        file: path.relative(root, file),
        line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
        kind,
        text,
        coveredBy
      });
    };
    const visit = (node) => {
      if (ts.isJsxText(node)) add(node, node.text, "literal JSX");
      if (ts.isJsxExpression(node) && node.expression && isStaticText(node.expression)) add(node, staticText(node.expression), "literal JSX expression");
      if (ts.isJsxAttribute(node) && uiAttributes.has(node.name.getText(tree)) && node.initializer && ts.isStringLiteral(node.initializer)) {
        add(node, node.initializer.text, `literal ${node.name.getText(tree)} attribute`);
      }
      if (ts.isPropertyAssignment(node) && uiProperties.has(propertyName(node.name)) && isStaticText(node.initializer)) {
        add(node, staticText(node.initializer), "config/action copy");
      }
      if (ts.isCallExpression(node) && browserCopyCalls.has(node.expression.getText(tree)) && node.arguments[0] && isStaticText(node.arguments[0])) {
        add(node.arguments[0], staticText(node.arguments[0]), "browser dialog copy");
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }

  const unique = [...new Map(candidates.map((candidate) => [`${candidate.file}:${candidate.line}:${candidate.kind}:${candidate.text}`, candidate])).values()];
  const findings = unique.filter((candidate) => !candidate.coveredBy);
  const compatibilityCovered = unique.filter((candidate) => candidate.coveredBy);
  return { routes, candidates: unique, findings, compatibilityCovered };
}

function translationCoverage(root) {
  const keys = new Set();
  const patterns = [];
  for (const relativeFile of ["lib/i18n/german-ui-dictionary.ts", "lib/i18n/workflow-copy-de.ts", "lib/i18n/localization-completeness-de.ts"]) {
    const file = path.join(root, relativeFile);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, "utf8");
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node) => {
      if (ts.isPropertyAssignment(node) && (ts.isStringLiteral(node.name) || ts.isNoSubstitutionTemplateLiteral(node.name))) keys.add(node.name.text);
      if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
        const value = node.getText(tree);
        const end = value.lastIndexOf("/");
        try { patterns.push(new RegExp(value.slice(1, end), value.slice(end + 1))); } catch { /* TypeScript/build reports invalid source patterns. */ }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  return { has: (text) => keys.has(text), patterns };
}

function isCandidateText(text) {
  if (!text || text.length < 2 || !/[A-Za-z]/.test(text)) return false;
  if (neutralPatterns.some((pattern) => pattern.test(text))) return false;
  if (englishSentenceWords.test(text)) return true;
  const words = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
  return words.some((word) => englishSingleLabels.has(word));
}

function isStaticText(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function staticText(node) {
  return node.text;
}

function propertyName(node) {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : node.getText();
}

function isProtectedContent(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (!ts.isJsxElement(current) && !ts.isJsxSelfClosingElement(current)) continue;
    const attributes = ts.isJsxElement(current) ? current.openingElement.attributes.properties : current.attributes.properties;
    if (attributes.some((attribute) => ts.isJsxAttribute(attribute) && ["translate", "data-user-content"].includes(attribute.name.getText()) && (!attribute.initializer || attribute.initializer.getText().includes("no")))) return true;
  }
  return false;
}

function isLocaleCopy(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isConditionalExpression(current) && /\blocale\b/.test(current.condition.getText())) return true;
    if (!ts.isPropertyAssignment(current) || !["en", "de"].includes(propertyName(current.name))) continue;
    const object = current.parent;
    if (ts.isObjectLiteralExpression(object)) {
      const names = new Set(object.properties.filter(ts.isPropertyAssignment).map((property) => propertyName(property.name)));
      if (names.has("en") && names.has("de")) return true;
    }
  }
  return false;
}
