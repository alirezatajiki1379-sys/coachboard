import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const qaRequire = createRequire(path.join(process.env.COACHBOARD_QA_DEPS ?? "/private/tmp/coachboard-stability-tests", "package.json"));
const { build } = qaRequire("esbuild");
const { chromium } = qaRequire("playwright");
const output = process.env.COACHBOARD_QA_OUTPUT ?? "/private/tmp/coachboard-training-plan-builder-2-screenshots";
mkdirSync(output, { recursive: true });

// Real shared builder, previews, calculations, drafts and dialogs. Only navigation and
// the server action are fixture boundaries: these tests never write to Supabase.
const bundle = await build({
  stdin: { resolveDir: root, loader: "tsx", contents: `
    import React from "react";
    import {createRoot} from "react-dom/client";
    import {I18nProvider} from "@/components/i18n/i18n-provider";
    import {GermanLocalizationBoundary} from "@/components/i18n/german-localization-boundary";
    import {SessionForm} from "@/components/sessions/session-form";
    import {createSystemTranslator} from "@/lib/i18n/system-text";
    import {calculateSessionDuration,calculateSessionMaterials} from "@/lib/sessions/utils";
    const params=new URLSearchParams(location.search);
    const locale=params.get("locale")==="de"?"de":"en";
    const mode=params.get("mode")||"session";
    const concrete=mode==="session";
    const ui=createSystemTranslator(locale);
    const graphic={version:1,pitch:"Full football pitch",pitchStyle:"Plain green",objects:[
      {id:"label",type:"text",x:310,y:230,rotation:0,color:"#ffffff",label:"Fictional drill"},
      {id:"line",type:"arrow",x:300,y:270,endX:500,endY:330,rotation:0,color:"#ffdd00",lineStyle:"solid",arrowHead:true}
    ]};
    const drill={id:"alpha",userId:"fixture",title:"Passing",shortDescription:"Source description",ageMode:"specific_groups",ageGroups:["U13"],
      mainFocus:"Passing",trainingBlocks:["Main part 1"],drillType:"Technical drill",durationMinutes:15,minPlayers:4,maxPlayers:12,
      organization:"Source organization",coachingPoints:"Point One\\nPoint Two\\nPoint Three\\nPoint Four\\nPoint Five",
      materials:[{type:"cones",quantity:8,color:"Blue",label:"Passing"},{type:"balls",quantity:6,variant:"football"}],
      difficultyLevel:3,intensityLevel:4,isFavorite:false,tags:[],status:"published",createdAt:"2026-01-01",updatedAt:"2026-10-01",visual:{source:"editor",graphic}};
    const drills=[drill,{...drill,id:"beta",title:"Fictional Finishing",mainFocus:"Finishing",durationMinutes:10,materials:[{type:"balls",quantity:2}]},
      {...drill,id:"snapshot",title:"Historical Snapshot",isSessionSnapshot:true,sourceDrillId:"alpha"}];
    const section=(id,title,orderIndex)=>({id,key:id,title,orderIndex,durationMinutes:0,notes:"",responsibilityMode:"unassigned",staffId:"",planningStatus:"ready",instruction:"",briefingText:""});
    const values={title:"Fictional Training",sessionDate:"2026-11-09",startTime:"18:30",teamAgeGroup:"U13",mainFocus:"Passing",secondaryFocus:"",expectedPlayers:"18",durationTargetMinutes:"75",location:"Fictional pitch",notes:"",playerGroups:[],
      sections:concrete?[section("activation","Activation",0),section("main-part","Main Part",1)]:undefined,drills:params.has("snapshot")?[{id:"historical",drillId:"snapshot",block:"activation",plannedDurationMinutes:15,coachNotes:"",orderIndex:0,timingMode:"sequential",simultaneousGroup:"set-1",participatingGroups:[],startingGroup:""}]:[]};
    const saved=JSON.parse(localStorage.getItem("fixture-saved")||"null");
    window.qa={ui,calls:0,fail:false,source:JSON.stringify(drills),duration:calculateSessionDuration,materials:calculateSessionMaterials,drills};
    const action=async(_,data)=>{
      const payload=JSON.parse(data.get("sessionPayload"));window.qa.calls++;
      if(window.qa.fail)return {error:"Title is required",fieldErrors:{title:"Title is required"},values:payload,submissionId:String(Date.now())};
      localStorage.setItem("fixture-saved",JSON.stringify(payload));location.assign(location.href);return {};
    };
    createRoot(document.getElementById("root")).render(<I18nProvider locale={locale}><GermanLocalizationBoundary locale={locale}><main className="mx-auto max-w-7xl p-3 sm:p-6">
      <SessionForm action={action} mode="create" builderMode={mode} eventId={concrete?"fixture-event":undefined} drills={drills} initialValues={saved||values}
        staff={[{id:"coach-a",name:"Coach A",isActive:true},{id:"coach-b",name:"Coach B",isActive:true}]}
        carryForwardContext={concrete?{sourceDate:"2026-11-08",sourceLabel:"Previous session",nextTrainingNote:"Keep original review note"}:null}/>
    </main></GermanLocalizationBoundary></I18nProvider>);
  ` },
  bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "fixture-boundaries", setup(builder) {
    builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "stub" }));
    builder.onResolve({ filter: /^@\// }, ({ path: name }) => {
      const base = path.join(root, name.slice(2));
      return { path: [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) };
    });
    builder.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ resolveDir: root, loader: "tsx", contents: 'import React from "react";export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}' }));
  } }]
});
const css = readdirSync(path.join(root, ".next/static/css")).filter((name) => name.endsWith(".css")).map((name) => readFileSync(path.join(root, ".next/static/css", name), "utf8")).join("\n");
const server = createServer((request, response) => {
  response.setHeader("Content-Type", request.url === "/bundle.js" ? "application/javascript" : "text/html");
  response.end(request.url === "/bundle.js" ? bundle.outputFiles[0].text : `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.COACHBOARD_QA_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const page = await browser.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  const t = (source) => page.evaluate((value) => window.qa.ui(value), source);
  const payload = () => page.locator('input[name="sessionPayload"]').inputValue().then(JSON.parse);
  const cards = () => page.locator("[data-session-drill-card]");
  const fits = async (context) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), context);
  const summary = async (scope, name) => scope.locator("summary").filter({ hasText: new RegExp(`^${await t(name)}$`) });
  const openDetails = async (card) => {
    if (!await card.locator("details").first().getAttribute("open").then((value) => value !== null)) await (await summary(card, "Details")).click();
  };
  const openPicker = async (section) => {
    const button = page.locator(`[data-plan-section="${section}"]`).getByRole("button", { name: await t("Add Drill"), exact: true });
    await button.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.equal(await dialog.getByLabel(await t("Training section"), { exact: true }).inputValue(), section);
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), "INPUT", "picker focuses search");
    return dialog;
  };
  const add = async (dialog, title) => {
    await dialog.getByLabel(await t("Search drills"), { exact: true }).fill(title);
    const entry = dialog.locator("li").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await entry.getByRole("button", { name: new RegExp(`${await t("Add")}|${await t("Add again")}`) }).click();
  };
  const closePicker = async () => { await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "hidden" }); };
  const fresh = async (locale, mode, extra = "") => {
    await page.goto(`${base}/builder?locale=${locale}&mode=${mode}${extra}`);
    await page.locator("form").waitFor();
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator("form").waitFor();
  };
  for (const locale of process.env.COACHBOARD_QA_ADVANCED_ONLY ? [] : ["en", "de"]) {
    for (const mode of ["session", "template"]) {
      for (const width of [320, 768, 1440, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        await fresh(locale, mode);
        const concrete = mode === "session";
        const first = concrete ? "activation" : "Warm-up";
        const second = concrete ? "main-part" : "Main part 1";
        const metadata = await summary(page, concrete ? "Edit Training details" : "Training plan details");
        assert.equal(await metadata.locator("..").evaluate((node) => node.open), !concrete);
        if (concrete) assert.match(await page.locator("header").innerText(), /09.*2026.*18:30/);
        assert.equal(await page.getByRole("heading", { name: "Add drills from library", exact: true }).count(), 0);
        let dialog = await openPicker(first);
        await dialog.getByRole("button", { name: await t("Done"), exact: true }).focus();
        await page.keyboard.press("Tab");
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), await t("Close"), "focus is trapped");
        await (await summary(dialog, "Filters")).click();
        for (const [label, value] of [["Age group", "U13"], ["Focus", "Passing"], ["Block", "Main part 1"], ["Drill type", "Technical drill"]]) {
          await dialog.getByLabel(await t(label), { exact: true }).selectOption(value);
        }
        assert.equal(await dialog.getByRole("heading", { level: 3 }).count(), 1, "combined filters and snapshot exclusion");
        await fits(`picker ${mode} ${locale} ${width}`);
        await page.screenshot({ path: path.join(output, `picker-${mode}-${locale}-${width}.png`) });
        await dialog.getByLabel(await t("Search drills"), { exact: true }).fill("no such fictional drill");
        await dialog.getByText(await t("No drills match these filters. Clear the filters or create a drill in the library first."), { exact: true }).waitFor();
        await add(dialog, "Passing");
        await add(dialog, "Passing");
        assert.equal(await dialog.getByText(await page.evaluate(() => window.qa.ui("Already {count} times in plan", { count: 2 })), { exact: true }).count(), 1);
        await closePicker();
        await page.locator("canvas").first().waitFor();
        assert.ok(await page.locator("canvas").first().evaluate((canvas) => canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data.some((value) => value !== 0)), "real drill graphic remains visible");
        assert.equal(await page.evaluate(() => document.activeElement?.textContent), await t("Add Drill"), "focus returns to section action");
        let data = await payload();
        assert.equal(data.drills.length, 2);
        assert.notEqual(data.drills[0].id, data.drills[1].id);
        assert.ok(data.drills.every((item) => item.block === first && item.timingMode === "sequential" && item.plannedDurationMinutes === 15));
        await cards().first().getByLabel(await t("Planned duration"), { exact: true }).fill("12");
        assert.match(await page.locator("[data-plan-duration]").innerText(), /^27 \/ 75/);
        assert.equal(await cards().first().getByLabel(await t("Run mode"), { exact: true }).isVisible(), false);
        const originalFirst = data.drills[0].id;
        await cards().first().getByRole("button", { name: await t("Move drill down"), exact: true }).click();
        assert.equal((await payload()).drills[1].id, originalFirst);
        await cards().last().getByRole("button", { name: await t("Move drill up"), exact: true }).click();
        assert.equal((await payload()).drills[0].id, originalFirst);
        if (!concrete) {
          // Empty reusable blocks are offered by the global picker, even when no card exists yet.
          await page.getByRole("button", { name: await t("Add Drill"), exact: true }).first().click();
          dialog = page.getByRole("dialog");
          await dialog.getByLabel(await t("Training section"), { exact: true }).selectOption(second);
        } else dialog = await openPicker(second);
        await add(dialog, "Fictional Finishing");
        await closePicker();
        assert.equal((await payload()).drills[2].block, second);
        await openDetails(cards().first());
        await cards().first().getByLabel(await t("Run mode"), { exact: true }).selectOption("simultaneous");
        await cards().first().getByLabel(await t("Station set"), { exact: true }).waitFor();
        await cards().first().getByRole("button", { name: await t("Set up player groups"), exact: true }).click();
        await page.getByRole("button", { name: await t("Add player group"), exact: true }).click();
        await page.getByRole("button", { name: await t("Add player group"), exact: true }).click();
        data = await payload();
        for (const group of data.playerGroups) await cards().first().getByRole("checkbox", { name: await t(group.name), exact: true }).check();
        await cards().first().getByLabel(await t("Starting player group"), { exact: true }).selectOption(data.playerGroups[1].id);
        await openDetails(cards().nth(1));
        await cards().nth(1).getByLabel(await t("Run mode"), { exact: true }).selectOption("simultaneous");
        data = await payload();
        assert.equal(await page.evaluate((drills) => window.qa.duration(drills), data.drills), 34, "max(12x2,15) +10, not sequential sum");
        assert.match(await page.locator("[data-plan-duration]").innerText(), /^34 \/ 75/);
        const materials = await page.locator("aside").filter({ has: page.locator("summary").filter({ hasText: await t("Material summary") }) }).innerText();
        assert.ok(materials.includes("16") && materials.includes("12"), "simultaneous materials add; other slots use max");
        await cards().nth(1).getByLabel(await t("Station set"), { exact: true }).selectOption("set-2");
        assert.match(await page.locator("[data-plan-duration]").innerText(), /^49 \/ 75/);
        if (locale === "de") assert.ok((await page.locator("[data-plan-duration]").innerText()).includes("Minuten frei"));
        await cards().nth(1).getByLabel(await t("Run mode"), { exact: true }).selectOption("sequential");
        data = await payload();
        assert.deepEqual(data.drills.find((item) => item.timingMode === "sequential" && item.block === first).participatingGroups, []);
        await fits(`advanced ${mode} ${locale} ${width}`);
        await page.screenshot({ path: path.join(output, `${mode}-${locale}-${width}-advanced.png`), fullPage: true });
        while (await cards().locator(":scope > details[open]").count()) await cards().locator(":scope > details[open]").first().locator(":scope > summary").click();
        await (await summary(page, "Player groups")).click();
        await page.screenshot({ path: path.join(output, `${mode}-${locale}-${width}.png`), fullPage: true });
        await fits(`compact ${mode} ${locale} ${width}`);
        const beforeSave = await payload();
        assert.equal(await page.evaluate(() => window.qa.calls), 0, "all edits remain local until explicit Save");
        await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: await t(concrete ? "Save Session Plan" : "Create training plan"), exact: true }).click()]);
        await page.waitForFunction(() => localStorage.getItem("fixture-saved") !== null);
        await page.waitForLoadState("load");
        await page.locator("form").waitFor();
        assert.deepEqual(await payload(), beforeSave, "mock save + full reload retain canonical payload");
        assert.equal(await page.evaluate(() => localStorage.getItem("coachboard:draft:session:" + (new URLSearchParams(location.search).get("mode") === "session" ? "fixture-event" : "new"))), null);
        console.log(`PASS ${mode}, ${locale}, ${width}px: picker, filters, duplicate, duration, reorder, station/groups, materials, mock-save/reload`);
      }
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await fresh("en", "session", "&snapshot=1");
  const snapshotPicker = await openPicker("activation");
  assert.equal(await snapshotPicker.getByText("Already 1 times in plan", { exact: true }).count(), 1, "saved snapshot counts against its source without becoming a live reference");
  await closePicker();
  await page.getByRole("button", { name: "Add to planning notes", exact: true }).click();
  assert.ok((await payload()).mainFocus.includes("Keep original review note") || (await payload()).notes.includes("Keep original review note"));
  const firstSection = page.locator('[data-plan-section="activation"]');
  await (await summary(firstSection, "Section settings")).click();
  await firstSection.getByLabel("Section duration", { exact: true }).fill("30");
  await firstSection.getByLabel("Responsibility", { exact: true }).first().selectOption("staff");
  await firstSection.getByLabel("Staff member", { exact: true }).selectOption("coach-a");
  await firstSection.getByLabel("Section notes", { exact: true }).fill("Keep section note");
  await firstSection.getByLabel("Briefing text", { exact: true }).first().fill("Keep section briefing");
  await openDetails(cards().first());
  await (await summary(cards().first(), "Customize for this Training")).click();
  const card = cards().first();
  for (const [label, value] of [["Session title", "Keep session title"], ["Organization", "Keep organization"], ["Session note", "Keep note"], ["Session description", "Keep description"], ["Briefing text", "Keep briefing"], ["Planning instruction", "Keep instruction"]]) await card.getByLabel(label, { exact: true }).fill(value);
  for (const point of ["Point Three", "Point Four", "Point Five"]) await card.getByRole("checkbox", { name: point, exact: true }).uncheck();
  await card.getByRole("button", { name: "Move Coaching Point down", exact: true }).first().click();
  await card.getByLabel("Responsibility", { exact: true }).selectOption("staff");
  await card.getByLabel("Staff member", { exact: true }).selectOption("coach-b");
  await card.getByLabel("Planning status", { exact: true }).selectOption("needs_planning");
  await (await summary(card, "Coach notes for this drill")).click();
  await card.getByLabel("Notes", { exact: true }).fill("Keep coach note");
  let data = await payload();
  assert.equal(data.drills[0].drillId, "snapshot");
  assert.deepEqual(data.drills[0].selectedCoachingPoints, ["Point Two", "Point One"]);
  assert.equal(data.sections[0].staffId, "coach-a");
  assert.equal(data.drills[0].responsibleStaffId, "coach-b");
  assert.ok(await page.evaluate(() => JSON.stringify(window.qa.drills) === window.qa.source), "library/snapshot inputs untouched");
  await card.getByLabel("Planned duration", { exact: true }).fill("12");
  assert.match(await page.locator("[data-plan-duration]").innerText(), /^30 \/ 75[\s\S]*Calculated drills: 12/, "manual section duration stays independent");
  // Real HTML5 drag events hit the unchanged canonical handlers, including between sections.
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await card.dispatchEvent("dragstart", { dataTransfer: transfer });
  const secondSection = page.locator('[data-plan-section="main-part"]');
  await secondSection.dispatchEvent("dragover", { dataTransfer: transfer });
  await secondSection.dispatchEvent("drop", { dataTransfer: transfer });
  assert.equal((await payload()).drills[0].block, "main-part");
  await (await summary(cards().first(), "Details")).click();
  await (await summary(firstSection, "Section settings")).click();
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.evaluate(() => { window.qa.drag = []; for (const type of ["dragstart", "dragend", "drop"]) document.addEventListener(type, (event) => window.qa.drag.push({ type, tag: event.target.tagName, section: event.target.closest("[data-plan-section]")?.getAttribute("data-plan-section") }), true); });
  await cards().first().locator("h3").dragTo(firstSection.locator("h3").first());
  if ((await payload()).drills[0].block !== "activation") console.log(await page.evaluate(() => window.qa.drag));
  assert.equal((await payload()).drills[0].block, "activation", "real pointer drag moves back to first section");
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  const customSection = page.locator("[data-plan-section]").last();
  await (await summary(customSection, "Section settings")).click();
  const longName = "CustomAbschnittOhneWortabstand".repeat(6);
  await customSection.getByLabel("Section name", { exact: true }).fill(longName);
  await customSection.getByRole("button", { name: "Move section up", exact: true }).click();
  assert.equal((await payload()).sections[1].title, longName);
  await page.setViewportSize({ width: 320, height: 800 });
  await fits("long custom section on phone");
  const beforeDraft = await payload();
  await page.waitForFunction((expected) => JSON.stringify(JSON.parse(localStorage.getItem("coachboard:draft:session:fixture-event") || "null")?.data) === expected, JSON.stringify(beforeDraft));
  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  await page.getByRole("dialog", { name: "You have unsaved changes.", exact: true }).waitFor();
  await page.getByRole("button", { name: "Stay", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Recover draft", exact: true }).click();
  assert.deepEqual(await payload(), beforeDraft, "actual local draft recovers full overrides/sections");
  await page.evaluate(() => { window.qa.fail = true; });
  await page.getByRole("button", { name: "Save Session Plan", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.deepEqual(await payload(), beforeDraft, "failed save retains full state");
  assert.ok(await page.evaluate(() => localStorage.getItem("coachboard:draft:session:fixture-event")), "failed save keeps draft");
  assert.ok(await page.getByLabel("Title", { exact: true }).isVisible(), "hidden metadata error is revealed");
  await page.evaluate(() => { window.qa.fail = false; });
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Save Session Plan", exact: true }).click()]);
  await page.waitForFunction(() => localStorage.getItem("fixture-saved") !== null);
  await page.waitForLoadState("load");
  await page.locator("form").waitFor();
  assert.deepEqual(await payload(), beforeDraft);
  const countSections = (await payload()).sections.length;
  await (await summary(firstSection, "Section settings")).click();
  await firstSection.getByRole("button", { name: "Delete section", exact: true }).click();
  assert.equal((await payload()).sections.length, countSections, "nonempty section cannot be deleted");
  await cards().first().getByRole("button", { name: "Remove drill", exact: true }).click();
  assert.equal((await payload()).drills.length, 0);
  await firstSection.getByRole("button", { name: "Delete section", exact: true }).click();
  assert.equal((await payload()).sections.length, countSections - 1, "empty section can be deleted");
  assert.deepEqual(errors, [], "no browser runtime errors");
  console.log(`PASS snapshots/overrides, coaching selection/order, staff, carry-forward, manual duration, cross-section drag, sections, drafts, failed save, remove. Screenshots: ${output}`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
