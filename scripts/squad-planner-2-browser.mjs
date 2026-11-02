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
  "next/navigation": `export function useRouter(){return {replace(){},refresh(){},push(){}}}`,
  "next/link": `import React from "react"; export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`,
  "@/lib/squad/tactical-planner-actions": `
    const now="2026-11-02T12:00:00.000Z";
    const normalize=(rows)=>{
      const bySlot=new Map();
      for(const row of rows)bySlot.set(row.slotId,[...(bySlot.get(row.slotId)||[]),row]);
      return [...bySlot.values()].flatMap(slotRows=>slotRows.sort((a,b)=>Number(b.isPreferredStarter)-Number(a.isPreferredStarter)||a.depthOrder-b.depthOrder).map((row,index)=>({...row,depthOrder:index+1,isPreferredStarter:index===0})));
    };
    export async function assignStartingPlayer(planId,playerId,targetSlotId){
      let rows=[...window.qaAssignments];
      const source=rows.find(row=>row.playerId===playerId&&row.isPreferredStarter);
      const displaced=rows.find(row=>row.slotId===targetSlotId&&row.isPreferredStarter&&row.playerId!==playerId);
      rows=rows.map(row=>source?.id===row.id||displaced?.id===row.id?{...row,isPreferredStarter:false}:row);
      let target=rows.find(row=>row.slotId===targetSlotId&&row.playerId===playerId);
      if(!target){target={id:"new-"+playerId+"-"+targetSlotId,userId:"coach",planId,slotId:targetSlotId,playerId,depthOrder:99,isPreferredStarter:false,fitType:"out_of_position",createdAt:now,updatedAt:now};rows.push(target)}
      rows=rows.map(row=>row.id===target.id?{...row,isPreferredStarter:true}:row);
      if(source&&source.slotId!==targetSlotId){
        if(displaced){let swap=rows.find(row=>row.slotId===source.slotId&&row.playerId===displaced.playerId);if(!swap){swap={...displaced,id:"swap-"+displaced.playerId+"-"+source.slotId,slotId:source.slotId,isPreferredStarter:false};rows.push(swap)}rows=rows.map(row=>row.id===swap.id?{...row,isPreferredStarter:true}:row)}
        else {const backup=rows.filter(row=>row.slotId===source.slotId&&row.playerId!==playerId).sort((a,b)=>a.depthOrder-b.depthOrder)[0];if(backup)rows=rows.map(row=>row.id===backup.id?{...row,isPreferredStarter:true}:row);else rows=rows.filter(row=>row.id!==source.id)}
      }
      window.qaAssignments=normalize(rows);return {ok:true,assignments:window.qaAssignments};
    }
    export async function addDepthAssignmentInline(planId,slotId,playerId){if(!window.qaAssignments.some(row=>row.slotId===slotId&&row.playerId===playerId)){window.qaAssignments=normalize([...window.qaAssignments,{id:"depth-"+playerId+"-"+slotId,userId:"coach",planId,slotId,playerId,depthOrder:99,isPreferredStarter:false,fitType:"out_of_position",createdAt:now,updatedAt:now}])}return {ok:true,assignments:window.qaAssignments}}
    export async function removeDepthAssignmentInline(planId,id){window.qaAssignments=normalize(window.qaAssignments.filter(row=>row.id!==id));return {ok:true,assignments:window.qaAssignments}}
    export async function moveDepthAssignmentToRankInline(planId,id,rank){const row=window.qaAssignments.find(item=>item.id===id);if(!row)return {ok:false,error:"assignment_not_found"};const slot=window.qaAssignments.filter(item=>item.slotId===row.slotId&&item.id!==id).sort((a,b)=>a.depthOrder-b.depthOrder);slot.splice(Math.max(0,rank-1),0,row);window.qaAssignments=window.qaAssignments.map(item=>{const index=slot.findIndex(entry=>entry.id===item.id);return index<0?item:{...item,depthOrder:index+1,isPreferredStarter:index===0}});return {ok:true,assignments:window.qaAssignments}}
    export async function saveCustomFormation(){return {ok:true}}
    export async function createTacticalPlan(){} export async function updateTacticalPlan(){} export async function duplicateTacticalPlan(){}
    export async function archiveTacticalPlan(){} export async function autoFillTacticalPlan(){} export async function clearStartingXi(){}
    export async function deleteTacticalPlan(){} export async function restoreTacticalPlan(){} export async function setDefaultTacticalPlan(){}
    export async function updatePlayerPlanState(){}
  `
};

const bundle = await build({
  stdin: {
    contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {I18nProvider} from "@/components/i18n/i18n-provider";
      import {SquadTacticalPlanner} from "@/components/squad/squad-tactical-planner";
      const root=createRoot(document.getElementById("root"));
      const now="2026-11-02T12:00:00.000Z";
      const player=(id,firstName,position,secondaryPositions=[],playerType="roster")=>({id,userId:"coach",squadId:"squad",firstName,lastName:"Example",position,secondaryPositions,positionFamilies:[],playerType,archivedAt:undefined,createdAt:now,updatedAt:now});
      const players=[player("a","Anton","RB"),player("b","Bela","CM"),player("c","Carlo","CB"),player("d","Daria",undefined),player("trial","Emil","RW",[],"trial")];
      const slot=(id,code,label,x,sortOrder,acceptedPositions)=>({id,userId:"coach",planId:"plan",slotKey:id,code,label,family:"outfield",x,y:55,naturalPositions:[acceptedPositions[0]],compatiblePositions:acceptedPositions.slice(1),acceptedPositions,sortOrder});
      const slots=[slot("rb","RB","Right Back",75,0,["RB","RWB"]),slot("cm","CM","Central Midfielder",25,1,["CM","CDM","CAM"])];
      const assignment=(id,slotId,playerId,depthOrder,isPreferredStarter,fitType="natural")=>({id,userId:"coach",planId:"plan",slotId,playerId,depthOrder,isPreferredStarter,fitType,createdAt:now,updatedAt:now});
      window.qaAssignments=[assignment("rb-a","rb","a",1,true),assignment("rb-c","rb","c",2,false,"compatible"),assignment("cm-b","cm","b",1,true)];
      const plan={id:"plan",userId:"coach",squadId:"squad",name:"First team",formationCode:"4-3-3",isDefault:true,includeNewPlayersAutomatically:true,status:"active",createdAt:now,updatedAt:now};
      window.qa={render(locale="en"){root.render(<I18nProvider locale={locale}><SquadTacticalPlanner data={{squad:{id:"squad",userId:"coach",name:"Example U15",isDefault:true,createdAt:now,updatedAt:now},plans:[plan],selectedPlan:plan,slots,assignments:window.qaAssignments,playerStates:[],players,warnings:[]}}/></I18nProvider>)}};
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
    name: "squad-planner-fixture",
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
assert.ok(css, "Run npm run build before Squad Planner browser validation.");
const server = createServer((request, response) => {
  if (request.url === "/bundle.js") { response.setHeader("Content-Type", "application/javascript"); response.end(bundle.outputFiles[0].text); return; }
  response.setHeader("Content-Type", "text/html");
  response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main id="root" style="padding:12px"></main><script src="/bundle.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.COACHBOARD_QA_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);

  for (const locale of ["en", "de"]) {
    await page.evaluate((value) => window.qa.render(value), locale);
    await page.locator("[data-planner-slot='rb']").click();
    const inspector = page.locator("[data-position-inspector='RB']");
    await inspector.waitFor();
    assert.equal(await inspector.getByText(locale === "de" ? "Positionsfremd" : "Out of position", { exact: true }).count() > 0, true);
    assert.equal(await inspector.getByText(locale === "de" ? "Keine Positionsdaten" : "No position data", { exact: true }).count() > 0, true);
    assert.equal(await inspector.getByText("Bela Example", { exact: true }).count() > 0, true, "Out-of-position Player remains discoverable");
    assert.equal(await inspector.getByText("Daria Example", { exact: true }).count() > 0, true, "Player without position data remains discoverable");

    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${locale}/${width}: horizontal overflow`);
    }
  }

  await page.evaluate(() => window.qa.render("en"));
  await page.setViewportSize({ width: 320, height: 900 });
  const openInspector = page.locator("[data-position-inspector]");
  if (await openInspector.count()) await openInspector.getByRole("button", { name: "Close" }).click();
  await page.locator("[data-planner-slot='rb']").click();
  await page.getByRole("button", { name: "Set as starter: Bela Example" }).click();
  await page.locator("[data-position-depth-list='RB']").getByText("Bela Example", { exact: true }).first().waitFor();
  assert.equal(await page.locator("[data-planner-slot='rb']").innerText().then((text) => text.includes("Bela Example")), true, "Starter change updates the pitch");
  assert.equal(await page.locator("[data-planner-slot='cm']").innerText().then((text) => text.includes("Anton Example")), true, "Occupied XI slots swap starters");
  await page.evaluate(() => window.qa.render("en"));
  assert.equal(await page.locator("[data-planner-slot='rb']").innerText().then((text) => text.includes("Bela Example")), true, "Canonical Starter survives re-render");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const desktopInspector = page.locator("[data-position-inspector]");
  if (await desktopInspector.count()) {
    await desktopInspector.getByRole("button", { name: "Close" }).click();
  }
  await page.locator("[data-planner-player='c']").dragTo(page.locator("[data-planner-slot='rb']"));
  await page.waitForFunction(() => document.querySelector("[data-planner-slot='rb']")?.textContent?.includes("Carlo Example"));
  assert.equal(await page.locator("[data-planner-slot='rb']").innerText().then((text) => text.includes("Carlo Example")), true, "Drag and Drop uses the same Starter mutation");
  assert.deepEqual(errors, []);
  console.log("Squad Planner 2.0 browser regression: PASS (manual fit guidance, swap persistence, DE/EN, 320/768/1440 px)");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
