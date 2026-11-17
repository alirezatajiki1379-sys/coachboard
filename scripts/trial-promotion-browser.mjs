import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const qa = createRequire(path.join(process.env.COACHBOARD_QA_DEPS ?? "/private/tmp/coachboard-stability-tests", "package.json"));
const { build } = qa("esbuild");
const { chromium } = qa("playwright");
// Real profile actions and translations; fictional data and mocked server writes.
const stubs = {
  "next/link": 'import React from "react";export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}',
  "next/navigation": 'const router={refresh(){window.refreshCount++}};export function useRouter(){return router}',
  "@/lib/squad/actions": 'export async function archiveSquadPlayer(){};export async function restoreSquadPlayer(){};export async function extendTrialPlayer(){};export async function loadTrialExtensionContext(){}',
  "@/lib/squad/attendance-actions": `export async function convertTrialPlayerToSquadPlayer(_,fd){window.submittedId=fd.get("playerId");await new Promise(r=>setTimeout(r,200));return window.failPromotion?{ok:false,error:"save_failed"}:{ok:true,warning:window.warnPromotion};}`
};
const bundle = await build({
  stdin: { contents: `
    import React from "react";import {createRoot} from "react-dom/client";
    import {I18nProvider} from "@/components/i18n/i18n-provider";
    import {PlayerActions} from "@/components/squad/player-actions";
    const root=createRoot(document.getElementById("root"));
    window.refreshCount=0;window.failPromotion=false;window.warnPromotion=false;
    window.renderQA=(locale,type="trial",archived=false)=>root.render(<I18nProvider locale={locale}><PlayerActions key={locale+type+archived} playerId="same-player" playerType={type} archived={archived} locale={locale}/></I18nProvider>);
    window.renderQA("en");
  `, resolveDir: root, loader: "tsx" },
  bundle: true, write: false, format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
  plugins: [{ name: "fixture", setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => {
      if (stubs[args.path]) return { path: args.path, namespace: "stub" };
      if (args.path.startsWith("@/")) {
        const base = path.join(root, args.path.slice(2));
        return { path: [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((file) => existsSync(file) && statSync(file).isFile()) };
      }
    });
    builder.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: stubs[args.path], loader: "tsx", resolveDir: root }));
  } }]
});
const cssDir = path.join(root, ".next/static/css");
const css = readdirSync(cssDir).filter((name) => name.endsWith(".css")).map((name) => readFileSync(path.join(cssDir, name), "utf8")).join("\n");
const server = createServer((request, response) => {
  response.setHeader("Content-Type", request.url === "/bundle.js" ? "application/javascript" : "text/html");
  response.end(request.url === "/bundle.js" ? bundle.outputFiles[0].text : `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main id="root" style="padding:16px"></main><script src="/bundle.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.COACHBOARD_QA_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  for (const locale of ["en", "de"]) for (const width of [320, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate((locale) => window.renderQA(locale), locale);
    const button = page.getByRole("button", { name: locale === "de" ? "In Kader übernehmen" : "Add to squad", exact: true });
    await button.waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    const actions = page.getByRole("button", { name: locale === "de" ? "Aktionen" : "Actions", exact: true });
    await actions.click();
    const menuBounds = await page.getByRole("menu").boundingBox();
    const actionBounds = await actions.boundingBox();
    assert.ok(menuBounds.y >= actionBounds.y + actionBounds.height, "menu stays below wrapped controls");
    assert.ok(menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= width);
    await page.keyboard.press("Escape");
    await page.screenshot({ path: `/private/tmp/trial-promotion-${locale}-${width}.png` });
    await page.evaluate(() => { window.failPromotion = true; });
    await button.click();
    assert.equal(await page.getByRole("button", { name: locale === "de" ? "Wird übernommen..." : "Adding to squad...", exact: true }).isDisabled(), true);
    await page.getByRole("alert").waitFor();
    assert.equal(await page.evaluate(() => window.refreshCount), 0);
    await page.evaluate(() => { window.failPromotion = false; });
    await button.click();
    await page.getByRole("status").waitFor();
    await page.waitForFunction(() => window.refreshCount === 1);
    assert.equal(await page.evaluate(() => window.submittedId), "same-player");
    assert.equal(await button.count(), 0);
    await page.evaluate((locale) => window.renderQA(locale, "roster"), locale);
    await page.getByRole("button", { name: locale === "de" ? "Aktionen" : "Actions", exact: true }).waitFor();
    assert.equal(await button.count(), 0);
    await page.evaluate((locale) => window.renderQA(locale, "trial", true), locale);
    await page.getByRole("button", { name: locale === "de" ? "Wiederherstellen" : "Restore", exact: true }).waitFor();
    assert.equal(await button.count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Trial promotion browser: PASS (EN/DE, 320/768/1440, visibility, pending, failed save/retry, same ID, success, roster/archive exclusion; mocked writes)");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
