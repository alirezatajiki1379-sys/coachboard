import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

function filesIn(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? filesIn(path.join(dir, entry.name)) : /\.(tsx?|jsx?)$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
}

export function localizationInventory(root = process.cwd()) {
  const findings = [];
  const files = ["app", "components", "config", "lib"].flatMap((dir) => filesIn(path.join(root, dir)));
  const routes = files.filter((file) => file.startsWith(path.join(root, "app") + path.sep) && /\/page\.tsx$/.test(file)).map((file) => ({
    route: `/${path.relative(path.join(root, "app"), path.dirname(file)).split(path.sep).filter((part) => !part.startsWith("(")).join("/")}`,
    file: path.relative(root, file)
  })).sort((a, b) => a.route.localeCompare(b.route));
  for (const file of files) {
    if (file.includes(`${path.sep}i18n${path.sep}`)) continue;
    const content = fs.readFileSync(file, "utf8");
    const tree = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function add(node, text, kind) {
      text = text.replace(/\s+/g, " ").trim();
      if (!/[a-zA-ZäöüÄÖÜß]/.test(text) || /^(CoachBoard|min|cm|kg|km|PDF|CSV|ID|XLSX|EN|DE)$/.test(text)) return;
      findings.push({ file: path.relative(root, file), line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, kind, text });
    }
    function visit(node) {
      if (ts.isJsxText(node)) add(node, node.text, "literal JSX");
      if (ts.isJsxAttribute(node) && /^(label|title|description|placeholder|aria-label|alt|empty|eyebrow|hint)$/.test(node.name.getText(tree)) && node.initializer && ts.isStringLiteral(node.initializer)) add(node, node.initializer.text, "literal attribute");
      if (ts.isPropertyAssignment(node) && /^(label|description|error|message|emptyText)$/.test(node.name.getText(tree)) && ts.isStringLiteral(node.initializer)) add(node, node.initializer.text, "config/action copy (review context)");
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  return { routes, findings };
}

if (process.argv[1]?.endsWith("localization-inventory.mjs")) {
  const inventory = localizationInventory();
  if (process.argv.includes("--json")) console.log(JSON.stringify(inventory, null, 2));
  else {
    console.log(`${inventory.routes.length} App Router pages; ${inventory.findings.length} source-copy candidates. This is not a runtime PASS.`);
    for (const route of inventory.routes) console.log(`${route.route} | ${route.file}`);
    for (const item of inventory.findings) console.log(`${item.file}:${item.line} [${item.kind}] ${item.text}`);
  }
}
