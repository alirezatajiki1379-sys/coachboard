import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const qaRequire = createRequire(path.join(process.env.COACHBOARD_QA_DEPS ?? "/private/tmp/coachboard-stability-tests", "package.json"));
const { build } = qaRequire("esbuild");
const { chromium } = qaRequire("playwright");

const bundle = await build({
  stdin: {
    contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {PlayerHubNavigation} from "@/components/squad/player-hub/player-hub-navigation";
      const params=new URLSearchParams(location.search);
      const locale=params.get("locale")==="de"?"de":"en";
      const activeTab=params.get("tab")||"overview";
      createRoot(document.getElementById("root")).render(React.createElement(PlayerHubNavigation,{playerId:"player-1",activeTab,period:"season",locale}));
    `,
    resolveDir: root,
    loader: "tsx"
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
  plugins: [{
    name: "player-hub-fixture",
    setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next-link", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "jsx", resolveDir: root, contents: `import React from "react"; export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}` }));
      builder.onResolve({ filter: /^@\// }, (args) => {
        const base = path.join(root, args.path.slice(2));
        return { path: [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) };
      });
    }
  }]
});

const cssDirectory = path.join(root, ".next/static/css");
const css = existsSync(cssDirectory) ? readdirSync(cssDirectory).filter((name) => name.endsWith(".css")).map((name) => readFileSync(path.join(cssDirectory, name), "utf8")).join("\n") : "";
const server = createServer((request, response) => {
  if (request.url === "/bundle.js") {
    response.setHeader("Content-Type", "application/javascript");
    response.end(bundle.outputFiles[0].text);
    return;
  }
  response.setHeader("Content-Type", "text/html");
  response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main style="padding:12px"><div id="root"></div></main><script src="/bundle.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;

try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.COACHBOARD_QA_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  for (const locale of ["en", "de"]) {
    for (const width of [320, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}?locale=${locale}`);
      const more = page.getByRole("button", { name: new RegExp(locale === "de" ? "Mehr" : "More") });
      await more.click();
      assert.equal(await page.getByRole("menuitem").count(), 4, `${locale}/${width}px exposes four secondary destinations`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, `${locale}/${width}px has no page overflow`);
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("menuitem").count(), 0, `${locale}/${width}px closes More with Escape`);
      assert.deepEqual(errors, [], `${locale}/${width}px has no runtime errors`);
      await page.close();
    }
  }

  const secondary = await browser.newPage({ viewport: { width: 320, height: 800 } });
  await secondary.goto(`${base}?locale=de&tab=attendance`);
  await secondary.getByRole("button", { name: /Mehr · Anwesenheitsdetails/ }).click();
  assert.equal(await secondary.getByRole("menuitem", { name: "Anwesenheitsdetails" }).getAttribute("aria-current"), "page", "More shows the active legacy deep link");
  await secondary.close();
  console.log("Player Hub 2.0 browser regression: PASS (EN/DE, 320/768/1440px, More menu, deep-link state)");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
