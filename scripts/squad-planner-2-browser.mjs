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
    const commit=(rows)=>{window.qaAssignments=normalize(rows);localStorage.setItem("qa-squad-planner-assignments",JSON.stringify(window.qaAssignments));return window.qaAssignments};
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
      commit(rows);return {ok:true,assignments:window.qaAssignments};
    }
    export async function addDepthAssignmentInline(planId,slotId,playerId){if(window.qaSlowAdds)await new Promise(resolve=>setTimeout(resolve,120));if(window.qaFailAdd)return {ok:false,error:"Simulated add failure"};if(!window.qaAssignments.some(row=>row.slotId===slotId&&row.playerId===playerId)){commit([...window.qaAssignments,{id:"depth-"+playerId+"-"+slotId,userId:"coach",planId,slotId,playerId,depthOrder:99,isPreferredStarter:false,fitType:"out_of_position",createdAt:now,updatedAt:now}])}return {ok:true,assignments:window.qaAssignments}}
    export async function removeDepthAssignmentInline(planId,id){commit(window.qaAssignments.filter(row=>row.id!==id));return {ok:true,assignments:window.qaAssignments}}
    export async function moveDepthAssignmentToRankInline(planId,id,rank){const row=window.qaAssignments.find(item=>item.id===id);if(!row)return {ok:false,error:"assignment_not_found"};const slot=window.qaAssignments.filter(item=>item.slotId===row.slotId&&item.id!==id).sort((a,b)=>a.depthOrder-b.depthOrder);slot.splice(Math.max(0,rank-1),0,row);commit(window.qaAssignments.map(item=>{const index=slot.findIndex(entry=>entry.id===item.id);return index<0?item:{...item,depthOrder:index+1,isPreferredStarter:index===0}}));return {ok:true,assignments:window.qaAssignments}}
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
      const initialAssignments=[assignment("rb-a","rb","a",1,true),assignment("rb-c","rb","c",2,false,"compatible"),assignment("cm-b","cm","b",1,true)];
      window.qaAssignments=JSON.parse(localStorage.getItem("qa-squad-planner-assignments")||"null")||initialAssignments;
      const plan={id:"plan",userId:"coach",squadId:"squad",name:"First team",formationCode:"4-3-3",isDefault:true,includeNewPlayersAutomatically:true,status:"active",createdAt:now,updatedAt:now};
      window.qa={render(locale="en"){root.render(<I18nProvider locale={locale}><SquadTacticalPlanner data={{squad:{id:"squad",userId:"coach",name:"Example U15",isDefault:true,createdAt:now,updatedAt:now},plans:[plan],selectedPlan:plan,slots,assignments:window.qaAssignments,playerStates:[],players,warnings:[]}}/></I18nProvider>)},reset(locale="en"){window.qaAssignments=initialAssignments.map(row=>({...row}));localStorage.setItem("qa-squad-planner-assignments",JSON.stringify(window.qaAssignments));this.render(locale)}};
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

  await page.evaluate(() => window.qa.reset("en"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const previouslyOpenInspector = page.locator("[data-position-inspector]");
  if (await previouslyOpenInspector.count()) await previouslyOpenInspector.getByRole("button", { name: "Close" }).click();
  await page.locator("[data-pitch-add-player='RB']").click();
  const rbPicker = page.locator("[data-position-picker='RB']");
  await rbPicker.waitFor();
  assert.equal(await page.locator("[data-position-inspector]").count(), 0, "+ Player keeps the local position manager primary");
  assert.equal(await rbPicker.getByText("Current depth", { exact: true }).count(), 1, "+ Player opens the complete position manager");
  assert.equal(await rbPicker.getByText("Add player", { exact: true }).count(), 1, "Position manager separates current depth from candidates");
  for (const name of ["Anton Example", "Carlo Example"]) {
    assert.equal(await rbPicker.getByText(name, { exact: true }).count(), 1, `+ Player exposes current assignment ${name}`);
  }
  const pickerBox = await rbPicker.boundingBox();
  assert.ok(pickerBox && pickerBox.x >= 0 && pickerBox.y >= 0 && pickerBox.x + pickerBox.width <= 1440 && pickerBox.y + pickerBox.height <= 1000, "Local position picker stays within the viewport");
  if (process.env.COACHBOARD_CAPTURE_PLANNER === "1") await page.screenshot({ path: "/private/tmp/coachboard-squad-planner-2-1.png", fullPage: true });
  assert.equal((await rbPicker.locator("[data-position-candidate='b']").innerText()).includes("Out of position"), true, "Local picker shows out-of-position guidance without blocking the Player");
  await page.evaluate(() => { window.qaFailAdd = true; });
  await rbPicker.locator("[data-position-candidate='d']").getByRole("button", { name: "Add as option" }).click();
  await rbPicker.getByRole("alert").waitFor();
  assert.equal((await rbPicker.getByRole("alert").innerText()).includes("Simulated add failure"), true, "Add failure is visible beside the position interaction");
  assert.equal(await page.locator("[data-planner-slot='rb'] [data-planner-depth-count='2']").count(), 1, "Failed add rolls back exactly");
  await page.evaluate(() => { window.qaFailAdd = false; });
  await page.evaluate(() => { window.qaSlowAdds = true; });
  await rbPicker.locator("[data-position-candidate='d']").getByRole("button", { name: "Add as option" }).click();
  await page.waitForTimeout(20);
  await rbPicker.locator("[data-position-candidate='b']").getByRole("button", { name: "Add as option" }).click();
  await page.waitForTimeout(260);
  const persistedAdds = await page.evaluate(() => window.qaAssignments.filter((row) => row.slotId === "rb").map((row) => row.playerId));
  assert.equal(persistedAdds.includes("d"), true, "First + Position click persists");
  assert.equal(persistedAdds.includes("b"), true, "A visible + Position click must never be silently dropped");
  assert.equal(await rbPicker.locator("[data-position-candidate='d']").count(), 0, "Assigned Player is removed from the add-candidate area");
  assert.equal(await rbPicker.getByText("Daria Example", { exact: true }).count(), 1, "Assigned Player moves into Current depth without closing the popover");
  assert.equal(await page.locator("[data-planner-slot='rb'] [data-planner-depth-count='4']").count(), 1, "Pitch depth count updates without navigation");
  assert.equal((await page.locator("[data-planner-slot='rb']").innerText()).includes("+1 more"), true, "Pitch summarizes depth beyond three Players");
  await rbPicker.getByRole("button", { name: "Close" }).click();
  await page.locator("[data-planner-slot='rb']").click();
  await page.locator("[data-position-inspector='RB']").getByLabel("Candidate view").selectOption("natural");
  await page.evaluate(() => window.qa.render("de"));
  await page.getByRole("button", { name: "+1 weiterer" }).click();
  const germanPicker = page.locator("[data-position-picker='RB']");
  await germanPicker.getByText("Aktuelle Besetzung", { exact: true }).waitFor();
  await germanPicker.getByText("Spieler hinzufügen", { exact: true }).waitFor();
  for (const name of ["Anton Example", "Carlo Example", "Daria Example", "Bela Example"]) {
    assert.equal(await germanPicker.getByText(name, { exact: true }).count(), 1, `Current depth ignores restrictive fit mode for ${name}`);
  }
  await germanPicker.getByRole("button", { name: "Schließen" }).click();
  await page.evaluate(() => window.qa.render("en"));
  await page.reload();
  await page.locator("[data-planner-slot='rb']").waitFor();
  assert.equal(await page.locator("[data-planner-slot='rb'] [data-planner-depth-count='4']").count(), 1, "+ Position assignment survives reload");
  const moreTrigger = page.getByRole("button", { name: "+1 more" });
  await moreTrigger.click();
  const morePicker = page.locator("[data-position-picker='RB']");
  await morePicker.waitFor();
  assert.equal(await morePicker.getByText("Current depth", { exact: true }).count(), 1, "+1 more opens the complete position manager");
  for (const name of ["Anton Example", "Carlo Example", "Daria Example", "Bela Example"]) {
    assert.equal(await morePicker.getByText(name, { exact: true }).count(), 1, `Current depth exposes ${name}`);
  }
  await morePicker.getByRole("button", { name: "Close" }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-pitch-more-players") === "RB");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-pitch-more-players")), "RB", "Closing returns focus to the clicked +N control");
  await moreTrigger.click();
  await morePicker.getByRole("button", { name: "Move up: Daria Example" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-position-picker='RB'] [data-position-depth-row]")[1]?.textContent?.includes("Daria Example"));
  let managedDepth = await morePicker.locator("[data-position-depth-row]").allTextContents();
  assert.equal(managedDepth[0].includes("Anton Example"), true, "Reordering a backup keeps rank one Starter");
  assert.equal(managedDepth[1].includes("Daria Example"), true, "Popover moves a hidden Player to rank two");
  await page.reload();
  let pitchRows = await page.locator("[data-planner-slot='rb'] [data-pitch-player-row]").allTextContents();
  assert.equal(pitchRows[1].includes("Daria Example"), true, "Popover reorder survives reload");
  await page.getByRole("button", { name: "+1 more" }).click();
  await morePicker.getByRole("button", { name: "Remove from position: Bela Example" }).click();
  await page.waitForFunction(() => document.querySelector("[data-planner-slot='rb'] [data-planner-depth-count='3']"));
  assert.equal(await page.getByRole("button", { name: "+1 more" }).count(), 0, "Hidden-depth summary disappears immediately at depth three");
  assert.equal(await morePicker.isVisible(), true, "Position manager stays open after removing a hidden Player");
  assert.equal(await morePicker.locator("[data-position-depth-row]").filter({ hasText: "Bela Example" }).count(), 0, "Removed Player leaves Current depth");
  await morePicker.getByRole("button", { name: "Set as starter: Carlo Example" }).click();
  await page.waitForFunction(() => document.querySelector("[data-position-picker='RB'] [data-position-depth-row]")?.textContent?.includes("Carlo Example"));
  managedDepth = await morePicker.locator("[data-position-depth-row]").allTextContents();
  assert.equal(managedDepth[0].includes("Carlo Example"), true, "Popover promotes a Player to Starter");
  pitchRows = await page.locator("[data-planner-slot='rb'] [data-pitch-player-row]").allTextContents();
  assert.equal(pitchRows[0].includes("Carlo Example"), true, "Pitch synchronizes with popover Starter change");
  await morePicker.getByRole("button", { name: "Close" }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-pitch-add-player") === "RB");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-pitch-add-player")), "RB", "Detached +N trigger falls back to + Player focus");
  await page.reload();
  pitchRows = await page.locator("[data-planner-slot='rb'] [data-pitch-player-row]").allTextContents();
  assert.equal(pitchRows[0].includes("Carlo Example"), true, "Popover Starter change survives reload");
  assert.equal(pitchRows.some((row) => row.includes("Bela Example")), false, "Popover removal survives reload");

  await page.evaluate(() => window.qa.reset("en"));
  await page.locator("[data-pitch-player-row='rb-c']").getByRole("button", { name: "Set Carlo Example as RB starter" }).click();
  await page.waitForFunction(() => document.querySelector("[data-planner-slot='rb'] [data-pitch-player-row]")?.textContent?.includes("Carlo Example"));
  pitchRows = await page.locator("[data-planner-slot='rb'] [data-pitch-player-row]").allTextContents();
  assert.equal(pitchRows[0].includes("Carlo Example"), true, "On-pitch Star promotes the selected backup");
  assert.equal(pitchRows[1].includes("Anton Example"), true, "Previous Starter remains rank two");
  await page.locator("[data-planner-slot='rb']").click();
  const synchronizedInspector = page.locator("[data-position-inspector='RB']");
  await synchronizedInspector.waitFor();
  const inspectorRows = await synchronizedInspector.locator("[data-position-depth-list='RB'] > div").allTextContents();
  assert.equal(inspectorRows[0].includes("Carlo Example"), true, "Inspector immediately reflects pitch Starter mutation");
  await page.reload();
  pitchRows = await page.locator("[data-planner-slot='rb'] [data-pitch-player-row]").allTextContents();
  assert.equal(pitchRows[0].includes("Carlo Example"), true, "On-pitch Starter survives reload");

  await page.evaluate(() => window.qa.reset("en"));
  await page.locator("[data-pitch-add-player='RB']").click();
  const reorderPicker = page.locator("[data-position-picker='RB']");
  await reorderPicker.locator("[data-position-candidate='d']").getByRole("button", { name: "Add as option" }).click();
  await reorderPicker.locator("[data-position-depth-row='depth-d-rb']").waitFor();
  await reorderPicker.getByRole("button", { name: "Close" }).click();
  await page.locator("[data-pitch-player-row='depth-d-rb']").dragTo(page.locator("[data-pitch-player-row='rb-c']"));
  await page.waitForFunction(() => document.querySelectorAll("[data-planner-slot='rb'] [data-pitch-player-row]")[1]?.textContent?.includes("Daria Example"));
  pitchRows = await page.locator("[data-planner-slot='rb'] [data-pitch-player-row]").allTextContents();
  assert.equal(pitchRows[1].includes("Daria Example"), true, "On-pitch drag reorders depth to rank two");
  assert.equal(pitchRows[0].includes("Anton Example"), true, "Reordering below rank one keeps the Starter");
  await page.reload();
  pitchRows = await page.locator("[data-planner-slot='rb'] [data-pitch-player-row]").allTextContents();
  assert.equal(pitchRows[1].includes("Daria Example"), true, "On-pitch depth order survives reload");

  await page.evaluate(() => window.qa.reset("en"));
  const starterActions = page.locator("[data-pitch-player-row='rb-a']").getByLabel("Player actions: Anton Example");
  await starterActions.click();
  await page.locator("[data-pitch-player-row='rb-a']").getByRole("button", { name: "× Remove from position" }).click();
  await page.waitForFunction(() => !document.querySelector("[data-pitch-player-row='rb-a']"));
  pitchRows = await page.locator("[data-planner-slot='rb'] [data-pitch-player-row]").allTextContents();
  assert.equal(pitchRows[0].includes("Carlo Example"), true, "Removing the Starter promotes rank two");
  await page.reload();
  pitchRows = await page.locator("[data-planner-slot='rb'] [data-pitch-player-row]").allTextContents();
  assert.equal(pitchRows[0].includes("Carlo Example"), true, "Starter removal survives reload");

  await page.evaluate(() => window.qa.reset("en"));
  await page.locator("[data-pitch-player-row='rb-c']").dragTo(page.locator("[data-planner-slot='cm']"));
  await page.waitForFunction(() => window.qaAssignments.some((row) => row.slotId === "cm" && row.playerId === "c"));
  const multiPositionDepth = await page.evaluate(() => window.qaAssignments.filter((row) => row.playerId === "c").map((row) => row.slotId));
  assert.deepEqual(new Set(multiPositionDepth), new Set(["rb", "cm"]), "Dragging a backup to another position preserves its original depth assignment");
  assert.equal((await page.locator("[data-planner-slot='cm']").innerText()).includes("Bela Example"), true, "Backup cross-position drag does not replace the target Starter");

  await page.evaluate(() => { window.qaSlowAdds = false; window.qa.reset("en"); });
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
  console.log("Squad Planner 2.2 browser regression: PASS (+N position manager, add/promote/reorder/remove, focus, reload, swap, DE/EN, 320/768/1440 px)");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
