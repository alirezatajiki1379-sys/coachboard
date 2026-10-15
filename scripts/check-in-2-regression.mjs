import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const qaRequire = createRequire(path.join(process.env.COACHBOARD_QA_DEPS ?? "/private/tmp/coachboard-stability-tests", "package.json"));
const { build } = qaRequire("esbuild");
const { chromium } = qaRequire("playwright");
const attendanceSource = readFileSync(path.join(root, "components/squad/attendance-controls.tsx"), "utf8");

assert.doesNotMatch(attendanceSource, /function InlineRatingControl/);
assert.match(attendanceSource, /type CheckInFilter = "open" \| "all"/);
assert.match(attendanceSource, /MarkAllPresentDialog/);
assert.match(attendanceSource, /Count as late arrival/);

const stubs = {
  "next/link": 'import React from "react"; export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}',
  "@/lib/squad/attendance-actions": `
    const ok=(fd)=>({ok:true,attendanceId:String(fd.get("attendanceId")),playerId:"player",status:String(fd.get("finalStatus")),actualAbsenceReason:fd.get("actualAbsenceReason")||null,actualAttendanceNote:fd.get("actualAttendanceNote")||null,lateMinutes:fd.get("lateMinutes")?Number(fd.get("lateMinutes")):null,leftEarlyMinute:fd.get("leftEarlyMinute")?Number(fd.get("leftEarlyMinute")):null,latePenaltyApplied:fd.get("latePenaltyApplied")==="on",overallRating:null,updatedAt:new Date().toISOString()});
    export async function updateFinalAttendanceInline(fd){await new Promise(r=>setTimeout(r,250));return window.qaFail?{ok:false,code:"network_error",message:"Changes could not be saved. Please try again."}:ok(fd)}
    export async function applyAttendanceAsExpected(){return {ok:true,updatedCount:0,reviewCount:0,updates:[]}}
    export async function completeTrainingEvent(){}
    export async function markAllExpectedPresent(){}
    export async function markAllPresent(){}
    export async function markAllExpected(){}
    export async function updateAttendanceRating(){return {ok:true,attendanceId:"a",playerId:"p",overallRating:null,updatedAt:"2026-10-16"}}
    export async function updatePlannedAttendanceInline(){return {ok:true,plannedStatus:"expected",plannedReason:null,plannedReasonNote:null}}
    export async function updatePlannedAttendance(){}
  `,
  "@/lib/squad/development-actions": "export async function createPlayerObservation(){}",
  "@/lib/squad/player-hub-actions": "export async function updatePlayerMedicalPeriodStatus(){}"
};

const bundle = await build({
  stdin: {
    contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {I18nProvider} from "@/components/i18n/i18n-provider";
      import {CheckInPanel} from "@/components/squad/attendance-controls";
      const root=createRoot(document.getElementById("root"));
      const player=(id,firstName,playerType="roster",extra={})=>({id,userId:"coach",firstName,lastName:"Example",position:id==="gk"?"GK":"CM",secondaryPositions:[],positionFamilies:[],strongFoot:undefined,club:undefined,playerType,archivedAt:undefined,createdAt:"2026-01-01",updatedAt:"2026-01-01",...extra});
      const entry=(id,firstName,extra={})=>({id,userId:"coach",eventId:"event",playerId:id,plannedStatus:"expected",latePenaltyApplied:true,sensitiveNote:false,player:player(id,firstName),createdAt:"2026-01-01",updatedAt:"2026-01-01",...extra});
      const unresolved=[
        entry("one","Anna"),
        entry("two","Bela",{plannedStatus:"unavailable",plannedReason:"K",plannedReasonNote:"Arzttermin"}),
        entry("three","Cem",{medicalAvailability:{periodId:"medical",type:"injured",label:"Injured",until:"2026-10-20",description:"private",needsReview:true}}),
        entry("four","Daria",{player:player("four","Daria","trial")})
      ];
      const event=(attendance)=>({id:"event",userId:"coach",date:"2026-10-16",startTime:"18:00",label:"Evening Training",status:"prepared",isSeriesException:false,attendance,createdAt:"2026-01-01",updatedAt:"2026-01-01"});
      window.qaFail=false;
      window.qa={render(locale="en",mode="open"){
        window.qaFail=mode==="failure";
        const fresh=unresolved.map((row)=>({...row,player:{...row.player},medicalAvailability:row.medicalAvailability?{...row.medicalAvailability}:undefined,...(mode==="complete"?{finalStatus:"present"}:{finalStatus:undefined})}));
        root.render(<I18nProvider locale={locale}><CheckInPanel event={event(fresh)} initialFilter={mode==="complete"?"all":"open"}/></I18nProvider>);
      }};
      window.qa.render("en");
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
    name: "check-in-fixture",
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
assert.ok(css, "Run npm run build before Check-in browser validation.");
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
  await page.getByText("0 of 4 recorded", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /Open 4/ }).count(), 1);
  assert.equal(await page.getByText("Rating", { exact: true }).count(), 0);
  assert.equal(await page.getByText("Trial player", { exact: true }).count(), 1);

  const anna = page.locator("article").filter({ hasText: "Anna Example" });
  await anna.getByRole("button", { name: "Present" }).click();
  assert.equal(await anna.count(), 1, "Present row stays visible while save is pending");
  await page.getByText("1 of 4 recorded", { exact: true }).waitFor();
  assert.equal(await anna.count(), 0, "Present row leaves Open after successful save");

  const bela = page.locator("article").filter({ hasText: "Bela Example" });
  await bela.getByRole("button", { name: "Absent" }).click();
  assert.equal(await bela.count(), 1, "Exception row remains visible before details save");
  assert.equal(await bela.getByLabel(/Reason/).inputValue(), "sick");
  await bela.getByRole("button", { name: "Save attendance details" }).click();
  await page.getByText("2 of 4 recorded", { exact: true }).waitFor();

  const cem = page.locator("article").filter({ hasText: "Cem Example" });
  await cem.getByRole("button", { name: "Late" }).click();
  assert.equal(await cem.getByText("Count as late arrival", { exact: true }).count(), 1);
  await cem.getByLabel("Late minutes").fill("8");
  await cem.getByRole("button", { name: "Save attendance details" }).click();
  await page.getByText("3 of 4 recorded", { exact: true }).waitFor();

  const daria = page.locator("article").filter({ hasText: "Daria Example" });
  await daria.getByRole("button", { name: "Left early" }).click();
  await daria.getByLabel(/Reason/).selectOption("other");
  await daria.getByLabel("Left after minute").fill("65");
  await daria.getByRole("button", { name: "Save attendance details" }).click();
  await page.getByText("Attendance complete", { exact: true }).first().waitFor();
  assert.equal(await page.getByRole("button", { name: /Open 0/ }).count(), 1);

  for (const locale of ["en", "de"]) {
    await page.evaluate((value) => window.qa.render(value, "open"), locale);
    await page.getByText(locale === "de" ? "0 von 4 erfasst" : "0 of 4 recorded", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: locale === "de" ? /Offen 4/ : /Open 4/ }).count(), 1);
    assert.equal(await page.getByRole("button", { name: locale === "de" ? "Anwesend" : "Present" }).first().isVisible(), true);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${locale}/${width}: horizontal overflow`);
    }
  }

  await page.evaluate(() => window.qa.render("de", "failure"));
  const failedRow = page.locator("article").filter({ hasText: "Anna Example" });
  await failedRow.getByRole("button", { name: "Anwesend" }).click();
  await failedRow.getByRole("alert").waitFor();
  assert.match(await failedRow.getByRole("alert").innerText(), /Änderungen konnten nicht gespeichert werden/);
  assert.equal(await failedRow.count(), 1, "Failed save restores and keeps the row visible");

  await page.evaluate(() => window.qa.render("de", "complete"));
  await page.getByText("Anwesenheit vollständig erfasst", { exact: true }).first().waitFor();
  assert.equal(await page.getByRole("link", { name: "Zurück zum Training" }).count(), 1);
  assert.deepEqual(errors, []);
  console.log("Check-in 2.0 regression: PASS (queue, exceptions, rollback, DE/EN, 320/768/1440 px)");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
