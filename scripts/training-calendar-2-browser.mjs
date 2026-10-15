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
  "@/lib/squad/attendance-actions": `
    export async function bulkMoveTrainingsToTrash(input){return {ok:true,message:"Moved",affectedIds:input.trainingIds}}
    export async function bulkPermanentlyDeleteTrainings(input){return {ok:true,message:"Deleted",affectedIds:input.trainingIds}}
    export async function bulkRestoreTrainings(input){return {ok:true,message:"Restored",affectedIds:input.trainingIds}}
    export async function deleteTrainingEvent(){}
    export async function permanentlyDeleteTrainingEvent(){}
    export async function restoreTrainingEvent(){}
  `
};

const bundle = await build({
  stdin: {
    contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {I18nProvider} from "@/components/i18n/i18n-provider";
      import {TrainingBulkManager} from "@/components/squad/training-bulk-manager";
      const root=createRoot(document.getElementById("root"));
      const attendance=Array.from({length:18},(_,index)=>({id:"a-"+index,plannedStatus:"expected",finalStatus:"present"}));
      const base={userId:"coach",squadId:"team",isSeriesException:false,participantSourceMode:"snapshot",status:"prepared",createdAt:"2026-10-01",updatedAt:"2026-10-16",attendance};
      const events=[
        {...base,id:"follow",date:"2026-10-15",startTime:"18:00",endTime:"19:30",label:"Reflection Training"},
        {...base,id:"today",date:"2026-10-16",startTime:"18:30",endTime:"20:00",label:"Evening Training",location:"Example Ground"},
        {...base,id:"next",date:"2026-10-18",startTime:"10:00",endTime:"11:30",label:"Recurring Training",recurrenceSeriesId:"series"},
        {...base,id:"later",date:"2026-10-30",startTime:"18:00",endTime:"19:30",label:"Later Training"}
      ];
      const workflows={
        follow:{phase:"follow_up",phaseLabel:"Follow-up",headline:"Review Training",reason:"Capture briefly what worked and what you want to carry forward.",primaryAction:{kind:"review",href:"/trainings/follow/review",label:"Review Training"},secondaryActions:[],facts:[{label:"Attendance",value:"All attendance recorded"}],ratingsStarted:false},
        today:{phase:"preparation",phaseLabel:"Preparation",headline:"Prepare Training",primaryAction:{kind:"plan",href:"/trainings/today/plan",label:"Prepare Training"},secondaryActions:[],facts:[{label:"Plan",value:"Ready"},{label:"Attendance",value:"{count} expected",values:{count:18}}],ratingsStarted:false},
        next:{phase:"preparation",phaseLabel:"Preparation",headline:"Plan Training",primaryAction:{kind:"plan",href:"/trainings/next/plan",label:"Plan Training"},secondaryActions:[],facts:[{label:"Plan",value:"Not prepared"},{label:"Attendance",value:"{count} expected",values:{count:18}}],ratingsStarted:false},
        later:{phase:"preparation",phaseLabel:"Preparation",headline:"Plan Training",primaryAction:{kind:"plan",href:"/trainings/later/plan",label:"Plan Training"},secondaryActions:[],facts:[{label:"Plan",value:"Not prepared"},{label:"Attendance",value:"{count} expected",values:{count:18}}],ratingsStarted:false}
      };
      const copy={en:{follow:"Follow-up",upcoming:"Upcoming Trainings",today:"Today",next:"Next 7 days",later:"Later",empty:"No training is planned yet."},de:{follow:"Nachbereitung",upcoming:"Anstehende Trainings",today:"Heute",next:"Nächste 7 Tage",later:"Später",empty:"Noch kein Training geplant."}};
      const trash=[{...base,id:"trash",date:"2026-10-01",startTime:"18:00",label:"Deleted Training",deletedAt:"2026-10-16"}];
      window.qa={render(locale="en",mode="current"){
        const c=copy[locale];
        const props=mode==="trash"?{initialEvents:trash,sections:[{id:"trash",label:locale==="de"?"Papierkorb":"Trash",eventIds:["trash"]}],workflowByEventId:{},emptyMessage:locale==="de"?"Papierkorb ist leer.":"Trash is empty.",isTrash:true}:{initialEvents:events,sections:[{id:"follow",label:"",groupLabel:c.follow,eventIds:["follow"]},{id:"today",label:c.today,groupLabel:c.upcoming,eventIds:["today"]},{id:"next",label:c.next,eventIds:["next"]},{id:"later",label:c.later,eventIds:["later"]}],workflowByEventId:workflows,emptyMessage:c.empty,isTrash:false};
        root.render(<I18nProvider locale={locale}><TrainingBulkManager {...props} activeTeamId="team" activeTeamName="Fictional U15" filterLabel={mode==="trash"?"Trash":"Current"} locale={locale}/></I18nProvider>);
      }};
      window.qa.render("en","current");
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
    name: "training-calendar-fixture",
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
assert.ok(css, "Run npm run build before Training Calendar browser validation.");
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
  await page.locator("[data-training-calendar-sections]").waitFor();

  for (const locale of ["en", "de"]) {
    await page.evaluate((value) => window.qa.render(value, "current"), locale);
    const expected = locale === "de"
      ? { follow: "Nachbereitung", upcoming: "Anstehende Trainings", today: "Heute", next: "Nächste 7 Tage", later: "Später" }
      : { follow: "Follow-up", upcoming: "Upcoming Trainings", today: "Today", next: "Next 7 days", later: "Later" };
    await page.getByRole("heading", { name: expected.follow, exact: true }).waitFor();
    await page.getByRole("heading", { name: expected.upcoming, exact: true }).waitFor();
    assert.ok((await page.locator("[data-training-calendar-section='today']").innerText()).includes(expected.today));
    assert.ok((await page.locator("[data-training-calendar-section='next']").innerText()).includes(expected.next));
    assert.ok((await page.locator("[data-training-calendar-section='later']").innerText()).includes(expected.later));
    assert.equal(await page.getByText("Review missing", { exact: true }).count(), 0);
    assert.equal(await page.getByText(/0\/18 rated|0\/18 bewertet/i).count(), 0);
    assert.equal(await page.locator("a.app-button[href='/trainings/today/plan']").innerText(), locale === "de" ? "Training vorbereiten" : "Prepare Training");

    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${locale}/${width}: horizontal overflow`);
      const row = page.locator("[data-training-calendar-row]").first();
      const before = await row.boundingBox();
      await row.hover();
      const after = await row.boundingBox();
      assert.ok(before && after && Math.abs(before.x - after.x) < 0.5 && Math.abs(before.y - after.y) < 0.5 && Math.abs(before.width - after.width) < 0.5 && Math.abs(before.height - after.height) < 0.5, `${locale}/${width}: hover moved a Training row`);
    }

    await page.getByRole("button", { name: locale === "de" ? "Auswählen" : "Select" }).click();
    assert.equal(await page.getByRole("checkbox", { name: locale === "de" ? "Alle auswählen" : "Select all" }).count(), 1);
    await page.getByRole("checkbox", { name: locale === "de" ? "Alle auswählen" : "Select all" }).check();
    assert.equal(await page.locator("[data-training-selection-list] article").count(), 4);
    assert.equal(await page.locator("[data-training-selection-list]").getByText(locale === "de" ? "Vorbereitung" : "Preparation", { exact: true }).count(), 0);

    await page.evaluate((value) => window.qa.render(value, "trash"), locale);
    await page.locator("[data-workflow-phase='trash']").waitFor();
    assert.equal(await page.locator("[data-workflow-phase='trash'] a").count(), 0, `${locale}: Trash must not render workflow links`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  }
  assert.deepEqual(errors, []);
  console.log("Training Calendar 2.0 browser regression: PASS (DE/EN at 320, 768, 1440 px; hierarchy, selection, Trash)");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
