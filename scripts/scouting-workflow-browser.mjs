import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Actual forms and server-rendered profile component, fictional data and mocked
// persistence boundaries. No connection to Supabase or Production.
const root = process.cwd();
const qa = createRequire(path.join(process.env.COACHBOARD_QA_DEPS ?? "/private/tmp/coachboard-archive-qa", "package.json"));
const { build } = qa("esbuild");
const { chromium } = qa("playwright");
const bundle = await build({
  stdin: { contents: String.raw`
    import React from "react";
    import {createRoot} from "react-dom/client";
    import {ScoutingPlayerForm,ScoutingObservationForm} from "@/components/scouting/forms";
    import Profile from "@/app/(app)/scouting/players/[id]/page";
    import {playerPayload,observationPayload} from "@/lib/scouting/validation";
    const root=createRoot(document.getElementById("root"));
    window.qa=JSON.parse(sessionStorage.getItem("scouting-fixture")||"null")||{
      locale:new URLSearchParams(location.search).get("locale")||"en",
      player:{id:"p",user_id:"owner",first_name:"Fictional",last_name:"Player",date_of_birth:null,birth_year:null,shirt_number:null,primary_position:"CM",secondary_positions:[],strong_foot:null,current_club:"Test club",current_team:null,status:"identified",source:null,priority:"medium",notes:null,height_cm:null,weight_kg:null,next_action:null,next_action_date:null,linked_squad_player_id:null,created_at:"2026-11-01",updated_at:"2026-11-01"},
      observations:[],history:[]
    };
    const persist=()=>sessionStorage.setItem("scouting-fixture",JSON.stringify(window.qa));
    const playerAction=async(_,fd)=>{
      if(location.pathname.endsWith("/new")&&!fd.get("confirmDuplicate")) return {duplicates:[{id:"possible",kind:"scouting",name:"Possible fictional player"}]};
      const patch=playerPayload(fd);
      if(patch.status!==window.qa.player.status) window.qa.history.unshift({id:crypto.randomUUID(),event_type:"status_changed",detail:patch.status,created_at:new Date().toISOString()});
      window.qa.player={...window.qa.player,...patch};persist();await window.renderQA("/scouting/players/p");return {};
    };
    const observationAction=async(_,fd)=>{
      if(window.failNext){window.failNext=false;return {error:"Simulated failure"};}
      const patch=observationPayload(fd);
      const edit=location.pathname.match(/observations\/(o\d+)\/edit/);
      if(edit){const i=window.qa.observations.findIndex(o=>o.id===edit[1]);window.qa.observations[i]={...window.qa.observations[i],...patch};}
      else window.qa.observations.unshift({id:"o"+window.qa.observations.length,player_id:"p",user_id:"owner",created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...patch});
      persist();await window.renderQA("/scouting/players/p?tab=observations");return {};
    };
    window.renderQA=async(url)=>{
      history.replaceState(null,"",url);
      const locale=window.qa.locale;
      let tree;
      if(url.startsWith("/scouting/players/new")||url==="/scouting/players/p/edit") tree=<ScoutingPlayerForm key={url} action={playerAction} initial={url.endsWith("/edit")?window.qa.player:undefined} locale={locale}/>;
      else if(url.includes("/observations/")){
        const edit=url.match(/observations\/(o\d+)\/edit/);
        tree=<ScoutingObservationForm key={url} action={observationAction} playerId="p" locale={locale} initial={edit?window.qa.observations.find(o=>o.id===edit[1]):undefined} previousFocus={!edit?window.qa.observations[0]?.next_focus:null} today="2026-11-17"/>;
      } else tree=await Profile({params:Promise.resolve({id:"p"}),searchParams:Promise.resolve(Object.fromEntries(new URLSearchParams(url.split("?")[1]||"")))});
      root.render(<div key={url}>{tree}</div>);
    };
    window.renderQA(location.pathname+location.search);
  `, resolveDir: root, loader: "tsx" },
  bundle: true, write: false, jsx: "automatic", format: "iife",
  define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
  plugins: [{ name: "scouting-fixture", setup(builder) {
    const stubs = {
      "next/link": 'import React from "react"; export default function Link({href,children,...props}){return <a href={href} {...props} onClick={e=>{e.preventDefault();window.renderQA(href)}}>{children}</a>}',
      "next/navigation": 'export function notFound(){throw new Error("Not found")}',
      "@/lib/scouting/actions": ["inviteScoutingPlayerToTrial", "linkScoutingTarget", "unlinkScoutingTarget"].map(n=>`export async function ${n}(){return {}}`).join("\n"),
      "@/lib/scouting/queries": 'export async function getScoutingPlayer(){return {...window.qa,links:[],targets:[]}}',
      "@/lib/scouting/server": 'export async function scoutingContext(){return {db:{},userId:"owner",locale:window.qa.locale}}',
      "@/lib/squad/squads": 'export async function listSquads(){return []}'
    };
    builder.onResolve({ filter: /.*/ }, (args) => {
      if (stubs[args.path]) return { path: args.path, namespace: "stub" };
      if (args.path.startsWith("@/")) {
        const base = path.join(root, args.path.slice(2));
        return { path: [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((file) => existsSync(file) && statSync(file).isFile()) };
      }
    });
    builder.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: stubs[args.path], loader: "tsx", resolveDir: root }));
  } }]
});
const cssDir = path.join(root, ".next/static/css");
const css = readdirSync(cssDir).filter(n=>n.endsWith(".css")).map(n=>readFileSync(path.join(cssDir,n),"utf8")).join("\n");
const server = createServer((request,response)=>{
  response.setHeader("Content-Type", request.url === "/bundle.js" ? "application/javascript" : "text/html");
  response.end(request.url === "/bundle.js" ? bundle.outputFiles[0].text : `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main style="padding:12px;max-width:1280px;margin:auto" id="root"></main><script src="/bundle.js"></script></body></html>`);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
let browser;
try {
  browser = await chromium.launch({headless:true,executablePath:process.env.COACHBOARD_QA_CHROME??"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
  for(const locale of ["de","en"]) for(const width of [320,768,1440,1920]) {
    const page = await browser.newPage({viewport:{width,height:1000}});
    const errors=[]; page.on("pageerror",e=>errors.push(e.message));
    const save=()=>page.getByRole("button",{name:locale==="de"?"Speichern":"Save",exact:true}).click();
    const fits=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${locale}/${width}: overflow`);
    await page.goto(`http://127.0.0.1:${server.address().port}/scouting/players/new?locale=${locale}`);
    await page.locator("#firstName").fill("Fictional");
    await page.locator("#shirtNumber").fill("07");
    await page.locator("#birthYear").fill("2012");
    await page.locator("#notes").fill("Scouting".repeat(45));
    await fits(); await save();
    await page.locator('[name="confirmDuplicate"]').waitFor();
    assert.equal(await page.locator("#shirtNumber").inputValue(),"07");
    await page.locator('[name="confirmDuplicate"]').check(); await save();
    await page.waitForURL("**/scouting/players/p"); await fits();
    await page.locator('a[href="/scouting/players/p/observations/new"]').first().click();
    await page.locator("#summary").fill("First observation");
    await page.locator("#situations").fill("23. Perception, decision, execution, impact\n\n51. Second situation");
    await page.locator("#openQuestions").fill("Stronger opposition?");
    await page.locator("#nextFocus").fill("Back to goal under pressure");
    await page.locator("#recommendation").selectOption("monitoring");
    await page.locator("#nextAction").fill("Watch next match");
    await page.locator("#followUpDate").fill("2026-11-24");
    await page.locator("#opponent").fill("Visitors");
    await page.evaluate(()=>window.failNext=true); await save();
    await page.getByRole("alert").waitFor();
    assert.equal(await page.locator("#nextFocus").inputValue(),"Back to goal under pressure");
    assert.match(await page.locator("#situations").inputValue(),/51\. Second/);
    await fits();
    await page.screenshot({path:`/private/tmp/scouting-2-form-${locale}-${width}.png`,fullPage:true});
    await save(); await page.waitForURL("**/p?tab=observations");
    await page.reload();
    await page.getByText("First observation",{exact:true}).waitFor();
    await fits();
    await page.locator('a[href="/scouting/players/p/observations/new"]').first().click();
    await page.getByText("Back to goal under pressure",{exact:true}).waitFor();
    await page.locator("#summary").fill("Second observation");
    await page.locator("#recommendation").selectOption("shortlist");
    await save(); await page.waitForURL("**/p?tab=observations");
    assert.equal(await page.locator("ol > li").count(),2);
    await page.locator('a[href="/scouting/players/p/observations/o0/edit"]').click();
    assert.equal(await page.locator("#openQuestions").inputValue(),"Stronger opposition?");
    assert.equal(await page.locator("#recommendation").inputValue(),"monitoring");
    await page.locator("#openQuestions").fill("Consistency?"); await save();
    await page.waitForURL("**/p?tab=observations");
    await page.locator('a[href="/scouting/players/p/edit"]').click();
    await page.locator("#status").selectOption("trial"); await save();
    await page.waitForURL("**/scouting/players/p");
    await page.locator('a[href="/scouting/players/p?tab=history"]').click();
    await page.locator("ol > li").first().waitFor(); await fits();
    await page.locator('a[href="/scouting/players/p?tab=observations"]').click();
    assert.equal(await page.locator("ol > li").count(),2);
    assert.equal(await page.evaluate(()=>window.qa.observations.find(o=>o.id==="o0").recommendation),"monitoring");
    assert.equal(await page.evaluate(()=>window.qa.player.status),"trial");
    await fits();
    await page.screenshot({path:`/private/tmp/scouting-2-profile-${locale}-${width}.png`,fullPage:true});
    assert.deepEqual(errors,[]); await page.close();
  }
  console.log("Scouting UI PASS: actual forms/profile, duplicate warning, preserved errors, create/edit/reopen, two observations, focus, pipeline/history, DE/EN, 320/768/1440/1920px. Mocked persistence only.");
} finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
