import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const qaRequire = createRequire(path.join(process.env.COACHBOARD_QA_DEPS ?? "/private/tmp/coachboard-stability-tests", "package.json"));
const { build } = qaRequire("esbuild");
const { chromium } = qaRequire("playwright");
const stubs = {
  "next/link": 'import React from "react"; export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}',
  "next/navigation": 'export const redirect=()=>{};',
  "@/lib/supabase/server": 'export async function createClient(){return {auth:{async getUser(){return {data:{user:{id:"coach"}}}}}}}',
  "@/lib/i18n/server": 'export async function getUserLocale(){return window.qa.locale}',
  "@/lib/squad/attendance-queries": 'export async function listTrainingEventDetails(){return window.qa.events}',
  "@/lib/squad/attention-queries": 'export async function getDashboardAttentionData(){return window.qa.attention}',
  "@/lib/squad/development": 'export async function getDevelopmentDashboardSummary(){return window.qa.development}',
  "@/lib/squad/session-review": 'export async function listTrainingSessionReviewSummaries(){return new Map()}',
  "@/lib/squad/training-plan-queries": 'export async function listConcreteTrainingPlanEventIds(){return new Set(window.qa.planIds)}',
  "@/lib/squad/squads": 'export async function ensureActiveSquad(){return {id:"team",name:"U15 Beispielteam"}}'
};

const bundle = await build({
  stdin: {
    contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import DashboardPage from "@/app/(app)/dashboard/page";
      import {I18nProvider} from "@/components/i18n/i18n-provider";
      import {GermanLocalizationBoundary} from "@/components/i18n/german-localization-boundary";
      const pad=value=>String(value).padStart(2,"0");
      const dateInBerlin=offset=>{const now=new Date();const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);const get=type=>Number(parts.find(part=>part.type===type)?.value);return new Date(Date.UTC(get("year"),get("month")-1,get("day")+offset)).toISOString().slice(0,10)};
      const player=index=>({id:"player-"+index,plannedStatus:"expected",finalStatus:index<8?"present":undefined,player:{firstName:"Player",lastName:String(index),playerType:"roster",secondaryPositions:[]}});
      const event=(id,offset,label,status="prepared")=>({id,userId:"coach",squadId:"team",date:dateInBerlin(offset),startTime:"18:30",endTime:"20:00",label,location:"Sportplatz Nord",status,attendance:Array.from({length:18},(_,index)=>player(index)),participantSourceMode:"snapshot",isSeriesException:false,createdAt:"2026-01-01",updatedAt:"2026-01-01"});
      window.qa={locale:"en",events:[event("today",0,"Pressing & transition","in_progress"),event("tomorrow",1,"Technical development"),event("third",3,"Match preparation")],planIds:["tomorrow"],attention:{summary:{open:0,critical:0,high:0},items:[]},development:{playersTotal:0,playersWithActiveGoals:0,playersWithoutActiveGoals:0,goalsDueForReview:0,activeHighPriorityGoals:0,observationsThisWeek:0},ready:false};
      const root=createRoot(document.getElementById("root"));
      async function resolveServer(node){if(Array.isArray(node))return Promise.all(node.map(resolveServer));if(!React.isValidElement(node))return node;if(typeof node.type==="function"&&node.type.constructor.name==="AsyncFunction")return resolveServer(await node.type(node.props));return React.cloneElement(node,{},await resolveServer(node.props.children));}
      window.qa.render=async locale=>{window.qa.ready=false;window.qa.locale=locale;const dashboard=await resolveServer(<DashboardPage/>);root.render(<I18nProvider locale={locale}><GermanLocalizationBoundary locale={locale}>{dashboard}</GermanLocalizationBoundary></I18nProvider>);requestAnimationFrame(()=>requestAnimationFrame(()=>{window.qa.ready=true;}));};
      window.qa.render("en");
    `,
    resolveDir: root,
    loader: "tsx"
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{
    name: "dashboard-fixture",
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => {
        if (stubs[args.path]) return { path: args.path, namespace: "stub" };
        if (args.path.startsWith("@/")) {
          const base = path.join(root, args.path.slice(2));
          return { path: [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) };
        }
      });
      builder.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: stubs[args.path], loader: "tsx", resolveDir: root }));
    }
  }]
});

const cssDir = path.join(root, ".next/static/css");
const css = readdirSync(cssDir).filter((name) => name.endsWith(".css")).map((name) => readFileSync(path.join(cssDir, name), "utf8")).join("\n");
assert.ok(css, "Run npm run build before Dashboard browser validation.");
const server = createServer((request, response) => {
  if (request.url === "/bundle.js") {
    response.setHeader("Content-Type", "application/javascript");
    response.end(bundle.outputFiles[0].text);
    return;
  }
  response.setHeader("Content-Type", "text/html");
  response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main id="root" style="padding:16px"></main><script src="/bundle.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.COACHBOARD_QA_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.qa?.ready);

  for (const locale of ["en", "de"]) {
    await page.evaluate(async (nextLocale) => window.qa.render(nextLocale), locale);
    await page.waitForFunction((expected) => window.qa.ready && window.qa.locale === expected, locale);
    const expected = locale === "de"
      ? ["Heute", "Diese Woche", "Braucht Aufmerksamkeit", "Schnellzugriff"]
      : ["Today", "This week", "Needs attention", "Quick links"];
    const selectors = ["[data-dashboard-operational]", "[data-dashboard-week]", "[data-dashboard-attention]", "[data-dashboard-quick-links]"];
    const sectionBoxes = [];
    for (let index = 0; index < selectors.length; index += 1) {
      const section = page.locator(selectors[index]);
      assert.ok((await section.innerText()).toLocaleLowerCase(locale).includes(expected[index].toLocaleLowerCase(locale)), `${locale}: ${selectors[index]} must contain ${expected[index]}`);
      sectionBoxes.push(await section.boundingBox());
    }
    assert.ok(sectionBoxes.every(Boolean));
    assert.ok(sectionBoxes.every((box, index) => index === 0 || box.y > sectionBoxes[index - 1].y), `${locale}: Dashboard sections must keep the coach-first order`);
    assert.equal(await page.locator("[data-dashboard-development]").count(), 0, `${locale}: zero-value Development must stay hidden`);
    assert.equal(await page.locator(".page-actions a").count(), 2, `${locale}: header has one workflow action and one small create action`);

    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${locale}/${width}: horizontal overflow`);
      const weekRow = page.locator("[data-dashboard-week] a[href^='/trainings/']").first();
      const before = await weekRow.boundingBox();
      await weekRow.hover();
      const after = await weekRow.boundingBox();
      assert.ok(before && after && Math.abs(before.x - after.x) < 0.5 && Math.abs(before.y - after.y) < 0.5 && Math.abs(before.width - after.width) < 0.5 && Math.abs(before.height - after.height) < 0.5, `${locale}/${width}: hover moved the week row`);
    }
  }
  assert.deepEqual(errors, []);
  console.log("Dashboard 2.0 browser regression: PASS (DE/EN at 320, 768, 1440 px)");
} finally {
  await browser?.close();
  server.close();
}
