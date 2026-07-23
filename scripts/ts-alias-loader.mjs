import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return nextResolve(pathToFileURL(`${process.cwd()}/${specifier.slice(2)}.ts`).href, context);
  }
  return nextResolve(specifier, context);
}
