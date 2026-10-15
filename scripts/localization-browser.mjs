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
  "@/lib/squad/development": `
    export const isActiveGoal=g=>g.status==="in_progress"||g.status==="identified";
    export const activeDevelopmentGoals=goals=>goals.filter(isActiveGoal).sort((a,b)=>(b.priority==="high")-(a.priority==="high")||(a.reviewDate??"9999").localeCompare(b.reviewDate??"9999")||b.updatedAt.localeCompare(a.updatedAt));
    export const latestProgressForGoal=goal=>[...goal.progressUpdates].sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt))[0];
    export const latestObservationForGoal=goal=>[...goal.observations].sort((a,b)=>b.observationDate.localeCompare(a.observationDate))[0];
    export const nextIncompleteGoalAction=goal=>goal.actions.filter(action=>!action.completed).sort((a,b)=>(a.dueDate??"9999").localeCompare(b.dueDate??"9999"))[0];
    export const isDevelopmentReviewDue=goal=>isActiveGoal(goal)&&Boolean(goal.reviewDate&&goal.reviewDate<=new Date().toISOString().slice(0,10));
  `
};
const bundle = await build({
  stdin: { contents: `
    import React from "react";
    import {createRoot} from "react-dom/client";
    import {useSystemText} from "@/components/i18n/use-system-text";
    import {I18nProvider} from "@/components/i18n/i18n-provider";
    import {GermanLocalizationBoundary} from "@/components/i18n/german-localization-boundary";
    import {CheckInRow,RatingRow} from "@/components/squad/attendance-controls";
    import {ReliabilityValue} from "@/components/squad/reliability-value";
    import {PlayerDevelopmentSection} from "@/components/squad/player-development";
    import {ReviewCarryForward} from "@/components/sessions/review-carry-forward";
    import {TrainingWorkflowPanel} from "@/components/squad/training-workflow-panel";
    import {applyReviewCarryForward,includesReviewCarryForward} from "@/lib/sessions/review-carry-forward";
    import {getTrainingWorkflowState} from "@/lib/trainings/workflow";
    import {AnalyticsSectionPanel} from "@/app/(app)/squad/analysis/page";
    import {trainingSectionLabel} from "@/lib/i18n/training-labels";
    import {localizeAttentionItems} from "@/lib/squad/attention";
    import SquadError from "@/app/(app)/squad/error";
    import ActionsError from "@/app/(app)/actions/error";
    import ActionsLoading from "@/app/(app)/actions/loading";
    import {AnalyticsMetricCard,AttendanceEntryCard,Mini,Stat} from "@/app/(app)/squad/players/[id]/page";
    window.qa={locale:"en",saves:0,ready:false};
    const root=createRoot(document.getElementById("root"));
    const entry={id:"entry",eventId:"event",playerId:"player",plannedStatus:"expected",finalStatus:"present",latePenaltyApplied:true,player:{firstName:"Quality",lastName:"",playerType:"roster",position:"CM",secondaryPositions:[]}};
    const lateCancellationEntry={...entry,id:"late-cancellation",finalStatus:"absent",actualAbsenceReason:"late_cancellation",actualAttendanceNote:"Cancelled shortly before Training."};
    const lateCancellationSummary={reliabilityPenalty:-1,reliabilityBreakdown:{late:0,lateCancellation:1,unexcused:0,legacyNeedsReview:0}};
    const analytics={trainingSessions:2,reviewedSessions:1,reviewCoverage:.5,averageSessionQuality:3.5,averageSessionIntensity:4.5,averagePlayerResponse:4,participantRecordCount:5,attendanceRecordCount:4,planCoverage:{rate:.5},objectiveOutcomes:{achieved:1,partly_achieved:1,not_achieved:0},focusDistribution:[],events:[],present:2,late:1,absent:1,notExpected:1,notRecorded:1,activeDevelopmentGoals:0,playersWithActiveGoals:0,goalsDueForReview:0,goalsAchievedInPeriod:0,activeGoalCategoryDistribution:[],progressUpdatesInPeriod:0,progressPlayersInPeriod:0,latestProgressDistribution:[],drillInstancesUsed:0,uniqueDrillsUsed:0,reviewedDrillInstances:0,averageDrillEffectiveness:null,drillUsage:[]};
    async function resolveServer(node){
      if(Array.isArray(node)) return Promise.all(node.map(resolveServer));
      if(!React.isValidElement(node))return node;
      if(typeof node.type==="function"&&node.type.constructor.name==="AsyncFunction")return resolveServer(await node.type(node.props));
      return React.cloneElement(node,{},await resolveServer(node.props.children));
    }
    let count=0;
    let legacy="Present";
    let populated=false;
    const carryContext={sourceEventId:"training-a",sourceDate:"2026-10-12",sourceLabel:"Stützpunkttraining",nextTrainingNote:"Nach Ballverlust schneller ins Gegenpressing kommen."};
    const workflowNow={date:"2026-10-16",time:"15:00:00"};
    const workflowEvent=(overrides={})=>({id:"workflow-training",date:"2026-10-17",startTime:"18:00",endTime:"19:30",status:"prepared",attendance:[{id:"attendance",plannedStatus:"expected"}],...overrides});
    const workflowFor=(overrides={},context={})=>getTrainingWorkflowState({event:workflowEvent(overrides),hasPlan:context.hasPlan??false,hasReview:context.hasReview??false,now:workflowNow});
    function CarryHarness({initialFocus="",initialNotes=""}){
      const ui=useSystemText();
      const [values,setValues]=React.useState({mainFocus:initialFocus,notes:initialNotes});
      const included=includesReviewCarryForward(values.mainFocus,values.notes,carryContext.nextTrainingNote);
      const action=values.mainFocus.trim()?"notes":"focus";
      return <><ReviewCarryForward context={carryContext} action={action} alreadyIncluded={included} onApply={()=>setValues(current=>{const result=applyReviewCarryForward(current.mainFocus,current.notes,carryContext.nextTrainingNote,ui("From last reflection:"));return {mainFocus:result.mainFocus,notes:result.notes};})}/><p data-main-focus translate="no">{values.mainFocus}</p><p data-plan-notes translate="no">{values.notes}</p></>;
    }
    async function render(){
      window.qa.ready=false;
      const locale=window.qa.locale;
      const action=localizeAttentionItems([{key:"action",targetKind:"player",targetId:"player",playerId:"player",playerName:"John Smith",playerPosition:"CM",playerType:"roster",type:"high-priority-goal-follow-up",category:"development",priority:"high",title:"High-priority goal needs follow-up",explanation:'The high-priority goal "Press after loss" has no recent observation follow-up.',evidence:[{label:"Goal",value:"Press after loss"}],suggestedActions:[{label:"Open Player Hub",href:"/squad/players/player"}],thresholdLabel:"No progress observation after 14 days.",detectedAt:"2026-10-15",dismissible:false,snoozeable:true}],locale)[0];
      const server=await resolveServer(<>
        <section id="analytics">{["training","attendance","development","drills"].map(section=><AnalyticsSectionPanel key={section} section={section} teamAnalytics={analytics} summaries={[]}/>)}</section>
        <section id="player-analytics-kpis" className="grid min-w-0 items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AnalyticsMetricCard href="#analytics" label={locale==="de"?"Durchschnittsbewertung":"Average rating"} value={locale==="de"?"4,2":"4.2"} detail={locale==="de"?"12 gespeicherte Bewertungen":"12 saved ratings"} tone="green"/>
          <AnalyticsMetricCard href="#analytics" label={locale==="de"?"Zuverlässigkeit":"Reliability"} value="0" detail={locale==="de"?"Keine Zuverlässigkeitsabzüge":"No reliability penalties"} tone="green"/>
        </section>
        <section id="player-analytics-mini" className="grid min-w-0 gap-3 rounded-lg border border-board-line bg-white p-4 shadow-soft sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <Mini label={locale==="de"?"Tatsächliche Anwesenheit erfasst":"Recorded actual attendance"} value="12/12"/>
          <Mini label={locale==="de"?"Anwesenheit bei Einplanung":"Attendance when expected"} value="100 %"/>
          <Stat label={locale==="de"?"Durchschnittsbewertung":"Average rating"} value={locale==="de"?"4,2":"4.2"}/>
        </section>
        <section id="history"><AttendanceEntryCard entry={{...entry,finalStatus:"Z",plannedReason:"school",lateMinutes:5,coachNote:"Present",event:{id:"event",date:"2026-09-19",label:"Quality"}}}/></section>
        <section id="late-cancellation-history"><AttendanceEntryCard entry={{...lateCancellationEntry,event:{id:"event-late-cancellation",date:"2026-09-20",label:"Fictional Training"}}}/></section>
        <section id="development"><PlayerDevelopmentSection playerId="player" development={populated?{
          goals:[{id:"goal",title:"Quality",successCriteria:"Present",coachNotes:"Expected",category:"physical",priority:"high",status:"in_progress",progress:"developing",startDate:"2026-09-01",reviewDate:"2026-09-19",updatedAt:"2026-09-19",observations:[{id:"observation",observationDate:"2026-09-19",createdAt:"2026-09-19",note:"Protected observation"}],actions:[{id:"action",description:"Protected next step",completed:false,createdAt:"2026-09-19"}],progressUpdates:[{id:"progress",recordedAt:"2026-09-19",createdAt:"2026-09-19",progressLevel:"consistent",note:"Present"}]}],
          observations:[{id:"observation",observationDate:"2026-09-19",createdAt:"2026-09-19",note:"Protected observation"}],
          timeline:[{id:"timeline",type:"progress",date:"2026-09-19",title:"Progress: consistent",progressLevel:"consistent",detail:"Present"}]
        }:{goals:[],observations:[],timeline:[]}}/></section>
        <section id="carry-selection"><ReviewCarryForward context={carryContext}/></section>
        <section id="carry-focus"><CarryHarness/></section>
        <section id="carry-notes"><CarryHarness initialFocus="Spielaufbau" initialNotes="Existing notes"/></section>
        <section id="carry-already"><CarryHarness initialFocus="" initialNotes={carryContext.nextTrainingNote}/></section>
        <section id="carry-none"></section>
        <section id="workflow-future"><TrainingWorkflowPanel workflow={workflowFor()} compact openHref="/trainings/workflow-training"/></section>
        <section id="workflow-ready"><TrainingWorkflowPanel workflow={workflowFor({}, {hasPlan:true})}/></section>
        <section id="workflow-live"><TrainingWorkflowPanel workflow={workflowFor({date:workflowNow.date,startTime:"14:00",endTime:"16:00"})}/></section>
        <section id="workflow-review"><TrainingWorkflowPanel workflow={workflowFor({date:"2026-10-15",attendance:[{id:"attendance",plannedStatus:"expected",finalStatus:"present"}]})}/></section>
        <section id="workflow-complete"><TrainingWorkflowPanel workflow={workflowFor({date:"2026-10-15",attendance:[{id:"attendance",plannedStatus:"expected",finalStatus:"present"}]},{hasReview:true})}/></section>
      </>);
      root.render(<I18nProvider locale={locale}><GermanLocalizationBoundary locale={locale}>
        <nav><button onClick={()=>window.qa.switch("en")}>EN</button><button onClick={()=>window.qa.switch("de")}>DE</button></nav>
        {server}
        <section id="check-in"><CheckInRow entry={entry} eventId="event" eventDate="2026-09-19"/></section>
        <section id="late-cancellation-check-in"><CheckInRow entry={lateCancellationEntry} eventId="event" eventDate="2026-09-19"/></section>
        <section id="late-cancellation-analytics"><ReliabilityValue summary={lateCancellationSummary} locale={locale} showReviewLink={false}/></section>
        <section id="ratings"><RatingRow entry={entry} eventId="event"/></section>
        <section id="sections" translate="no">{["activation","Main part 1","Main part 2","Cool-down"].map(value=><p key={value}>{trainingSectionLabel(value,locale)}</p>)}<p data-user-content>Quality</p></section>
        <section id="actions-runtime" translate="no"><h2>{action.title}</h2><p>{action.playerName}</p><p>{action.explanation}</p><p>{action.thresholdLabel}</p><p>{action.evidence[0].label}: <span data-user-content>{action.evidence[0].value}</span></p><a href={action.suggestedActions[0].href}>{action.suggestedActions[0].label}</a></section>
        <section id="protected-user-content" translate="no"><p>John Smith</p><p>Queens Park Rangers</p><p>Quick transition game</p><p>Press after loss</p></section>
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
      const functions=tree.statements.filter(n=>ts.isFunctionDeclaration(n)&&["AnalyticsMetricCard","AttendanceEntryCard","Badge","Mini","Stat","toneBorder","toneText"].includes(n.name?.text)).map(n=>n.getText(tree)).join("\n");
      return {contents:`import type {ReactNode} from "react";import Link from "next/link";import {getActiveLocale} from "@/lib/i18n/server";import {createSystemTranslator} from "@/lib/i18n/system-text";import {formatNumber} from "@/lib/i18n";import {cn} from "@/lib/utils";import {actualAbsenceReasonLabel,formatEventDate,plannedStatusLabel,finalStatusLabel,plannedReasonLabel,reliabilityMalus,effectiveActualAbsenceReason} from "@/lib/squad/attendance-format";${functions}\nexport {AnalyticsMetricCard,AttendanceEntryCard,Mini,Stat};`,loader:"tsx",resolveDir:path.dirname(args.path)};
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
  const page=await browser.newPage({locale:"de-DE"});const errors=[];page.on("pageerror",e=>{errors.push(e.message);console.error(`Browser fixture error: ${e.stack ?? e.message}`);});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(()=>window.qa?.ready);
  for(const locale of ["en","de","en","de"]){
    const previous=await page.locator("body").getAttribute("data-render");
    await page.getByRole("button",{name:locale.toUpperCase(),exact:true}).click();
    await page.waitForFunction(old=>window.qa.ready&&document.body.dataset.render!==old,previous);
    const de=locale==="de";
    assert.ok((await page.locator("#analytics").innerText()).includes(de?"Trainingseinheiten":"Training Sessions"));
    assert.ok((await page.locator("#analytics").innerText()).includes(de?"3,5":"3.5"));
    const playerAnalyticsText=await page.locator("#player-analytics-kpis, #player-analytics-mini").allInnerTexts();
    const renderedPlayerAnalyticsText=playerAnalyticsText.join(" ").toLocaleUpperCase(locale);
    for(const phrase of de?["Durchschnittsbewertung","Tatsächliche Anwesenheit erfasst","Keine Zuverlässigkeitsabzüge","Anwesenheit bei Einplanung"]:["Average rating","Recorded actual attendance","No reliability penalties","Attendance when expected"]){
      assert.ok(renderedPlayerAnalyticsText.includes(phrase.toLocaleUpperCase(locale)),`Missing player Analytics label: ${phrase}; rendered: ${JSON.stringify(playerAnalyticsText)}`);
    }
    assert.ok((await page.locator("#development").innerText()).includes(de?"Entwicklungsziel hinzufügen":"Add development goal"));
    assert.ok((await page.locator("#development").innerText()).includes(de?"Noch kein Entwicklungsziel":"No development focus yet"));
    assert.ok(!(await page.locator("#development").innerText()).includes(de?"0 aktive Entwicklungsziele":"0 active goals"));
    assert.ok((await page.locator("#carry-selection").innerText()).toLocaleLowerCase(locale).includes((de?"Aus der letzten Reflexion":"From the last reflection").toLocaleLowerCase(locale)));
    assert.ok((await page.locator("#carry-selection").innerText()).includes("Nach Ballverlust schneller ins Gegenpressing kommen."));
    assert.equal(await page.locator("#carry-selection button").count(),0);
    assert.ok((await page.locator("#carry-focus").innerText()).includes(de?"Als Schwerpunkt übernehmen":"Use as focus"));
    assert.ok((await page.locator("#carry-notes").innerText()).includes(de?"In Planungsnotizen übernehmen":"Add to planning notes"));
    assert.ok((await page.locator("#carry-already").innerText()).includes(de?"Bereits übernommen":"Already included"));
    assert.equal((await page.locator("#carry-none").innerText()).trim(),"");
    assert.ok((await page.locator("#workflow-future").innerText()).includes(de?"Training planen":"Plan Training"));
    assert.ok((await page.locator("#workflow-ready").innerText()).includes(de?"Training vorbereiten":"Prepare Training"));
    assert.ok((await page.locator("#workflow-live").innerText()).includes(de?"Check-in öffnen":"Open Check-in"));
    assert.ok((await page.locator("#workflow-review").innerText()).includes(de?"Training reflektieren":"Review Training"));
    assert.ok((await page.locator("#workflow-complete").innerText()).includes(de?"Training abgeschlossen":"Training completed"));
    assert.equal(await page.locator("#workflow-future [data-workflow-primary]").count(),1);
    assert.equal(await page.locator("#workflow-ready [data-workflow-primary]").count(),1);
    assert.equal(await page.locator("#workflow-live [data-workflow-primary]").count(),1);
    assert.equal(await page.locator("#workflow-review [data-workflow-primary]").count(),1);
    assert.equal(await page.locator("#workflow-complete [data-workflow-primary]").count(),0);
    assert.equal(await page.locator("#workflow-future a").count(),2,"Dashboard-style workflow has one primary action plus Open Training");
    assert.ok(!(await page.locator("#workflow-review").innerText()).includes(de?"Bewertungen":"Ratings"),"Untouched Ratings must not become workflow debt");
    assert.ok(!(await page.locator("#check-in").innerText()).includes(de?"Geplant: Erwartet":"Planned: Expected"),"Expected planning context should stay quiet in Check-in");
    assert.equal(await page.locator("#check-in").getByRole("button",{name:de?"Anwesend":"Present",exact:true}).count(),1);
    assert.ok((await page.locator("#sections").innerText()).includes(de?"Hauptteil 1":"Main part 1"));
    assert.equal(await page.locator("#custom").innerText(),"Present");
    assert.equal(await page.locator("#custom").getAttribute("title"),"Present");
    assert.deepEqual(await page.locator("#protected-user-content p").allTextContents(),["John Smith","Queens Park Rangers","Quick transition game","Press after loss"]);
    const actionText=await page.locator("#actions-runtime").innerText();
    assert.ok(actionText.includes("John Smith"));
    assert.ok(actionText.includes("Press after loss"));
    assert.ok(actionText.includes(de?"Wichtiges Ziel muss nachverfolgt werden":"High-priority goal needs follow-up"));
    assert.ok(actionText.includes(de?"Spielerprofil öffnen":"Open Player Hub"));
    if(de)for(const phrase of ["High-priority goal needs follow-up","No progress observation after","Open Player Hub"])assert.ok(!actionText.includes(phrase),`English Action Center copy: ${phrase}`);
    assert.equal(await page.locator("#check-in [translate=no]").filter({hasText:/^Quality$/}).count(),1);
    assert.ok((await page.locator("#errors").innerText()).includes(de?"Der Kaderbereich konnte nicht geladen werden":"The squad workspace could not be loaded"));
    assert.equal(await page.locator('#loading [aria-busy="true"]').getAttribute("aria-label"),de?"Aktionsübersicht wird geladen":"Loading Action Center");
    assert.ok((await page.locator("#history").innerText()).includes(de?"Geplant: Eingeplant · Tatsächlich: Verspätet":"Planned: Expected · Actual: Late"));
    assert.ok((await page.locator("#history").innerText()).includes(de?"Geplanter Grund: Schule":"Planned reason: School"));
    assert.ok((await page.locator("#history").innerText()).includes("Quality"));
    const lateCheckIn=await page.locator("#late-cancellation-check-in").innerText();
    assert.ok(lateCheckIn.includes(de?"Abwesend · Verspätet abgesagt":"Absent · Late cancellation"));
    const lateHistory=await page.locator("#late-cancellation-history").innerText();
    assert.ok(lateHistory.includes(de?"Tatsächlich: Abwesend · Verspätet abgesagt":"Actual: Absent · Late cancellation"));
    assert.ok(lateHistory.includes("Cancelled shortly before Training."),"Factual attendance note must remain unchanged");
    assert.ok((await page.locator("#late-cancellation-analytics").innerText()).includes(de?"1× verspätet abgesagt":"1× late cancellation"));
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
    assert.ok(!text.includes(locale==="de"?"1 aktives Entwicklungsziel":"1 active goal"));
    assert.ok(text.includes(locale==="de"?"Stabil":"Consistent"));
    assert.equal(await page.locator('#development h3[translate="no"]').innerText(),"Quality");
    assert.ok(text.includes("Protected next step"));
    assert.ok(text.includes("Protected observation"));
    assert.ok(text.includes("Present"),"Coach notes must remain unchanged");
    await page.locator("#development summary").filter({hasText:locale==="de"?"Entwicklungsziel hinzufügen":"Add development goal"}).first().click();
    assert.equal(await page.locator('#development select[name="category"]').first().inputValue(),"other");
    assert.equal(await page.locator('#development select[name="category"]').first().locator('option[value="physical"]').textContent(),locale==="de"?"Körperlich":"Physical");
  }
  assert.equal(await page.evaluate(()=>window.qa.saves),0,"Opening or switching language must not write data");
  await page.locator("#carry-focus").getByRole("button",{name:"Als Schwerpunkt übernehmen",exact:true}).click();
  assert.equal(await page.locator("#carry-focus [data-main-focus]").innerText(),"Nach Ballverlust schneller ins Gegenpressing kommen.");
  assert.ok((await page.locator("#carry-focus").innerText()).includes("Bereits übernommen"));
  await page.locator("#carry-notes").getByRole("button",{name:"In Planungsnotizen übernehmen",exact:true}).click();
  const carriedNotes=await page.locator("#carry-notes [data-plan-notes]").innerText();
  assert.ok(carriedNotes.includes("Existing notes"));
  assert.ok(carriedNotes.includes("Aus letzter Reflexion:"));
  assert.equal(carriedNotes.split("Nach Ballverlust schneller ins Gegenpressing kommen.").length-1,1);
  await page.setViewportSize({width:1440,height:1000});
  const analyticsCard=page.locator("#player-analytics-kpis a").first();
  await analyticsCard.scrollIntoViewIfNeeded();
  const cardBeforeHover=await analyticsCard.boundingBox();
  await analyticsCard.hover();
  await page.waitForTimeout(250);
  const cardAfterHover=await analyticsCard.boundingBox();
  assert.deepEqual(cardAfterHover,cardBeforeHover,"Player Analytics KPI cards must not move or resize on hover");
  const workflowCard=page.locator("#workflow-ready [data-training-workflow]");
  await workflowCard.scrollIntoViewIfNeeded();
  const workflowBeforeHover=await workflowCard.boundingBox();
  await workflowCard.hover();
  await page.waitForTimeout(150);
  assert.deepEqual(await workflowCard.boundingBox(),workflowBeforeHover,"Training workflow cards must stay stable on hover");
  for(const locale of ["en","de"]){
    await page.getByRole("button",{name:locale.toUpperCase(),exact:true}).click();
    await page.waitForFunction(language=>window.qa.ready&&document.documentElement.lang===language,locale);
    for(const width of [320,360,375,390,430,768,1440]){
      await page.setViewportSize({width,height:1000});
      const clippedAnalyticsText=await page.evaluate(()=>[...document.querySelectorAll("#player-analytics-kpis p, #player-analytics-mini p")].filter(el=>el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1).map(el=>el.textContent));
      assert.deepEqual(clippedAnalyticsText,[],`${locale} clipped Player Analytics text at ${width}`);
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
