import { pathToFileURL } from "node:url";
import { existsSync, statSync } from "node:fs";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = `${process.cwd()}/${specifier.slice(2)}`;
    const file = [base, `${base}.ts`, `${base}/index.ts`].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
    if (file?.endsWith(".json")) return nextResolve(pathToFileURL(file).href, { ...context, importAttributes: { type: "json" } });
    return nextResolve(pathToFileURL(file ?? `${base}.ts`).href, context);
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  return nextLoad(url, url.endsWith(".json") ? { ...context, importAttributes: { type: "json" } } : context);
}
