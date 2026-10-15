import process from "node:process";
import { localizationInventory } from "./localization-inventory-core.mjs";

const inventory = localizationInventory();

if (inventory.findings.length) {
  console.warn(`i18n audit found ${inventory.findings.length} unresolved user-facing English string(s) across ${inventory.routes.length} App Router pages.`);
  for (const item of inventory.findings) console.warn(`- ${item.file}:${item.line} [${item.kind}] ${item.text}`);
  if (process.env.COACHBOARD_I18N_STRICT === "1") process.exitCode = 1;
} else {
  console.log(`i18n audit passed: ${inventory.routes.length} App Router pages scanned; no unresolved user-facing English source copy.`);
}

console.log(`${inventory.compatibilityCovered.length} literal(s) are covered by deterministic German dictionary/pattern compatibility.`);
