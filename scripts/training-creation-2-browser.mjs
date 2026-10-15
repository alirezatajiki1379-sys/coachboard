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
  "@/lib/squad/attendance-actions": 'export async function createTrainingEvent(){return {}} export async function updateTrainingEvent(){return {}}'
};

const bundle = await build({
  stdin: {
    contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {I18nProvider} from "@/components/i18n/i18n-provider";
      import {TrainingEventForm} from "@/components/squad/training-event-form";
      const team={id:"team",userId:"coach",name:"Fictional U15",isActive:true,createdAt:"2026-01-01",updatedAt:"2026-01-01"};
      const players=Array.from({length:24},(_,index)=>({id:"p"+index,userId:"coach",squadId:"team",firstName:"Player",lastName:String(index+1),playerType:"roster",secondaryPositions:[],onboardingWarnings:[],createdAt:"2026-01-01",updatedAt:"2026-01-01"}));
      const plans=[{id:"plan",title:"Fictional possession plan"}];
      const editEvent={id:"event",userId:"coach",squadId:"team",date:"2026-10-19",startTime:"18:30",endTime:"20:00",label:"Series Training",status:"draft",recurrenceSeriesId:"series",participantSourceMode:"custom_selection",attendance:players.slice(0,2).map((player,index)=>({id:"a"+index,userId:"coach",eventId:"event",playerId:player.id,latePenaltyApplied:true,sensitiveNote:false,player})),createdAt:"2026-01-01",updatedAt:"2026-01-01"};
      const calendar={teamId:"team",federalStateCode:"DE-NW",preferences:{publicHolidays:"exclude",schoolHolidays:"exclude",localMovableHolidays:"ask",customExclusions:"ask"},events:[{id:"holiday",name:"Autumn holidays",category:"official_school_holiday",startsOn:"2026-10-19",endsOn:"2026-10-19",source:"fixture",confidence:"official",excludeByDefault:false}],sourceLabel:"Official test source"};
      const root=createRoot(document.getElementById("root"));
      window.qa={render(locale="en",empty=false,edit=false){root.render(<I18nProvider locale={locale}><TrainingEventForm key={locale+String(empty)+String(edit)} sessions={plans} squads={[team]} participants={empty?[]:players} calendarContext={calendar} event={edit?editEvent:undefined} mode={edit?"edit":"create"}/></I18nProvider>)}};
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
  plugins: [{ name: "training-creation-fixture", setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => {
      if (stubs[args.path]) return { path: args.path, namespace: "stub" };
      if (args.path.startsWith("@/")) {
        const base = path.join(root, args.path.slice(2));
        return { path: [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) };
      }
    });
    builder.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: stubs[args.path], loader: "tsx", resolveDir: root }));
  }}]
});

const cssDir = path.join(root, ".next/static/css");
const css = readdirSync(cssDir).filter((name) => name.endsWith(".css")).map((name) => readFileSync(path.join(cssDir, name), "utf8")).join("\n");
assert.ok(css, "Run npm run build before Training Creation browser validation.");
const server = createServer((request, response) => {
  if (request.url === "/bundle.js") { response.setHeader("Content-Type", "application/javascript"); response.end(bundle.outputFiles[0].text); return; }
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
  await page.locator("[data-training-creation-form]").waitFor();

  for (const locale of ["en", "de"]) {
    await page.evaluate((value) => window.qa.render(value), locale);
    const labels = locale === "de" ? { adjust: "Teilnehmer anpassen", custom: "Eigene Auswahl", repeat: "Training wiederholen", more: "Weitere Angaben", plan: "Trainingsplan" } : { adjust: "Adjust participants", custom: "Custom selection", repeat: "Repeat Training", more: "More details", plan: "Training Plan" };
    await page.getByRole("button", { name: labels.adjust }).waitFor();
    assert.equal(await page.getByPlaceholder(/Search Players|Spieler suchen/).count(), 0);
    assert.equal(await page.locator("[data-more-details]").evaluate((element) => element.open), false);
    assert.equal(await page.locator("[data-recurrence-preview]").count(), 0);
    await page.getByRole("button", { name: labels.adjust }).click();
    await page.getByText(labels.custom, { exact: true }).click();
    assert.equal(await page.getByPlaceholder(/Search Players|Spieler suchen/).count(), 1);
    await page.getByRole("checkbox", { name: labels.repeat }).check();
    await page.locator('input[name="date"]').fill("2026-10-19");
    await page.locator('input[name="startTime"]').fill("18:30");
    await page.locator('select[name="repeatEndMode"]').selectOption("occurrence_count");
    await page.locator('input[name="repeatOccurrenceCount"]').fill("3");
    await page.locator("[data-recurrence-preview]").waitFor();
    assert.equal(await page.locator("[data-calendar-conflicts]").count(), 1);
    await page.getByText(labels.more, { exact: true }).click();
    assert.equal(await page.locator("[data-more-details]").evaluate((element) => element.open), true);
    await page.locator('select[name="linkedTrainingSessionId"]').selectOption("plan");
    assert.equal(await page.locator('input[name="planApplyMode"]').count(), 2);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${locale}/${width}: horizontal overflow`);
    }
  }

  await page.evaluate(() => window.qa.render("de", true));
  await page.getByText(/Noch keine Spieler im Kader/).waitFor();
  assert.equal(await page.getByRole("link", { name: "Spieler hinzufügen" }).count(), 1);
  await page.evaluate(() => window.qa.render("de", false, true));
  await page.locator("[data-edit-scope]").waitFor();
  assert.equal(await page.getByText("Eigene Auswahl", { exact: true }).count() > 0, true);
  assert.deepEqual(errors, []);
  console.log("Training Creation 2.0 browser regression: PASS (DE/EN, progressive disclosure, recurrence, conflict, empty Squad, 320/768/1440)");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
