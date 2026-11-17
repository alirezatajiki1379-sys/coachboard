import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Real UI, fictional data and mocked server-action boundaries; no live database.
const root = process.cwd();
const qa = createRequire(path.join(process.env.COACHBOARD_QA_DEPS ?? "/private/tmp/coachboard-stability-tests", "package.json"));
const { build } = qa("esbuild");
const { chromium } = qa("playwright");
const actionStub = `
  export async function restoreSquadPlayer(fd){window.savedPlayerId=fd.get("playerId");sessionStorage.setItem("reactivated","yes");window.renderQA("/squad?players=active");}
  export async function bulkRestoreSquadPlayers(_,fd){window.savedPlayerIds=fd.getAll("playerIds");return {ok:true,message:"Restored"};}
  export async function archiveSquadPlayer(){}
  export async function extendTrialPlayer(){}
  export async function loadTrialExtensionContext(){}
  export async function bulkArchiveSquadPlayers(){}
  export async function bulkPermanentlyDeleteSquadPlayers(){}
  export async function bulkTrashSquadPlayers(){}
`;
const bundle = await build({
  stdin: { contents: `
    import React from "react";
    import {createRoot} from "react-dom/client";
    import {CoachWorkspace} from "@/components/squad/coach-workspace";
    import {PlayerActions} from "@/components/squad/player-actions";
    import {I18nProvider} from "@/components/i18n/i18n-provider";
    import {parseWorkspaceState,defaultWorkspaceConfiguration} from "@/lib/squad/workspace";
    import {createPlayerAnalyticsSummary} from "@/lib/squad/analytics";
    const root=createRoot(document.getElementById("root"));
    const locale=new URLSearchParams(location.search).get("locale")||"en";
    const player={id:"archived-player",userId:"owner",squadId:"team",playerType:"roster",firstName:"Fictional",lastName:"Archived",position:"CM",secondaryPositions:[],preferredPositions:[],positionFamilies:[],onboardingWarnings:[],createdAt:"2026-01-01",updatedAt:"2026-01-01"};
    window.renderQA=(url)=>{
      history.replaceState(null,"",url);
      const state=parseWorkspaceState(Object.fromEntries(new URLSearchParams(location.search)));
      const archived=!sessionStorage.getItem("reactivated");
      const person={...player,archivedAt:archived?"2026-11-01":undefined};
      const item={analytics:createPlayerAnalyticsSummary(person,[],"all"),activeGoals:[],attention:[],positionGroup:"Midfielders",review:{label:"No review date",tone:"neutral",rank:5}};
      const visible=state.players==="archived"?archived:!archived;
      const data={state,configuration:defaultWorkspaceConfiguration("all"),savedViews:[],players:visible?[item]:[],allPlayers:[item],positions:["CM"],periodLabel:"2026",periodRangeLabel:"2026",counts:{active:archived?0:1,roster:archived?0:1,trial:0,archived:archived?1:0,unavailable:0,needsAttention:0,reviewsDue:0}};
      root.render(<I18nProvider locale={locale}>{location.pathname.includes("/players/")?<div><h1>Fictional Archived</h1><PlayerActions playerId={player.id} archived={archived} locale={locale}/></div>:<CoachWorkspace key={location.search} data={data} locale={locale}/>}</I18nProvider>);
    };
    window.renderQA(location.pathname+location.search);
  `, resolveDir: root, loader: "tsx" },
  bundle: true, write: false, jsx: "automatic", format: "iife",
  define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
  plugins: [{ name: "fixture", setup(builder) {
    const stubs = {
      "next/link": 'import React from "react"; export default function Link({href,children,...props}){return <a href={href} {...props} onClick={e=>{e.preventDefault();window.renderQA(href)}}>{children}</a>}',
      "next/navigation": 'const router={refresh(){}}; export function useRouter(){return router}',
      "@/lib/squad/attendance-actions": 'export async function convertTrialPlayerToSquadPlayer(){throw new Error("Promotion is outside this archive fixture")}',
      "@/lib/squad/actions": actionStub,
      "@/lib/squad/workspace-actions": ["createWorkspaceSavedView", "saveWorkspaceColumnOrder", "saveSystemWorkspaceOverride", "updateWorkspaceSavedView"].map((name) => `export async function ${name}(){}`).join("\n")
    };
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
  response.end(request.url === "/bundle.js" ? bundle.outputFiles[0].text : `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main style="padding:12px;max-width:1400px;margin:auto" id="root"></main><script src="/bundle.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.COACHBOARD_QA_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  for (const locale of ["en", "de"]) for (const width of [320, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/squad?players=active&locale=${locale}`);
    const archive = page.locator('nav a[href="/squad?players=archived"]');
    await archive.click();
    assert.equal(await archive.getAttribute("aria-current"), "page");
    assert.match(await archive.textContent(), locale === "de" ? /Archivierte Spieler \(1\)/ : /Archived players \(1\)/);
    assert.equal(await page.locator('select[name="players"]').inputValue(), "archived");
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    if (!fits) {
      await page.screenshot({ path: "/private/tmp/archive-overflow.png", fullPage: true });
      console.error(await page.evaluate(() => Array.from(document.querySelectorAll("main *")).filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.right > innerWidth + 1 && getComputedStyle(element).position !== "absolute";
      }).map((element) => ({ tag: element.tagName, className: element.className, text: element.textContent.slice(0, 100), width: element.getBoundingClientRect().width })).slice(0, 15)));
    }
    assert.equal(fits, true, `${locale}/${width}: overflow`);
    await page.getByRole("button", { name: locale === "de" ? "Auswählen" : "Select", exact: true }).first().click();
    const reactivate = page.getByRole("button", { name: locale === "de" ? "Reaktivieren" : "Reactivate", exact: true });
    assert.equal(await reactivate.isDisabled(), true);
    await page.getByRole("checkbox").filter({ visible: true }).first().check();
    await reactivate.click();
    assert.deepEqual(await page.evaluate(() => window.savedPlayerIds), ["archived-player"]);
    const profile = page.locator('a[href*="/squad/players/archived-player"]').filter({ visible: true }).first();
    await profile.click();
    await page.getByRole("button", { name: locale === "de" ? "Reaktivieren" : "Reactivate", exact: true }).click();
    await page.waitForFunction(() => location.search === "?players=active");
    assert.equal(await page.evaluate(() => window.savedPlayerId), "archived-player");
    await page.locator('a[href*="/squad/players/archived-player"]').filter({ visible: true }).first().waitFor();
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `/private/tmp/archive-${locale}-${width}.png`, fullPage: true });
    await page.close();
  }
  console.log("Archive UI: PASS (active/archive links, profile, single/bulk reactivate, EN/DE, 320/768/1440px; mocked writes)");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
