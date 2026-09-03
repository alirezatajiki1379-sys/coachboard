import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const locales = ["en", "de"];
const messages = Object.fromEntries(
  locales.map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(path.join(root, "messages", `${locale}.json`), "utf8"))
  ])
);

const errors = [];

function flatten(value, prefix = "") {
  if (typeof value === "string") return [[prefix, value]];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`Invalid translation node at ${prefix || "<root>"}`);
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
}

const flat = Object.fromEntries(locales.map((locale) => [locale, new Map(flatten(messages[locale]))]));
const allKeys = new Set([...flat.en.keys(), ...flat.de.keys()]);

for (const key of [...allKeys].sort()) {
  for (const locale of locales) {
    if (!flat[locale].has(key)) {
      errors.push(`${locale} is missing key: ${key}`);
      continue;
    }
    const value = flat[locale].get(key);
    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push(`${locale}.${key} is empty`);
    }
  }

  if (flat.en.has(key) && flat.de.has(key)) {
    const enParams = parameters(flat.en.get(key));
    const deParams = parameters(flat.de.get(key));
    if (enParams.join(",") !== deParams.join(",")) {
      errors.push(`Parameter mismatch at ${key}: en={${enParams.join(",")}} de={${deParams.join(",")}}`);
    }
  }
}

if (errors.length) {
  console.error("i18n check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`i18n check passed: ${flat.en.size} keys in ${locales.join(", ")}.`);

function parameters(value) {
  return [...new Set([...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]))].sort();
}
