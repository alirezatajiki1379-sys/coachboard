import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const qaRequire = createRequire(path.join(process.env.COACHBOARD_QA_DEPS ?? "/private/tmp/coachboard-stability-tests", "package.json"));
const { build } = qaRequire("esbuild");
const { chromium } = qaRequire("playwright");
const stubs = {
  "next/link": 'import React from "react"; export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}',
  "next/navigation": 'export const usePathname=()=>"/squad"; export const useRouter=()=>({refresh(){},push(){}}); export const redirect=()=>{};',
  "@/lib/i18n/server": 'export const getActiveLocale=async()=>window.qa.locale; export const getUserLocale=getActiveLocale;',
  "@/lib/supabase/server": 'export const createClient=()=>{throw new Error("No real database access in localization fixtures")};',
  "@/lib/squad/analytics-queries": 'export const getSquadAnalyticsOverview=()=>{}; export const parseAnalyticsFilters=()=>{};',
  "@/lib/squad/development": 'export const isActiveGoal=g=>g.status==="in_progress"||g.status==="identified";'
};
const bundle = await build({
  stdin: { contents: `
    import React from "react";
    import {createRoot} from "react-dom/client";
    import {I18nProvider} from "@/components/i18n/i18n-provider";
    import {GermanLocalizationBoundary} from "@/components/i18n/german-localization-boundary";
    import {CheckInRow,RatingRow} from "@/components/squad/attendance-controls";
    import {PlayerDevelopmentSection} from "@/components/squad/player-development";
    import {AnalyticsSectionPanel} from "@/app/(app)/squad/analysis/page";
    import {trainingSectionLabel} from "@/lib/i18n/training-labels";
    import SquadError from "@/app/(app)/squad/error";
    import ActionsError from "@/app/(app)/actions/error";
    import ActionsLoading from "@/app/(app)/actions/loading";
    import {AttendanceEntryCard} from "@/app/(app)/squad/players/[id]/page";
    window.qa={locale:"en",saves:0,ready:false};
    const root=createRoot(document.getElementById("root"));
    const entry={id:"entry",eventId:"event",playerId:"player",plannedStatus:"expected",finalStatus:"present",latePenaltyApplied:true,player:{firstName:"Quality",lastName:"",playerType:"roster",position:"CM",secondaryPositions:[]}};
    const analytics={trainingSessions:2,reviewedSessions:1,reviewCoverage:.5,averageSessionQuality:3.5,averageSessionIntensity:4.5,planCoverage:{rate:.5},objectiveOutcomes:{achieved:1,partly_achieved:1,not_achieved:0},focusDistribution:[],present:2,late:1,absent:1,notExpected:1,notRecorded:1,activeDevelopmentGoals:0,playersWithActiveGoals:0,goalsDueForReview:0,goalsAchievedInPeriod:0,activeGoalCategoryDistribution:[],progressUpdatesInPeriod:0,progressPlayersInPeriod:0,latestProgressDistribution:[],drillInstancesUsed:0,uniqueDrillsUsed:0,reviewedDrillInstances:0,averageDrillEffectiveness:null,drillUsage:[]};
    async function resolveServer(node){
      if(Array.isArray(node)) return Promise.all(node.map(resolveServer));
      if(!React.isValidElement(node))return node;
      if(typeof node.type==="function"&&node.type.constructor.name==="AsyncFunction")return resolveServer(await node.type(node.props));
      return React.cloneElement(node,{},await resolveServer(node.props.children));
    }
    let count=0;
    let legacy="Present";
    let populated=false;
    async function render(){
      window.qa.ready=false;
      const locale=window.qa.locale;
      const server=await resolveServer(<>
        <section id="analytics">{["training","attendance","development","drills"].map(section=><AnalyticsSectionPanel key={section} section={section} teamAnalytics={analytics} summaries={[]}/>)}</section>
        <section id="history"><AttendanceEntryCard entry={{...entry,finalStatus:"Z",plannedReason:"school",lateMinutes:5,coachNote:"Present",event:{id:"event",date:"2026-09-19",label:"Quality"}}}/></section>
        <section id="development"><PlayerDevelopmentSection playerId="player" development={populated?{
          goals:[{id:"goal",title:"Quality",successCriteria:"Present",coachNotes:"Expected",category:"physical",priority:"high",status:"in_progress",progress:"developing",startDate:"2026-09-01",reviewDate:"2026-09-19",observations:[],actions:[],progressUpdates:[{id:"progress",recordedAt:"2026-09-19",progressLevel:"consistent",note:"Present"}]}],
          timeline:[{id:"timeline",type:"progress",date:"2026-09-19",title:"Progress: consistent",progressLevel:"consistent",detail:"Present"}]
        }:{goals:[],timeline:[]}}/></section>
      </>);
      root.render(<I18nProvider locale={locale}><GermanLocalizationBoundary locale={locale}>
        <nav><button onClick={()=>window.qa.switch("en")}>EN</button><button onClick={()=>window.qa.switch("de")}>DE</button></nav>
        {server}
        <section id="check-in"><CheckInRow entry={entry} eventId="event" eventDate="2026-09-19"/></section>
        <section id="ratings"><RatingRow entry={entry} eventId="event"/></section>
        <section id="sections" translate="no">{["activation","Main part 1","Main part 2","Cool-down"].map(value=><p key={value}>{trainingSectionLabel(value,locale)}</p>)}<p data-user-content>Quality</p></section>
        <p id="legacy" title={legacy}>{legacy}</p>
        <p id="custom" translate="no" title="Present">Present</p>
        <section id="errors"><SquadError error={new Error("Fictional failure")} reset={()=>{}}/><ActionsError reset={()=>{}}/></section>
        <section id="loading"><ActionsLoading/></section>
      </GermanLocalizationBoundary></I18nProvider>);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{document.body.dataset.render=String(++count);window.qa.ready=true;}));
    }
    window.qa.switch=async(locale)=>{window.qa.locale=locale;await render();};
    window.qa.updateLegacy=async()=>{legacy="Absent";await render();};
    window.qa.populate=async()=>{populated=true;await render();};
    render();
  `, resolveDir: root, loader: "tsx" },
  bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "localization-fixtures", setup(builder) {
    builder.onResolve({filter: /.*/}, args => {
      if(stubs[args.path])return {path:args.path,namespace:"stub"};
      if(args.path.startsWith("@/")&&/-actions$/.test(args.path))return {path:args.path,namespace:"actions"};
      if(args.path.startsWith("@/")){
        const base=path.join(root,args.path.slice(2));
        return {path:[base,base+".ts",base+".tsx",path.join(base,"index.ts")].find(p=>existsSync(p)&&statSync(p).isFile())};
      }
    });
    builder.onLoad({filter:/.*/,namespace:"stub"},args=>({contents:stubs[args.path],loader:"tsx",resolveDir:root}));
    builder.onLoad({filter:/.*/,namespace:"actions"},args=>{
      const source=readFileSync(path.join(root,args.path.slice(2)+".ts"),"utf8");
      const tree=ts.createSourceFile(args.path,source,99,true);
      const names=tree.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)).map(n=>n.name.text);
      return {contents:names.map(name=>'export async function '+name+'(){window.qa.saves++;return {ok:false,message:"Fixture does not save"}}').join("\n"),loader:"js"};
    });
    builder.onLoad({filter:/squad\/analysis\/page\.tsx$/},args=>({contents:readFileSync(args.path,"utf8")+"\nexport { AnalyticsSectionPanel };",loader:"tsx",resolveDir:path.dirname(args.path)}));
    builder.onLoad({filter:/squad\/players\/\[id\]\/page\.tsx$/},args=>{
      const tree=ts.createSourceFile(args.path,readFileSync(args.path,"utf8"),99,true,ts.ScriptKind.TSX);
      const functions=tree.statements.filter(n=>ts.isFunctionDeclaration(n)&&["AttendanceEntryCard","Badge"].includes(n.name?.text)).map(n=>n.getText(tree)).join("\n");
      return {contents:`import Link from "next/link";import {getActiveLocale} from "@/lib/i18n/server";import {createSystemTranslator} from "@/lib/i18n/system-text";import {formatNumber} from "@/lib/i18n";import {cn} from "@/lib/utils";import {formatEventDate,plannedStatusLabel,finalStatusLabel,plannedReasonLabel,reliabilityMalus} from "@/lib/squad/attendance-format";${functions}\nexport {AttendanceEntryCard};`,loader:"tsx",resolveDir:path.dirname(args.path)};
    });
  }}]
});
const cssDir=path.join(root,".next/static/css");
const css=process.env.COACHBOARD_QA_CSS?readFileSync(process.env.COACHBOARD_QA_CSS,"utf8"):readdirSync(cssDir).filter(n=>n.endsWith(".css")).map(n=>readFileSync(path.join(cssDir,n),"utf8")).join("\n");
const server=createServer((req,res)=>{
  if(req.url==="/bundle.js"){res.setHeader("Content-Type","application/javascript");res.end(bundle.outputFiles[0].text);}
  else{res.setHeader("Content-Type","text/html");res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main id="root" style="max-width:1100px;margin:auto;padding:12px"></main><script src="/bundle.js"></script></body></html>`);}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
let browser;
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.COACHBOARD_QA_CHROME??"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
  const page=await browser.newPage({locale:"de-DE"});const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(()=>window.qa?.ready);
  for(const locale of ["en","de","en","de"]){
    const previous=await page.locator("body").getAttribute("data-render");
    await page.getByRole("button",{name:locale.toUpperCase(),exact:true}).click();
    await page.waitForFunction(old=>window.qa.ready&&document.body.dataset.render!==old,previous);
    const de=locale==="de";
    assert.ok((await page.locator("#analytics").innerText()).includes(de?"Trainingseinheiten":"Training Sessions"));
    assert.ok((await page.locator("#analytics").innerText()).includes(de?"3,5":"3.5"));
    assert.ok((await page.locator("#development").innerText()).includes(de?"Entwicklungsziel hinzufügen":"Add development goal"));
    assert.ok((await page.locator("#development").innerText()).includes(de?"0 aktive Entwicklungsziele":"0 active goals"));
    assert.ok((await page.locator("#check-in").innerText()).includes(de?"Eingeplant":"Expected"));
    assert.equal(await page.locator("#check-in").getByRole("button",{name:de?"Anwesend":"Present",exact:true}).count(),1);
    assert.ok((await page.locator("#sections").innerText()).includes(de?"Hauptteil 1":"Main part 1"));
    assert.equal(await page.locator("#custom").innerText(),"Present");
    assert.equal(await page.locator("#custom").getAttribute("title"),"Present");
    assert.equal(await page.locator("#check-in [translate=no]").filter({hasText:/^Quality$/}).count(),1);
    assert.ok((await page.locator("#errors").innerText()).includes(de?"Der Kaderbereich konnte nicht geladen werden":"The squad workspace could not be loaded"));
    assert.equal(await page.locator('#loading [aria-busy="true"]').getAttribute("aria-label"),de?"Aktionsübersicht wird geladen":"Loading Action Center");
    assert.ok((await page.locator("#history").innerText()).includes(de?"Geplant: Eingeplant · Tatsächlich: Verspätet":"Planned: Expected · Actual: Late"));
    assert.ok((await page.locator("#history").innerText()).includes(de?"Grund: Schule":"Reason: School"));
    assert.ok((await page.locator("#history").innerText()).includes("Quality"));
    const forbidden=de?["Training Sessions","Training Focus","Review coverage","Planned sessions","No structured focus has been saved"]:["Trainingseinheiten","Reflexionsabdeckung","Trainingsschwerpunkte"];
    for(const word of forbidden)assert.ok(!(await page.locator("#analytics").innerText()).includes(word),`Wrong-language Analytics copy: ${word}`);
  }
  await page.evaluate(()=>window.qa.updateLegacy());
  await page.getByText("Abwesend",{exact:true}).first().waitFor();
  await page.getByRole("button",{name:"EN",exact:true}).click();
  await page.waitForFunction(()=>window.qa.ready&&document.getElementById("legacy").textContent==="Absent");
  assert.equal(await page.locator("#legacy").getAttribute("title"),"Absent");
  await page.evaluate(()=>window.qa.populate());
  for(const locale of ["de","en","de"]){
    const previous=await page.locator("body").getAttribute("data-render");
    await page.getByRole("button",{name:locale.toUpperCase(),exact:true}).click();
    await page.waitForFunction(old=>window.qa.ready&&document.body.dataset.render!==old,previous);
    const text=await page.locator("#development").innerText();
    assert.ok(text.includes(locale==="de"?"1 aktives Entwicklungsziel":"1 active goal"));
    assert.ok(text.includes(locale==="de"?"Körperlich":"Physical"));
    assert.ok(text.includes(locale==="de"?"Fortschritt: Konstant":"Progress: Consistent"));
    assert.equal(await page.locator("#development h3").innerText(),"Quality");
    assert.ok(text.includes("Present"),"Coach notes must remain unchanged");
    await page.locator("#development summary").first().click();
    assert.equal(await page.locator('#development select[name="category"]').first().inputValue(),"technical");
    assert.equal(await page.locator('#development select[name="category"]').first().locator('option[value="physical"]').textContent(),locale==="de"?"Körperlich":"Physical");
  }
  assert.equal(await page.evaluate(()=>window.qa.saves),0,"Opening or switching language must not write data");
  for(const locale of ["en","de"]){
    await page.getByRole("button",{name:locale.toUpperCase(),exact:true}).click();
    await page.waitForFunction(language=>window.qa.ready&&document.documentElement.lang===language,locale);
    for(const width of [320,360,375,390,430,768,1440]){
      await page.setViewportSize({width,height:1000});
      const overflowing=await page.evaluate(()=>[...document.querySelectorAll("#root *")].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1;}).slice(0,8).map(el=>({tag:el.tagName,text:el.textContent.slice(0,60),class:el.className})));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${locale} overflow at ${width}: ${JSON.stringify(overflowing)}`);
    }
  }
  await page.getByRole("button",{name:"DE",exact:true}).click();
  await page.waitForFunction(()=>window.qa.ready&&document.documentElement.lang==="de");
  await page.screenshot({path:"/private/tmp/coachboard-localization-de.png",fullPage:true});
  assert.deepEqual(errors,[]);
  console.log("PASS: real Analytics panels, Development section, Check-in and Ratings; en -> de -> en -> de; user-content preservation; stale DOM/attribute restore; EN/DE 320/360/375/390/430/768/1440px; no saves or browser errors.");
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
