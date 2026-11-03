import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyticsFixture } from "./analytics-3-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const qaRequire = createRequire(path.join(process.env.COACHBOARD_QA_DEPS ?? "/private/tmp/coachboard-stability-tests", "package.json"));
const { build } = qaRequire("esbuild");
const { chromium } = qaRequire("playwright");
const output = process.env.COACHBOARD_QA_OUTPUT ?? "/private/tmp/coachboard-analytics-3";
mkdirSync(output, { recursive: true });

// Render the real server presentation functions with a locale stub, and mount the
// real client controls. Only Next routing/auth are substituted; no database writes.
const bundle = await build({
  stdin: { resolveDir: root, loader: "tsx", contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {I18nProvider} from '@/components/i18n/i18n-provider';
    import {AnalyticsControls} from '@/components/squad/analytics/analytics-controls';
    import {AnalyticsPrimarySummary} from '@/components/squad/analytics-primary-summary';
    import {AnalyticsOverview} from '@/components/squad/analytics/analytics-overview';
    import {AnalyticsSectionPanel} from '@/components/squad/analytics/analytics-detail-sections';
    import {AttendanceAnalyticsTable,PerformanceAnalyticsTable} from '@/components/squad/analytics/analytics-players';
    import {AnalyticsMethodology} from '@/components/squad/analytics/analytics-methodology';
    async function mount(){
      const d=window.fixture, locale=document.documentElement.lang, f=d.filters;
      const methodology=new URLSearchParams(location.search).get('view')==='methodology';
      let section=methodology?<AnalyticsMethodology locale={locale}/>:f.section==='overview'?<AnalyticsOverview analytics={d.teamAnalytics} filters={f} locale={locale}/>:await AnalyticsSectionPanel({section:f.section,teamAnalytics:d.teamAnalytics});
      const players=!methodology&&f.section==='players'?await PerformanceAnalyticsTable({summaries:d.summaries,filters:f}):!methodology&&f.section==='attendance'?await AttendanceAnalyticsTable({summaries:d.summaries,filters:f}):null;
      createRoot(document.getElementById('root')).render(<I18nProvider locale={locale}><div className='space-y-5'>
        <h1 className='text-2xl font-bold'>{locale==='de'?'Analysen':'Analytics'}</h1>
        <AnalyticsControls filters={f} methodology={methodology} positions={d.positions} events={d.availableEvents} periodLabel={f.period==='custom'?[f.customFrom,f.customTo].join(' – '):'01.10.2026 – 12.10.2026'} locale={locale}/>
        {!methodology&&<AnalyticsPrimarySummary locale={locale} analytics={d.teamAnalytics} filteredPlayerCount={d.summaries.length} playerType={f.playerType} position={f.position} periodLabel='01.10.2026 – 12.10.2026' singleTraining={!!f.trainingId} showMetrics={f.section==='overview'}/>}
        {section}{players}
      </div></I18nProvider>);
    }
    mount().catch(error=>{setTimeout(()=>{throw error})});
  ` },
  bundle: true, write: false, format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
  plugins: [{ name: "analytics-browser-fixture", setup(builder) {
    builder.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onResolve({ filter: /^@\/lib\/i18n\/server$/ }, () => ({ path: "locale", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: name }) => ({ loader: "jsx", resolveDir: root, contents:
      name === "locale" ? `export async function getActiveLocale(){return document.documentElement.lang}` :
      name === "next/navigation" ? `export function useRouter(){return {push:window.navigate}}` :
      `import React from 'react';export default function Link({href,children,onClick,...props}){return <a href={href} {...props} onClick={event=>{onClick?.(event);if(!event.defaultPrevented){event.preventDefault();window.navigate(href)}}}>{children}</a>}`
    }));
    builder.onResolve({ filter: /^@\// }, args => {
      const base = path.join(root, args.path.slice(2));
      return { path: [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find(candidate => existsSync(candidate) && statSync(candidate).isFile()) };
    });
  } }]
});
const css = readdirSync(path.join(root, ".next/static/css")).filter(name => name.endsWith(".css")).map(name => readFileSync(path.join(root, ".next/static/css", name), "utf8")).join("\n");
const server = createServer((request, response) => {
  if (request.url === "/bundle.js") { response.setHeader("Content-Type", "application/javascript"); response.end(bundle.outputFiles[0].text); return; }
  const url = new URL(request.url, "http://localhost");
  const params = Object.fromEntries(url.searchParams);
  const locale = params.locale === "en" ? "en" : "de";
  response.setHeader("Content-Type", "text/html");
  response.end(`<!doctype html><html lang="${locale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main style="padding:16px;max-width:1440px;margin:auto"><div id="root"></div></main><script>window.fixture=${JSON.stringify(analyticsFixture(params)).replaceAll("<", "\\u003c")};window.navigate=function(href){const target=new URL(href,location.origin);const current=new URLSearchParams(location.search);for(const key of ['locale','scenario']){if(current.has(key))target.searchParams.set(key,current.get(key))}location.assign(target.href)}</script><script src="/bundle.js"></script></body></html>`);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/squad/analysis`;
let browser;
let checks = 0;
async function stable(page, label) {
  await page.locator("[data-analytics-controls]").waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${label}: no page overflow`);
  const overflow = await page.locator("[data-primary-kpi], [data-performance-players] article, [data-attendance-players] article").evaluateAll(nodes => nodes.filter(node => node.scrollWidth > node.clientWidth + 1).length);
  assert.equal(overflow, 0, `${label}: text contained`);
  checks++;
}
async function clickRoute(page, locator) { await locator.click(); await page.waitForLoadState("load"); await page.locator("[data-analytics-controls]").waitFor(); }

try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.COACHBOARD_QA_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  for (const locale of ["de", "en"]) for (const width of [320, 768, 1440, 1920]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const de = locale === "de";
    await page.goto(`${base}?locale=${locale}&period=all`);
    await stable(page, `${locale}/${width}/overview`);
    assert.equal(await page.locator("[data-primary-kpi]").count(), 4);
    assert.equal(await page.locator("[data-data-status=complete]").count(), 1);
    assert.equal(await page.locator("input").count(), 0, "filter wall hidden");
    assert.equal(await page.locator("[data-analytics-overview] table").count(), 0, "overview does not duplicate detailed tables");
    const card = page.locator("[data-primary-kpi]").first();
    const before = await card.boundingBox(); await card.hover();
    assert.deepEqual(await card.boundingBox(), before, "no hover movement");
    await page.screenshot({ path: path.join(output, `${locale}-${width}-overview.png`), fullPage: true });

    const more = page.getByRole("button", { name: new RegExp(de ? "Mehr" : "More") });
    await more.click();
    assert.equal(await page.getByRole("dialog").isVisible(), true);
    const box = await page.getByRole("dialog").boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 1000);
    await page.keyboard.press("Escape");
    assert.equal(await more.evaluate(element => element === document.activeElement), true, "Escape restores focus");
    for (const [section, label] of [["development", de ? "Entwicklung" : "Development"], ["drills", de ? "Übungsnutzung" : "Drill Usage"], ["methodology", de ? "Methodik" : "Methodology"]]) {
      await page.getByRole("button", { name: new RegExp(de ? "Mehr" : "More") }).click();
      await clickRoute(page, page.getByRole("dialog").getByRole("link", { name: label, exact: true }));
      assert.equal(new URL(page.url()).searchParams.get(section === "methodology" ? "view" : "section"), section);
      await stable(page, `${locale}/${width}/${section}`);
      if (section === "drills") assert.equal(await page.locator('a[href="/drills/drill-example"]').count(), 1);
      if (section === "methodology") assert.equal(await page.locator("[data-methodology]").count(), 1);
    }
    for (const [section, label] of [["players", de ? "Spieler" : "Players"], ["training", "Training"], ["attendance", de ? "Anwesenheit" : "Attendance"]]) {
      await clickRoute(page, page.locator("[data-analytics-controls] nav").first().getByRole("link", { name: label, exact: true }));
      assert.equal(new URL(page.url()).searchParams.get("section"), section);
      await stable(page, `${locale}/${width}/${section}`);
      const disclosure = page.locator('summary:visible').first();
      if (await disclosure.count()) {
        await disclosure.click();
        await stable(page, `${locale}/${width}/${section}/expanded`);
      }
      if (section === "players") {
        await page.screenshot({ path: path.join(output, `${locale}-${width}-players.png`), fullPage: true });
        assert.equal(await page.locator("[data-analytics-sort] option").count(), 14);
        await page.getByLabel(de ? "Sortieren nach" : "Sort by", { exact: true }).selectOption("average");
        await page.waitForURL(/sort=average/);
        await page.locator("[data-performance-players]").waitFor();
        assert.equal(await page.getByLabel(de ? "Absteigend" : "Descending", { exact: true }).count(), 1);
        await clickRoute(page, page.getByRole("button", { name: de ? "Absteigend" : "Descending", exact: true }));
        assert.equal(new URL(page.url()).searchParams.get("direction"), "asc");
        if (width >= 1024) {
          await clickRoute(page, page.locator("thead").getByRole("link", { name: de ? "Spieler" : "Player", exact: true }));
          assert.equal(await page.locator('th[aria-sort="ascending"]').count(), 1);
          await clickRoute(page, page.locator("thead").getByRole("link", { name: de ? "Spieler" : "Player", exact: true }));
          assert.equal(await page.locator('th[aria-sort="descending"]').count(), 1);
        }
        const playerLink = page.locator('a[href="/squad/players/player-0"]:visible').first();
        await clickRoute(page, playerLink);
        assert.equal(new URL(page.url()).pathname, "/squad/players/player-0");
        await page.goto(`${base}?locale=${locale}&period=all`);
      }
    }

    await page.getByRole("button", { name: de ? "Filter · 0" : "Filters · 0", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('select[name="playerType"]').selectOption("trial");
    await dialog.locator('select[name="position"]').selectOption("ST");
    await clickRoute(page, dialog.getByRole("button", { name: de ? "Anwenden" : "Apply", exact: true }));
    await stable(page, "active filters");
    assert.equal(await page.locator("[data-active-filters] a").count(), 3);
    assert.equal(new URL(page.url()).searchParams.get("playerType"), "trial");
    await page.reload(); await stable(page, "reload filters");
    await clickRoute(page, page.getByRole("link", { name: new RegExp(de ? "Filter entfernen: Position" : "Remove filter: Position") }));
    assert.equal(new URL(page.url()).searchParams.has("position"), false);
    assert.equal(new URL(page.url()).searchParams.get("playerType"), "trial");
    await clickRoute(page, page.getByRole("link", { name: de ? "Filter zurücksetzen" : "Reset filters", exact: true }));
    assert.equal(new URL(page.url()).searchParams.has("position"), false);

    await page.getByLabel(de ? "Zeitraum" : "Period", { exact: true }).selectOption("custom");
    await page.waitForURL(/period=custom/);
    await page.locator('input[name="from"]').fill("01.10.2026");
    await page.locator('input[name="to"]').fill("05.10.2026");
    await clickRoute(page, page.getByRole("button", { name: de ? "Anwenden" : "Apply", exact: true }));
    assert.equal(new URL(page.url()).searchParams.get("from"), "01.10.2026");
    await page.reload(); await stable(page, "custom reload");
    assert.equal(await page.locator('input[name="to"]').inputValue(), "05.10.2026");
    const report = page.getByRole("link", { name: de ? "Bericht erstellen" : "Create report" });
    assert.match(await report.getAttribute("href"), /from=01.10.2026/);

    await page.goto(`${base}?locale=${locale}&period=all`);
    await page.getByRole("button", { name: de ? "Filter · 0" : "Filters · 0", exact: true }).click();
    await page.getByRole("dialog").locator('select[name="training"]').selectOption("10000000-0000-4000-8000-000000000001");
    await clickRoute(page, page.getByRole("dialog").getByRole("button", { name: de ? "Anwenden" : "Apply", exact: true }));
    assert.match(await page.locator("[data-primary-kpi]").nth(1).innerText(), de ? /21 Teilnehmer/ : /21 participants/);
    await page.goto(`${base}?locale=${locale}&scenario=zero&period=all`); await stable(page, "zero ratings");
    assert.equal(await page.locator("[data-primary-kpi]").count(), 3);
    assert.equal(await page.locator("[data-data-status=complete]").count(), 1);
    assert.equal(await page.locator('a[href="/actions"]').count(), 0);
    assert.match(await page.locator("[data-performance-evidence]").innerText(), de ? /Noch keine Leistungsbewertungen/ : /No performance ratings/);
    await page.goto(`${base}?locale=${locale}&scenario=missing&period=all`); await stable(page, "missing attendance");
    assert.equal(await page.locator("[data-data-status=incomplete]").count(), 1);
    await page.goto(`${base}?locale=${locale}&scenario=empty`); await stable(page, "empty period");
    assert.equal(await page.locator("[data-analytics-empty]").count(), 1);
    assert.deepEqual(errors, [], `${locale}/${width}: runtime errors`);
    await page.close();
  }
  console.log(`Analytics 3 browser regression: PASS (${checks} responsive states; real components, EN/DE, 320/768/1440/1920px). Screenshots: ${output}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
