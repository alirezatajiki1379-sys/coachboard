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
  "@/lib/squad/staff-brief-actions": 'export async function saveStaffBriefContent(){return {ok:true,message:"Briefing text saved."}};',
  "next/cache": "export const revalidatePath=()=>{};"
};

const bundle = await build({
  stdin: {
    contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {I18nProvider} from "@/components/i18n/i18n-provider";
      import {StaffBriefComposer} from "@/components/squad/staff-brief-composer";
      const locale=new URLSearchParams(location.search).get("locale")==="de"?"de":"en";
      window.qa={copied:"",shared:"",printed:false};
      const emptyVisual={graphic:{version:1,pitch:"Full football pitch",pitchStyle:"Plain green",objects:[]},source:"editor"};
      const data={eventId:"event",title:"Fictional Training",team:"U15 Fictional Training Team",date:"2026-09-21",startTime:"18:00",endTime:"19:30",location:"Example pitch",objective:"Create overloads",staff:[{id:"tobi",name:"Tobi Example",role:"Assistant Coach",isActive:true},{id:"alex",name:"Alex Example",role:"Head Coach",isActive:true}],counts:{expected:18,goalkeepers:2,fieldPlayers:16,unavailable:4,unclear:0,trials:1},expectedNames:["Fictional Player One","Fictional Player Two"],sections:[{id:"warm-up",key:"warm-up",title:"Warm-up",orderIndex:0,durationMinutes:10,notes:"",briefingText:"Ball activation",responsibilityMode:"staff",staffId:"tobi",planningStatus:"needs_planning",instruction:"Plan a short activation.",drills:[]},{id:"main",key:"main",title:"Main Part",orderIndex:1,durationMinutes:25,notes:"",briefingText:"",responsibilityMode:"staff",staffId:"alex",planningStatus:"ready",instruction:"",drills:[{id:"drill",title:"Passing sequence",durationMinutes:25,fallbackText:"Pass through pressure.",briefingText:"",organization:"",sessionNote:"",coachingPoints:["Open body shape","Play forward"],equipment:["8 balls"],visual:emptyVisual,planningInstruction:""}]}]};
      createRoot(document.getElementById("root")).render(<I18nProvider locale={locale}><StaffBriefComposer data={data} locale={locale}/></I18nProvider>);
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
    name: "staff-brief-fixture",
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => {
        if (stubs[args.path]) return { path: args.path, namespace: "stub" };
        if (args.path.startsWith("@/")) {
          const base = path.join(root, args.path.slice(2));
          return { path: [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) };
        }
      });
      builder.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: stubs[args.path], loader: "js" }));
    }
  }]
});

const css = readdirSync(path.join(root, ".next/static/css"))
  .filter((name) => name.endsWith(".css"))
  .map((name) => readFileSync(path.join(root, ".next/static/css", name), "utf8"))
  .join("\n");
const server = createServer((request, response) => {
  if (request.url === "/bundle.js") {
    response.setHeader("Content-Type", "application/javascript");
    response.end(bundle.outputFiles[0].text);
    return;
  }
  response.setHeader("Content-Type", "text/html");
  response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main id="root"></main><script src="/bundle.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;

try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.COACHBOARD_QA_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const page = await browser.newPage({ hasTouch: true });
  const errors = [];
  page.on("pageerror", (error) => { errors.push(error.message); console.error(`Browser error: ${error.message}`); });
  page.on("console", (message) => { if (message.type() === "error") console.error(`Browser console: ${message.text()}`); });
  for (const locale of ["en", "de"]) {
    for (const width of [375, 430, 1024, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      await page.goto(`${base}?locale=${locale}`);
      await page.getByRole("button", { name: locale === "de" ? "Text kopieren" : "Copy text" }).waitFor();
      await page.getByText(locale === "de" ? "Passt auf eine Seite" : "Fits on one page", { exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${locale} Staff Brief must not create horizontal page overflow at ${width}px`);
      const smallFields = await page.locator("textarea,select").evaluateAll((elements) => elements.filter((element) => element.getBoundingClientRect().width && innerWidth < 768 && parseFloat(getComputedStyle(element).fontSize) < 16).length);
      assert.equal(smallFields, 0, `${locale} Staff Brief fields must avoid iOS focus zoom at ${width}px`);
    }

    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto(`${base}?locale=${locale}`);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.qa.copied = text; } } });
      Object.defineProperty(navigator, "share", { configurable: true, value: async (data) => { window.qa.shared = data.text; } });
      window.print = () => { window.qa.printed = true; };
    });
    const copy = page.getByRole("button", { name: locale === "de" ? "Text kopieren" : "Copy text" });
    await copy.click();
    assert.ok(!(await page.evaluate(() => window.qa.copied)).includes("Fictional Player One"), "Player names must remain excluded by default");
    await page.getByRole("checkbox", { name: locale === "de" ? "Spielernamen einbeziehen" : "Include Player names" }).check();
    await copy.click();
    assert.ok((await page.evaluate(() => window.qa.copied)).includes("Fictional Player One"), "Player names are included only after opt-in");
    await page.getByRole("button", { name: locale === "de" ? "Teilen" : "Share" }).click();
    assert.ok((await page.evaluate(() => window.qa.shared)).includes("Tobi Example"), "Web Share must receive the current brief");
    await page.evaluate(() => { Object.defineProperty(navigator, "share", { configurable: true, value: undefined }); window.qa.copied = ""; });
    await page.getByRole("button", { name: locale === "de" ? "Teilen" : "Share" }).click();
    assert.ok((await page.evaluate(() => window.qa.copied)).includes("Tobi Example"), "Share must fall back to Copy text");
    await page.getByRole("button", { name: locale === "de" ? "Drucken / PDF" : "Print / PDF" }).click();
    assert.equal(await page.evaluate(() => window.qa.printed), true);
    await page.emulateMedia({ media: "print" });
    assert.equal(await copy.isVisible(), false, "print must hide composer actions");
    const pdf = await page.pdf({ path: `/private/tmp/coachboard-staff-brief-focused-${locale}.pdf`, format: "A4", printBackground: true });
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    assert.equal((pdf.toString("latin1").match(/\/Type \/Page(?!s)/g) ?? []).length, 1, "focused Staff Brief fixture must export as one A4 page");
    await page.emulateMedia({ media: "screen" });
    await page.screenshot({ path: `/private/tmp/coachboard-staff-brief-focused-${locale}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log("Staff Brief browser regression: PASS (EN/DE, 375/430/1024/1440, copy/share/fallback/print/PDF)");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
