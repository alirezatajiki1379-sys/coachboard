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
  "next/navigation": 'export const usePathname=()=>"/squad"; export const useSearchParams=()=>new URLSearchParams(); export const useRouter=()=>({push(){},refresh(){}});',
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
    import {DrillFilters} from "@/components/drills/drill-filters";
    import {DrillCard} from "@/components/drills/drill-card";
    import {DrillForm} from "@/components/drills/drill-form";
    import {PlayerImportWorkflow} from "@/components/squad/player-import-workflow";
    import {useUnsavedChangesProtection} from "@/components/shared/use-unsaved-changes-protection";
    window.qa={saves:0,destination:null};
    const params=new URLSearchParams(location.search),locale=params.get("locale")||"en",view=params.get("view")||"shell";
    const team={id:"team",name:"U15 Fictional Training Team",isActive:true};
    const player={id:"player",firstName:"Alexandermilian",lastName:"Fictional-Testname",playerType:"roster",position:"CM",secondaryPositions:[],positionFamilies:[]};
    const attendance=[{id:"entry",eventId:"event",playerId:"player",plannedStatus:"expected",finalStatus:"present",latePenaltyApplied:true,player}];
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
       view==="participants"?<TrainingParticipantsTable eventId="event" attendance={attendance} groupLabelsByPlayerId={[]} summary={{expected:1,notExpected:0,goalkeepers:0,fieldPlayers:1,defensive:0,midfield:1,attacking:0,positionMissing:0}}/>:
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
      return { contents: names.map(name => `export async function ${name}(){window.qa.saves++;return {ok:false,message:"No real save in fixtures"}}`).join("\n"), loader: "js" };
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
  for (const locale of ["en", "de"]) {
    for (const width of [320, 360, 375, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const view of ["shell", "availability", "player", "training", "plan", "drill", "import", "participants", "library", "dialog"]) {
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
  assert.deepEqual(errors, []);
  console.log("PASS: shell, headers, tabs, availability, player/training/plan/drill forms, material rows, import mapping, participants, library/popover, unsaved modal; EN/DE 320/360/375/390/430/768/1440; landscape drawer, reduced-height dialog, modal above drawer and keyboard focus; no real saves.");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
