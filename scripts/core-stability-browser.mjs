import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// Optional QA tools are installed outside the app. No test routes or data enter Production.
const qaRequire = createRequire(path.join(process.env.COACHBOARD_QA_DEPS ?? "/private/tmp/coachboard-stability-tests", "package.json"));
const { build } = qaRequire("esbuild");
const { chromium } = qaRequire("playwright");
const root = process.cwd();
const stubs = {
  "next/link": 'import React from "react"; export default function Link({href,children,...props}) {return <a href={href} {...props}>{children}</a>}',
  "@/lib/squad/session-review-actions": `export async function saveTrainingSessionReview(_previous,data) {
    window.qa.saves.push(Object.fromEntries(data));
    if(window.qa.delay) await new Promise(resolve=>setTimeout(resolve,500));
    if(window.qa.fail) throw new Error("Simulated connection failure");
    return {success:"Saved",submissionId:Date.now()};
  }`,
  "@/lib/squad/attendance-actions": `
    export async function updateAttendanceRating(data) { window.qa.saves.push(Object.fromEntries(data)); if(window.qa.fail) throw new Error("Offline"); return {ok:true, overallRating: data.get("overallRating") ? Number(data.get("overallRating")) : null}; }
    export const updateAttendanceRatingInline=updateAttendanceRating;
    export async function updateFinalAttendanceInline(data) { window.qa.saves.push(Object.fromEntries(data)); if(window.qa.fail) throw new Error("Offline"); return {ok:true,status:data.get("finalStatus"),actualAbsenceReason:data.get("actualAbsenceReason"),overallRating:null,latePenaltyApplied:true}; }
    export const completeTrainingEvent=()=>{};
    export const markAllExpectedPresent=()=>{};
    export const markAllPresent=()=>{};
    export const markAllExpected=()=>{};
    export const updateFinalAttendance=()=>{};
    export const updatePlannedAttendanceInline=()=>{};
    export const updatePlannedAttendance=()=>{};
  `,
  "@/lib/squad/player-hub-actions": "export const updatePlayerMedicalPeriodStatus=()=>{};",
  "@/lib/squad/development-actions": "export const createPlayerObservation=()=>{};"
};
const bundle = await build({
  stdin: { contents: `
    import React from "react";
    import {createRoot} from "react-dom/client";
    import {SessionReviewForm} from "@/components/squad/session-review-form";
    import {RatingRow,CheckInRow} from "@/components/squad/attendance-controls";
    import {I18nProvider} from "@/components/i18n/i18n-provider";
    import {GermanLocalizationBoundary} from "@/components/i18n/german-localization-boundary";
    window.qa={fail:false,delay:false,saves:[]};
    const params=new URLSearchParams(location.search);
    const locale=params.get("locale")||"en";
    const view=params.get("view")||"review";
    const entry={id:"entry",eventId:"event",playerId:"player",plannedStatus:"expected",finalStatus:"present",overallRating:params.has("unrated")?undefined:4,latePenaltyApplied:true,player:{firstName:"Fictional",lastName:"Player",playerType:"roster",position:"CM",secondaryPositions:[]}};
    const review={objectiveOutcome:"achieved",overallQuality:4,intensity:3,playerResponse:5,workedWell:"Existing feedback",drillReviews:[]};
    const root=createRoot(document.getElementById("root"));
    function render(){root.render(<I18nProvider locale={locale}><GermanLocalizationBoundary locale={locale}>
    {view==="review" ? <SessionReviewForm event={{id:"event",date:"2026-09-19",startTime:"18:00",label:"QA Training",squadName:"QA Team"}} review={review} drills={[]} attendanceSummary={{present:2,late:1,absent:1,total:3}} ratingsSummary={{rated:1,rateable:2}} observationCount={0} locale={locale}/>
    :view==="rating" ? <RatingRow entry={entry} eventId="event"/> : <CheckInRow entry={entry} eventId="event" eventDate="2026-09-19"/>}
    </GermanLocalizationBoundary></I18nProvider>);}
    render();
    window.qa.refreshUnrated=()=>{entry.overallRating=undefined;render();};
  `, resolveDir: root, loader: "tsx" },
  bundle: true, write: false, format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "isolated-qa", setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => {
      if (stubs[args.path]) return { path: args.path, namespace: "qa-stub" };
      if (args.path.startsWith("@/")) {
        const filename = path.join(root, args.path.slice(2));
        const resolved = [filename, `${filename}.ts`, `${filename}.tsx`, path.join(filename, "index.ts")].find((name) => existsSync(name) && !name.endsWith("/i18n"));
        return { path: resolved };
      }
    });
    builder.onLoad({ filter: /.*/, namespace: "qa-stub" }, (args) => ({ contents: stubs[args.path], loader: "tsx", resolveDir: root }));
  } }]
});
const cssDir = path.join(root, ".next/static/css");
const css = existsSync(cssDir) ? readdirSync(cssDir).filter((name) => name.endsWith(".css")).map((name) => readFileSync(path.join(cssDir, name), "utf8")).join("\n") : "";
assert.ok(css, "Run npm run build before responsive browser checks so the real app styles are available.");
const server = createServer((request, response) => {
  if (request.url === "/bundle.js") { response.setHeader("Content-Type", "application/javascript"); response.end(bundle.outputFiles[0].text); }
  else { response.setHeader("Content-Type", "text/html"); response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main id="root" style="max-width:1200px;margin:auto;padding:12px"></main><script src="/bundle.js"></script></body></html>`); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.COACHBOARD_QA_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.goto(base);
  await page.getByText("QA Training", { exact: true }).waitFor();
  assert.equal(await page.locator('button[aria-label^="Overall quality:"] svg.fill-current').count(), 4);
  assert.equal(await page.locator('button[aria-label^="Intensity:"] svg.fill-current').count(), 3);
  assert.equal(await page.locator('button[aria-label^="Player response:"] svg.fill-current').count(), 5);
  const note = page.getByRole("textbox").first();
  const save = page.getByRole("button", { name: "Save review", exact: true }).first();
  await note.fill("Long feedback. ".repeat(600));
  await page.evaluate(() => { window.qa.fail = true; });
  await save.click();
  await page.getByText("Review could not be saved.", { exact: false }).waitFor();
  assert.equal((await note.inputValue()).length, "Long feedback. ".repeat(600).length);
  assert.ok(await page.getByText("Unsaved changes", { exact: true }).count());
  await page.evaluate(() => { window.qa.fail = false; });
  await save.click();
  await page.getByText("Saved", { exact: true }).waitFor();
  await note.fill("Edited after a successful save");
  await page.getByText("Unsaved changes", { exact: true }).first().waitFor();
  assert.equal(await page.getByText("Saved", { exact: true }).count(), 0);
  await page.evaluate(() => { window.qa.delay = true; });
  await save.click();
  await note.fill("Edited while the request is pending");
  await save.waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled);
  assert.ok(await page.getByText("Unsaved changes", { exact: true }).count());
  assert.equal(await note.inputValue(), "Edited while the request is pending");
  console.log("PASS: review failure, long text, success baseline, edits during save");

  for (const view of ["rating", "check-in"]) {
    await page.goto(`${base}?view=${view}`);
    const ratingButtons = view === "rating" ? page.locator('[role="group"]').first().getByRole("button") : page.getByRole("button", { name: /^Rating [1-5]/ });
    assert.equal(await ratingButtons.nth(3).getAttribute("aria-pressed"), "true");
    await ratingButtons.nth(3).click();
    assert.equal(await ratingButtons.nth(3).getAttribute("aria-pressed"), "false");
    await ratingButtons.nth(2).click();
    assert.equal(await ratingButtons.nth(2).getAttribute("aria-pressed"), "true");
    if (view === "rating") {
      const button = page.getByRole("button", { name: "Save rating", exact: true });
      await page.getByRole("textbox").first().fill("Keep this coach note");
      await page.evaluate(() => { window.qa.fail = true; });
      await button.click();
      await page.getByRole("alert").waitFor();
      assert.equal(await page.getByRole("textbox").first().inputValue(), "Keep this coach note");
      await page.evaluate(() => { window.qa.fail = false; });
      await ratingButtons.nth(2).click();
      await button.click();
      await page.getByRole("status").waitFor();
      await page.evaluate(() => window.qa.refreshUnrated());
      assert.equal(await page.locator('[role="group"]').first().locator('[aria-pressed="true"]').count(), 0);
    } else {
      await page.evaluate(() => { window.qa.fail = true; });
      await page.getByRole("button", { name: "Absent", exact: true }).click();
      await page.getByRole("alert").waitFor();
      assert.equal(await page.getByRole("button", { name: "Present", exact: true }).getAttribute("aria-pressed"), "true");
    }
    console.log(`PASS: ${view} rating toggle and failure recovery`);
  }
  await page.goto(`${base}?view=rating&unrated=1`);
  assert.equal(await page.locator('[role="group"]').first().getByRole("button").nth(2).getAttribute("aria-pressed"), "true");
  assert.equal(await page.evaluate(() => window.qa.saves.length), 0);
  console.log("PASS: eligible default 3 has no save-on-open side effect");
  for (const locale of ["en", "de"]) {
    for (const width of [375, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const view of ["review", "rating", "check-in"]) {
        await page.goto(`${base}?locale=${locale}&view=${view}`);
        await page.getByText(view === "review" ? "QA Training" : "Fictional Player", { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${view} ${locale} ${width}px overflow`);
      }
    }
  }
  await page.goto(`${base}?locale=de`);
  await page.getByText("Übungsrückmeldung", { exact: true }).waitFor();
  await page.screenshot({ path: "/private/tmp/coachboard-review-qa.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log("PASS: review, ratings and check-in at 375/430/768/1440px in EN/DE; no browser page errors");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
