import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

// Actual components, fictional records, isolated browser storage and no Supabase writes.
const root = process.cwd();
const qaRequire = createRequire(path.join(process.env.COACHBOARD_QA_DEPS ?? "/private/tmp/coachboard-stability-tests", "package.json"));
const { build } = qaRequire("esbuild");
const { chromium, webkit } = qaRequire("playwright");
const stubs = {
  "next/link": `import React from "react"; export const useLinkStatus=()=>({pending:false}); export default function Link({href,children,onClick,...props}) {return <a href={href} onClick={e=>{onClick?.(e);if(!e.defaultPrevented){e.preventDefault();window.qa.destination=href;}}} {...props}>{children}</a>}`,
  "next/image": 'import React from "react"; export default function Image({src,alt,...props}) {return <img src={src} alt={alt} {...props}/>}',
  "next/navigation": 'export const usePathname=()=>"/squad"; export const useSearchParams=()=>new URLSearchParams(); export const useRouter=()=>({push(){},replace(){},refresh(){}});',
  "@/lib/supabase/client": 'export const createClient=()=>({from:()=>({select:()=>({order:async()=>({data:[],error:null})})})});',
  "@/lib/supabase/server": 'export const createClient=()=>{throw new Error("No real Supabase access in mobile fixtures")};'
};
const bundle = await build({
  stdin: { contents: `
    import React,{useState} from "react";
    import {createRoot} from "react-dom/client";
    import {AppShell} from "@/components/layout/app-shell";
    import {PageContainer,PageHeader,PageHeaderSkeleton} from "@/components/layout/page";
    import {SquadNav} from "@/components/squad/squad-nav";
    import {Button,ButtonLink} from "@/components/ui/button";
    import {PlayerUnavailabilityForm} from "@/components/squad/player-unavailability-form";
    import {PlayerForm} from "@/components/squad/player-form";
    import {TrainingEventForm} from "@/components/squad/training-event-form";
    import {SessionForm} from "@/components/sessions/session-form";
    import {TrainingParticipantsTable} from "@/components/squad/training-participants-table";
    import {StaffBriefView} from "@/components/squad/staff-brief-view";
    import {SquadTacticalPlanner} from "@/components/squad/squad-tactical-planner";
    import {tacticalFormations} from "@/lib/squad/tactical-formations";
    import {DrillFilters} from "@/components/drills/drill-filters";
    import {DrillCard} from "@/components/drills/drill-card";
    import {DrillForm} from "@/components/drills/drill-form";
    import {PlayerImportWorkflow} from "@/components/squad/player-import-workflow";
    import {useUnsavedChangesProtection} from "@/components/shared/use-unsaved-changes-protection";
    window.qa={saves:0,destination:null,observationSuccess:false,savedSlots:null,failPlannerSave:false};
    const params=new URLSearchParams(location.search),locale=params.get("locale")||"en",view=params.get("view")||"shell";
    const team={id:"team",name:"U15 Fictional Training Team",isActive:true};
    const player={id:"player",firstName:"Alexandermilian",lastName:"Fictional-Testname",playerType:"roster",position:"CM",secondaryPositions:[],positionFamilies:[]};
    const trial={...player,id:"trial",firstName:"Taylor",lastName:"Test",playerType:"trial",position:"RW"};
    const plannerPlayers=[{...player,id:"gk",firstName:"Gina",position:"GK"},{...player,id:"striker",firstName:"Sam",position:"ST"},{...player,id:"winger",firstName:"Max",position:"RW"},{...player,id:"reserve",firstName:"Riley",position:"CM"}];
    const plannerSlots=tacticalFormations[0].slots.map((slot,index)=>({...slot,id:"slot-"+index,userId:"user",planId:"plan"}));
    const plannerAssignments=[{id:"assignment-gk",userId:"user",planId:"plan",slotId:plannerSlots[0].id,playerId:"gk",depthOrder:1,isPreferredStarter:true,fitType:"natural",createdAt:"2026-01-01",updatedAt:"2026-01-01"},{id:"assignment-st",userId:"user",planId:"plan",slotId:plannerSlots[9].id,playerId:"striker",depthOrder:1,isPreferredStarter:true,fitType:"natural",createdAt:"2026-01-01",updatedAt:"2026-01-01"}];
    window.qa.plannerAssignments=plannerAssignments;
    const plannerData={squad:team,plans:[{id:"plan",userId:"user",squadId:"team",name:"Fictional 4-3-3",formationCode:"4-3-3",isDefault:true,includeNewPlayersAutomatically:true,status:"active"}],selectedPlan:{id:"plan",userId:"user",squadId:"team",name:"Fictional 4-3-3",formationCode:params.get("view")==="planner-custom"?"Custom":"4-3-3",isDefault:true,includeNewPlayersAutomatically:true,status:"active"},slots:plannerSlots,assignments:plannerAssignments,playerStates:[],players:plannerPlayers,warnings:[]};
    const attendance=[{id:"entry",eventId:"event",playerId:"player",plannedStatus:"expected",finalStatus:"present",latePenaltyApplied:true,player},{id:"trial-entry",eventId:"event",playerId:"trial",plannedStatus:"expected",finalStatus:"present",latePenaltyApplied:true,player:trial}];
    const developmentGoal={id:"goal",title:"Receiving under pressure",category:"technical",priority:"medium",successCriteria:"Receive on the back foot",reviewDate:"2026-10-01",latestProgress:{level:"developing",note:"Improving",recordedAt:"2026-09-18"}};
    const brief={eventId:"event",title:"Fictional Training",date:"2026-09-21",startTime:"18:00",endTime:"19:30",location:"Example pitch",objective:"Create overloads",focus:"Wide play",counts:{expected:18,goalkeepers:2,fieldPlayers:16,positionOpen:0,trialPlayers:1,notExpected:4,unclear:0},expectedNames:["Fictional Player One","Fictional Player Two"],sections:[{key:"Warm-up",durationMinutes:10,startMinute:0,drills:["Ball activation"],responsibleCoach:"Tobi Example",planningStatus:"needs_planning",instruction:"Plan a short activation."},{key:"Main Part",durationMinutes:25,startMinute:10,drills:["Passing sequence"],responsibleCoach:"Alex Example",planningStatus:"ready"}]};
    const drill={id:"drill",title:"Fictional passing drill",mainFocus:"Passing",trainingBlocks:["Main part 1"],drillType:"Technical",durationMinutes:15,minPlayers:6,maxPlayers:12,tags:[],materials:Array.from({length:25},(_,i)=>({type:"other",quantity:i+1,label:"Fictional equipment "+i})),isFavorite:false,ageGroups:[],status:"published"};
    const action=async()=>{window.qa.saves++;return {};};
    function Dirty(){const {dialog}=useUnsavedChangesProtection({isDirty:true});return <><ButtonLink href="/dashboard">Leave form</ButtonLink>{dialog}</>;}
    function Fixture(){return <AppShell locale={locale} teams={[team,{id:"team2",name:"Second fictional team"}]} coachName="Fictional Coach">
      <PageContainer><PageHeader title={locale==="de"?"Trainingsvorbereitung und Spielerverfügbarkeit":"Training preparation and player availability"} actions={<><Button>{locale==="de"?"Trainingseinheit vorbereiten":"Prepare training session"}</Button><Button variant="secondary">{locale==="de"?"Änderungen speichern":"Save changes"}</Button></>}/>
      <SquadNav/>
      <section id="fixture">
      {view==="availability"?<PlayerUnavailabilityForm playerId="player" returnTo="/squad" locale={locale} action={action}/>:
       view==="player"?<PlayerForm action={action} mode="create"/>:
       view==="training"?<TrainingEventForm sessions={[]} squads={[team]} participants={[player]}/>:
       view==="plan"?<SessionForm action={action} mode="create" drills={[drill]}/>:
       view==="drill"?<DrillForm action={action} mode="create"/>:
       view==="import"?<PlayerImportWorkflow existingPlayers={{activeTeamPlayers:[],archivedTeamPlayers:[],trashedTeamPlayers:[],legacyPlayers:[],otherTeamPlayers:[]}} history={[]}/>:
       view==="participants"?<TrainingParticipantsTable eventId="event" eventDate="2026-09-20" attendance={attendance} developmentGoals={[["player",[developmentGoal]]]} groupLabelsByPlayerId={[]} summary={{expected:2,notExpected:0,goalkeepers:0,fieldPlayers:2,defensive:0,midfield:1,attacking:1,positionMissing:0}}/>:
       view==="planner"||view==="planner-custom"?<SquadTacticalPlanner data={plannerData}/>:
       view==="staff-brief"?<StaffBriefView data={brief} locale={locale}/>:
       view==="library"?<><DrillFilters locale={locale} filters={{view:"active",usage:"all",sort:"updated"}}/><DrillCard drill={drill}/></>:
       view==="dialog"?<Dirty/>:<PageHeaderSkeleton/>}
      </section></PageContainer></AppShell>;}
    createRoot(document.getElementById("root")).render(<Fixture/>);
  `, resolveDir: root, loader: "tsx" },
  bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "mobile-fixtures", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => {
      if (stubs[args.path]) return { path: args.path, namespace: "stub" };
      if (args.path.startsWith("@/lib/") && /(?:\/actions|-actions)$/.test(args.path)) return { path: args.path, namespace: "actions" };
      if (args.path.startsWith("@/")) {
        const base = path.join(root, args.path.slice(2));
        return { path: [base, base + ".ts", base + ".tsx", path.join(base, "index.ts")].find(p => existsSync(p) && statSync(p).isFile()) };
      }
    });
    builder.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: stubs[args.path], loader: "tsx", resolveDir: root }));
    builder.onLoad({ filter: /.*/, namespace: "actions" }, args => {
      const tree = ts.createSourceFile(args.path, readFileSync(path.join(root, args.path.slice(2) + ".ts"), "utf8"), 99, true);
      const names = tree.statements.filter(n => ts.isFunctionDeclaration(n) && n.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)).map(n => n.name.text);
      return { contents: names.map(name => {
        if(name==="assignStartingPlayer") return `export async function assignStartingPlayer(planId,playerId,targetSlotId){window.qa.saves++;if(window.qa.failPlannerSave){window.qa.failPlannerSave=false;return {ok:false,error:"Could not update formation."}}let rows=window.qa.plannerAssignments.map(row=>({...row}));const source=rows.find(row=>row.playerId===playerId&&row.isPreferredStarter);const displaced=rows.find(row=>row.slotId===targetSlotId&&row.isPreferredStarter);rows=rows.map(row=>({...row,isPreferredStarter:row.isPreferredStarter&&row.playerId!==playerId&&row.id!==displaced?.id}));if(targetSlotId){const existing=rows.find(row=>row.slotId===targetSlotId&&row.playerId===playerId);if(existing)existing.isPreferredStarter=true;else rows.push({id:"saved-"+playerId+"-"+targetSlotId,userId:"user",planId,slotId:targetSlotId,playerId,depthOrder:2,isPreferredStarter:true,fitType:"natural",createdAt:"2026-01-01",updatedAt:"2026-01-01"})}if(source&&displaced&&source.slotId!==targetSlotId){const existing=rows.find(row=>row.slotId===source.slotId&&row.playerId===displaced.playerId);if(existing)existing.isPreferredStarter=true;else rows.push({...source,id:"saved-"+displaced.playerId+"-"+source.slotId,playerId:displaced.playerId,isPreferredStarter:true})}window.qa.plannerAssignments=rows;return {ok:true,assignments:rows}}`;
        if(name==="saveCustomFormation") return `export async function saveCustomFormation(planId,name,slots){window.qa.savedSlots={planId,name,slots};return {ok:true}}`;
        return `export async function ${name}(){window.qa.saves++;return {ok:${name === "saveTrainingPlayerObservation" ? "window.qa.observationSuccess" : "false"},message:"No real save in fixtures"}}`;
      }).join("\n"), loader: "js" };
    });
  } }]
});
const css = process.env.COACHBOARD_QA_CSS ? readFileSync(process.env.COACHBOARD_QA_CSS, "utf8") : readdirSync(path.join(root, ".next/static/css")).filter(n => n.endsWith(".css")).map(n => readFileSync(path.join(root, ".next/static/css", n), "utf8")).join("\n");
const server = createServer((req, res) => {
  if (req.url === "/bundle.js") { res.setHeader("Content-Type", "application/javascript"); res.end(bundle.outputFiles[0].text); }
  else if (req.url?.startsWith("/coachboard-brand/")) {
    const filename = path.basename(req.url);
    const asset = path.join(root, "public/coachboard-brand", filename);
    if (!existsSync(asset)) { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", filename.endsWith(".ico") ? "image/x-icon" : "image/png");
    res.end(readFileSync(asset));
  }
  else { res.setHeader("Content-Type", "text/html"); res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = process.env.COACHBOARD_QA_WEBKIT ? await webkit.launch() : await chromium.launch({ headless: true, executablePath: process.env.COACHBOARD_QA_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const page = await browser.newPage({ hasTouch: true });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const go = async (view, locale) => { await page.goto(`${base}?view=${view}&locale=${locale}`); await page.locator("#fixture").waitFor(); };
  async function checkOverflow(label) {
    const bad = await page.evaluate(() => [...document.querySelectorAll("#fixture *")].filter(el => {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.right <= innerWidth + 1 && rect.left >= -1) return false;
      for (let p = el.parentElement; p && !p.matches(".app-main"); p = p.parentElement) {
        if (["auto", "scroll", "hidden"].includes(getComputedStyle(p).overflowX)) return false;
      }
      return true;
    }).slice(0, 5).map(el => ({ tag: el.tagName, text: el.textContent.slice(0, 70), class: el.className })));
    assert.deepEqual(bad, [], `${label}: content overflow, including clipped app-shell content`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: page overflow`);
  }
  if (process.env.COACHBOARD_QA_PLANNER_ONLY !== "1") {
  for (const locale of ["en", "de"]) {
    for (const width of [320, 360, 375, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const view of ["shell", "availability", "player", "training", "plan", "drill", "import", "participants", "staff-brief", "library", "planner", "planner-custom", "dialog"]) {
        await go(view, locale);
        await checkOverflow(`${view} ${locale} ${width}`);
        if (view === "shell") {
          assert.ok(await page.locator("img[src*=coachboard-brand]").count(), "App shell contains the approved brand assets");
          assert.ok(await page.locator("img[src*=coachboard-brand]").evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), "App shell brand assets load");
        }
        if (width < 768) {
          const smallInputs = await page.locator('#fixture input:not([type=hidden]):not([type=checkbox]):not([type=radio]),#fixture select,#fixture textarea:not([hidden])').evaluateAll(elements => elements.filter(el => el.getBoundingClientRect().width && parseFloat(getComputedStyle(el).fontSize) < 16).length);
          assert.equal(smallInputs, 0, `iOS zoom-risk fields: ${view} ${width}`);
        }
        if (view === "availability") {
          await page.locator('select[name="reason"]').selectOption("school");
          await page.locator('input[name="endsOn"]').fill("2026-10-10");
          await checkOverflow(`school absence ${locale} ${width}`);
        }
        if (view === "drill") {
          const add = page.getByRole("button", { name: locale === "de" ? "Material hinzufügen" : "Add material", exact: true });
          await add.click();
          await checkOverflow(`material row ${locale} ${width}`);
          assert.ok(await page.locator("canvas").count(), "Editor canvas remains rendered");
          await page.evaluate(() => localStorage.clear());
        }
        if (view === "import") {
          await page.locator("#fixture textarea").fill("Vorname;Nachname;Straße;PLZ;Ort;Geb.;Verein;Telefon privat;E-Mail;2. E-Mail;Eintritt ins TFP;Gesichtet bei;Stützpunkt;Austritt;Austrittsgrund;Datum letzte Leistungsbewertung;Links;Rechts;Abwehr;Mittelfeld;Angriff;Torwart;Größe;Gewicht;Entfernung\n" + Array.from({length:49},(_,i)=>`Fictional${i};Player;Teststraße 1;'01234;Testort;14.08.2012;Testclub;'012345;; ;;;;;;;X;;;X;;;166,4;47,8;`).join("\n"));
          await page.getByRole("button", { name: locale === "de" ? "Eingefügte Tabelle verwenden" : "Use pasted table", exact: true }).click();
          await page.locator('#fixture select').first().waitFor();
          await checkOverflow(`49-row import mapping ${locale} ${width}`);
        }
        if (view === "library") {
          const more = page.locator('#fixture button[aria-expanded]');
          await more.click();
          await checkOverflow(`materials popover ${locale} ${width}`);
          await page.keyboard.press("Escape");
          assert.equal(await more.getAttribute("aria-expanded"), "false");
          if (width < 768) {
            assert.equal(await page.locator('select[name="ageGroup"]').isVisible(), false);
            await page.locator(".drill-filters summary").click();
          }
          await page.locator('select[name="ageGroup"]').waitFor({ state: "visible" });
          await checkOverflow(`expanded filters ${locale} ${width}`);
        }
        if (view === "participants" && width === 390) {
          await page.locator('button[aria-label*="Alexandermilian"]:visible').click();
          const dialog = page.getByRole("dialog");
          await dialog.waitFor();
          assert.equal(await dialog.locator('select[name="goalId"] option').count(), 2, "only this player's active goal and no-goal option");
          assert.ok(await dialog.getByText("Receiving under pressure").count());
          const panel = await dialog.locator('[tabindex="-1"]').boundingBox();
          assert.ok(panel.x >= 0 && panel.x + panel.width <= width + 1 && panel.y >= 0 && panel.y + panel.height <= 844, "development dialog stays inside phone viewport");
          await page.screenshot({ path: `/private/tmp/coachboard-development-dialog-${locale}.png` });
          await checkOverflow(`development quick view ${locale} ${width}`);
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "detached" });
          await page.locator('button[aria-label*="Taylor"]:visible').click();
          await dialog.waitFor();
          assert.equal(await dialog.locator('select[name="goalId"] option').count(), 1, "trial player without goals can add an unlinked observation");
          await page.keyboard.press("Escape");
        }
        if (view === "staff-brief" && width === 390) {
          await page.evaluate(() => {
            Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => { window.qa.copied = text; } } });
            Object.defineProperty(navigator, "share", { configurable: true, value: async data => { window.qa.shared = data.text; } });
            window.print = () => { window.qa.printed = true; };
          });
          const copy = page.getByRole("button", { name: locale === "de" ? "Text kopieren" : "Copy text" });
          await copy.click();
          assert.ok(!(await page.evaluate(() => window.qa.copied)).includes("Fictional Player One"), "player names excluded by default");
          await page.getByRole("checkbox", { name: locale === "de" ? "Spielernamen einbeziehen" : "Include Player names" }).check();
          await copy.click();
          assert.ok((await page.evaluate(() => window.qa.copied)).includes("Fictional Player One"), "names included only when opted in");
          await page.getByRole("button", { name: locale === "de" ? "Teilen" : "Share" }).click();
          assert.ok((await page.evaluate(() => window.qa.shared)).includes("Tobi Example"), "Web Share receives current briefing");
          await page.evaluate(() => { Object.defineProperty(navigator, "share", { configurable: true, value: undefined }); window.qa.copied = ""; });
          await page.getByRole("button", { name: locale === "de" ? "Teilen" : "Share" }).click();
          assert.ok((await page.evaluate(() => window.qa.copied)).includes("Tobi Example"), "Share falls back to Copy text");
          await page.getByRole("button", { name: locale === "de" ? "Drucken / PDF" : "Print / PDF" }).click();
          assert.equal(await page.evaluate(() => window.qa.printed), true);
          await page.getByRole("checkbox", { name: locale === "de" ? "Spielernamen einbeziehen" : "Include Player names" }).uncheck();
          await page.emulateMedia({ media: "print" });
          assert.equal(await copy.isVisible(), false, "print hides action controls");
          if (!process.env.COACHBOARD_QA_WEBKIT) {
            await page.addStyleTag({ content: '@media print { :has(> #fixture) > :not(#fixture) { display: none !important; } #fixture { margin-top: 0 !important; } }' });
            const pdf = await page.pdf({ path: `/private/tmp/coachboard-staff-brief-${locale}.pdf`, format: "A4", printBackground: true });
            assert.equal(pdf.subarray(0, 4).toString(), "%PDF", "Staff Brief exports as a PDF");
          }
          await page.emulateMedia({ media: "screen" });
          await page.screenshot({ path: `/private/tmp/coachboard-staff-brief-${locale}.png` });
        }
        if (view === "dialog") {
          await page.locator('a[href="/dashboard"]').filter({ hasText: "Leave form" }).click();
          const dialog = page.getByRole("dialog");
          await dialog.waitFor();
          const bounds = await dialog.locator(".app-dialog-panel").boundingBox();
          assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
          await page.setViewportSize({ width, height: 320 });
          await dialog.locator("button").last().click();
          await dialog.waitFor({ state: "detached" });
          await page.setViewportSize({ width, height: 844 });
        }
        assert.equal(await page.evaluate(() => window.qa.saves), 0, "Opening fixtures must not save");
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await go("dialog", locale);
    await page.locator("header button[aria-expanded]").click();
    await page.locator('.app-drawer a[href="/trainings"]').click();
    const warning = page.locator(".app-dialog-panel");
    await warning.waitFor();
    assert.ok(await warning.evaluate(el => {const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}), "Unsaved warning is above the drawer");
    await warning.locator("button").last().focus();
    await page.keyboard.press("Tab");
    assert.ok(await warning.locator("button").first().evaluate(el=>el===document.activeElement), "Dialog keeps keyboard focus");
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport,"height",{configurable:true,value:320});
      Object.defineProperty(window.visualViewport,"offsetTop",{configurable:true,value:72});
      window.visualViewport.dispatchEvent(new Event("resize"));
    });
    await page.waitForFunction(() => {const panel=document.querySelector(".app-dialog-panel").getBoundingClientRect();return panel.y>=72&&panel.bottom<=392;});
    await warning.locator("button").last().scrollIntoViewIfNeeded();
    const lastAction=await warning.locator("button").last().boundingBox();
    assert.ok(lastAction.y>=72&&lastAction.y+lastAction.height<=392,"Action remains inside keyboard-reduced visual viewport");
    await page.evaluate(() => {delete window.visualViewport.height;delete window.visualViewport.offsetTop;window.visualViewport.dispatchEvent(new Event("resize"));});
    await page.keyboard.press("Escape");
    await warning.waitFor({state:"detached"});
    await go("shell", locale);
    const menu = page.locator("header button[aria-expanded]");
    await menu.click();
    const drawer = page.locator(".app-drawer");
    await drawer.waitFor();
    await page.setViewportSize({ width: 844, height: 390 });
    await drawer.locator('a[href="/settings"]').click();
    assert.equal(await page.evaluate(() => window.qa.destination), "/settings");
    await drawer.waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    await menu.click();
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "detached" });
    await menu.click();
    await page.setViewportSize({ width: 1280, height: 800 });
    await drawer.waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    await page.setViewportSize({ width: 390, height: 844 });
    await go("library", locale);
    await page.screenshot({ path: `/private/tmp/coachboard-mobile-library-${locale}.png`, fullPage: true });
    await go("participants", locale);
    await page.screenshot({ path: `/private/tmp/coachboard-mobile-participants-${locale}.png`, fullPage: true });
    await go("planner", locale);
    assert.equal(await page.locator("[data-planner-slot]").count(), 11, "formation has 11 positioned slots");
    const selectPlayerHint = locale === "de" ? "Spieler auswählen und dann eine Position antippen." : "Select a player, then tap a position.";
    await page.locator(`button[title="${selectPlayerHint}"]`).filter({ hasText: "Max" }).first().click();
    await page.locator('[data-planner-slot="slot-10"]').click();
    await page.waitForFunction(() => document.querySelector('[data-planner-slot="slot-10"]')?.textContent?.includes("Max"));
    assert.equal((await page.evaluate(() => window.qa.plannerAssignments.filter(row => row.isPreferredStarter && row.playerId === "winger").length)), 1, "tap assignment creates one XI starter");
    await page.locator(`button[title="${selectPlayerHint}"]`).filter({ hasText: "Riley" }).first().click();
    await page.locator('[data-planner-slot="slot-10"]').click();
    await page.waitForFunction(() => document.querySelector('[data-planner-slot="slot-10"]')?.textContent?.includes("Riley"));
    assert.equal((await page.evaluate(() => window.qa.plannerAssignments.filter(row => row.isPreferredStarter && row.playerId === "winger").length)), 0, "outside player replaces occupied starter without duplicate XI assignment");
    await page.locator('[data-planner-slot="slot-0"]').click();
    await page.getByRole("button", { name: locale === "de" ? "Zuweisen" : "Assign", exact: true }).last().click();
    await page.locator('[data-planner-slot="slot-9"]').click();
    await page.waitForFunction(() => document.querySelector('[data-planner-slot="slot-9"]')?.textContent?.includes("Gina"));
    assert.ok((await page.locator('[data-planner-slot="slot-0"]').textContent()).includes("Sam"), "occupied-slot move swaps starters");
    await page.locator('[data-planner-slot="slot-0"]').click();
    await page.getByRole("button", { name: locale === "de" ? "Aus Startelf entfernen" : "Remove from XI", exact: true }).last().click();
    await page.waitForFunction(() => !document.querySelector('[data-planner-slot="slot-0"]')?.textContent?.includes("Sam"));
    await page.evaluate(() => { window.qa.failPlannerSave = true; });
    await page.locator(`button[title="${selectPlayerHint}"]`).filter({ hasText: "Sam" }).first().click();
    await page.locator('[data-planner-slot="slot-0"]').click();
    await page.getByRole("alert").last().waitFor();
    assert.ok(!(await page.locator('[data-planner-slot="slot-0"]').textContent()).includes("Sam"), "failed assignment rolls back");
    await page.screenshot({ path: `/private/tmp/coachboard-planner-mobile-${locale}.png`, fullPage: true });
    await go("planner-custom", locale);
    await page.getByRole("button", { name: locale === "de" ? "Formation bearbeiten" : "Edit formation" }).click();
    await page.getByRole("button", { name: locale === "de" ? "Position hinzufügen" : "Add position" }).click();
    assert.equal(await page.locator("[data-planner-slot]").count(), 12);
    await page.getByRole("button", { name: locale === "de" ? "Position entfernen" : "Remove position" }).click();
    assert.equal(await page.locator("[data-planner-slot]").count(), 11);
    await page.locator('[data-planner-slot="slot-1"]').click();
    await page.getByRole("textbox", { name: locale === "de" ? "Anzeigename" : "Display label" }).fill("Left 8");
    const moving = await page.locator('[data-planner-slot="slot-1"]').boundingBox();
    await page.mouse.move(moving.x + moving.width / 2, moving.y + moving.height / 2);
    await page.mouse.down();
    await page.mouse.move(moving.x + moving.width / 2 + 18, moving.y + moving.height / 2 + 10, { steps: 4 });
    await page.mouse.up();
    await page.getByRole("button", { name: locale === "de" ? "Formation speichern" : "Save formation" }).click();
    await page.waitForFunction(() => window.qa.savedSlots !== null);
    assert.equal(await page.evaluate(() => window.qa.savedSlots.slots.length), 11);
    assert.equal(await page.evaluate(() => window.qa.savedSlots.slots.find(slot => slot.id === "slot-1").label), "Left 8");
    assert.ok(await page.evaluate(() => window.qa.savedSlots.slots.find(slot => slot.id === "slot-1").x > 15), "custom slot position moved in normalized coordinates");
    await page.screenshot({ path: `/private/tmp/coachboard-planner-custom-mobile-${locale}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await go("shell", "en");
  await page.screenshot({ path: "/private/tmp/coachboard-brand-shell-mobile.png" });
  await page.locator("header button[aria-expanded]").click();
  await page.locator(".app-drawer img[src*=coachboard-logo-horizontal-dark]").waitFor();
  await page.screenshot({ path: "/private/tmp/coachboard-brand-shell-drawer.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => localStorage.setItem("coachboard:ui:sidebar-mode", "collapsed"));
  await go("shell", "en");
  await page.locator("aside img[src*=coachboard-mark-dark]").waitFor();
  await page.waitForFunction(() => Math.abs(document.querySelector("aside").getBoundingClientRect().width - 72) < 1);
  await page.screenshot({ path: "/private/tmp/coachboard-brand-shell-collapsed.png" });
  await page.locator("aside button[aria-label]").first().click();
  await page.locator("aside img[src*=coachboard-logo-horizontal-dark]").waitFor();
  await page.waitForFunction(() => Math.abs(document.querySelector("aside").getBoundingClientRect().width - 288) < 1);
  await page.screenshot({ path: "/private/tmp/coachboard-brand-shell-expanded.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await go("participants", "en");
  await page.locator('button[aria-label*="Alexandermilian"]:visible').click();
  const developmentDialog = page.getByRole("dialog");
  await developmentDialog.locator('select[name="goalId"]').selectOption("goal");
  await developmentDialog.locator('textarea[name="note"]').fill("Fictional observation that must survive a failed save.");
  await developmentDialog.getByRole("button", { name: "Save observation" }).click();
  await developmentDialog.getByRole("alert").waitFor();
  assert.equal(await developmentDialog.locator('textarea[name="note"]').inputValue(), "Fictional observation that must survive a failed save.");
  assert.equal(await developmentDialog.locator('select[name="goalId"]').inputValue(), "goal");
  await page.evaluate(() => { window.qa.observationSuccess = true; });
  await developmentDialog.getByRole("button", { name: "Save observation" }).click();
  await developmentDialog.getByRole("status").waitFor();
  assert.equal(await developmentDialog.locator('textarea[name="note"]').inputValue(), "", "successful linked observation clears the note");
  await developmentDialog.locator('select[name="goalId"]').selectOption("");
  await developmentDialog.locator('textarea[name="note"]').fill("Fictional unlinked observation.");
  await developmentDialog.getByRole("button", { name: "Save observation" }).click();
  await page.waitForFunction(() => document.querySelector('textarea[name="note"]')?.value === "");
  assert.equal(await developmentDialog.locator('textarea[name="note"]').inputValue(), "", "successful unlinked observation clears the note");
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await go("planner", "en");
  await page.locator('button[title="Select a player, then tap a position."]').filter({ hasText: "Max" }).first().dragTo(page.locator('[data-planner-slot="slot-10"]'));
  await page.waitForFunction(() => document.querySelector('[data-planner-slot="slot-10"]')?.textContent?.includes("Max"));
  await page.getByText("Saved", { exact: true }).waitFor();
  await page.locator('[data-planner-slot="slot-9"]').scrollIntoViewIfNeeded();
  const dragSource = await page.locator('[data-planner-slot="slot-9"]').boundingBox();
  const dragTarget = await page.locator('[data-planner-slot="slot-10"]').boundingBox();
  await page.mouse.move(dragSource.x + dragSource.width / 2, dragSource.y + dragSource.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragSource.x + dragSource.width / 2 + 12, dragSource.y + dragSource.height / 2 + 12, { steps: 3 });
  await page.mouse.move(dragTarget.x + dragTarget.width / 2, dragTarget.y + dragTarget.height / 2, { steps: 8 });
  await page.locator('[data-planner-drag-ghost]').waitFor();
  assert.ok((await page.locator('[data-planner-slot="slot-10"]').getAttribute("class")).includes("ring-4"), "valid drop target highlights during drag");
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[data-planner-slot="slot-9"]')?.textContent?.includes("Max"));
  await page.getByText("Saved", { exact: true }).waitFor();
  await page.locator('[data-planner-slot="slot-0"]').dragTo(page.locator('[data-planner-slot="slot-9"]'));
  await page.waitForFunction(() => document.querySelector('[data-planner-slot="slot-9"]')?.textContent?.includes("Gina"));
  await page.getByText("Saved", { exact: true }).waitFor();
  assert.ok((await page.locator('[data-planner-slot="slot-0"]').textContent()).includes("Max"), "desktop drag swaps occupied slots");
  await page.locator('[data-planner-slot="slot-0"]').dragTo(page.locator('[data-planner-unassigned]'));
  await page.waitForFunction(() => !document.querySelector('[data-planner-slot="slot-0"]')?.textContent?.includes("Max"));
  await page.getByText("Saved", { exact: true }).waitFor();
  await page.evaluate(() => { const slot = document.querySelector('[data-planner-slot="slot-9"]'); window.scrollTo(0, window.scrollY + slot.getBoundingClientRect().top - 400); });
  assert.ok(await page.locator('[data-planner-slot="slot-9"]').evaluate(el => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); }), "source slot is unobstructed before invalid-drop test");
  await page.locator('[data-planner-slot="slot-9"]').dragTo(page.locator('#fixture h3').first());
  await page.getByRole("alert").filter({ hasText: "Drop the player on a position" }).waitFor();
  await page.screenshot({ path: "/private/tmp/coachboard-planner-desktop.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(process.env.COACHBOARD_QA_PLANNER_ONLY === "1"
    ? "PASS: planner desktop drag/ghost/target feedback, swap, unassign and invalid-drop feedback; fictional data only."
    : "PASS: shell, headers, tabs, availability, player/training/plan/drill forms, material rows, import mapping, participants, planner assignment/swap/rollback/custom layout, library/popover, unsaved modal; EN/DE 320/360/375/390/430/768/1440; no real Supabase saves.");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
