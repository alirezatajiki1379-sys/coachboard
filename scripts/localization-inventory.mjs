import { localizationInventory as strictLocalizationInventory } from "./localization-inventory-core.mjs";

if (process.argv[1]?.endsWith("localization-inventory.mjs")) {
  const inventory = strictLocalizationInventory();
  if (process.argv.includes("--json")) console.log(JSON.stringify(inventory, null, 2));
  else {
    console.log(`${inventory.routes.length} App Router pages; ${inventory.candidates.length} user-facing English source candidate(s); ${inventory.findings.length} unresolved; ${inventory.compatibilityCovered.length} covered by deterministic DE copy.`);
    for (const route of inventory.routes) console.log(`${route.route} | ${route.file}`);
    for (const item of inventory.findings) console.log(`${item.file}:${item.line} [${item.kind}] ${item.text}`);
  }
}

export const localizationInventory = strictLocalizationInventory;
