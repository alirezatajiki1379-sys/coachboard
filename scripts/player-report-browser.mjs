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
  "next/link": `export default function Link({children}){return children;}`,
  "@/components/sessions/print-button": `export function PrintButton(){return null;}`,
  "@/lib/squad/player-review-actions": `export async function savePlayerConversationDraft(){} export async function completePlayerConversation(){}`
};

const bundle = await build({
  stdin: {
    contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {PlayerConversationReport} from "@/components/squad/player-conversation-report";
      const params=new URLSearchParams(location.search);
      const locale=params.get("locale")==="de"?"de":"en";
      const variant=params.get("variant")||"short";
      const player=(id,type="roster")=>({id,userId:"user",squadId:"squad",playerType:type,firstName:type==="trial"?"Tariq":"Mia",lastName:"Beispiel",dateOfBirth:"2011-05-14",position:"Central Midfielder",positionFamilies:["Midfield"],secondaryPositions:["Attacking Midfielder"],preferredPositions:["CM","CAM"],strongFoot:"both",club:"Fictional FC",jerseyNumber:"8",trialStartDate:type==="trial"?"2026-09-01":undefined,onboardingWarnings:[],createdAt:"2026-01-01T00:00:00Z",updatedAt:"2026-01-01T00:00:00Z"});
      const summary=(id,type="roster")=>({player:player(id,type),records:[],trainings:12,attended:10,expectedTrainings:11,notExpectedTrainings:1,unclearTrainings:0,recordedTrainings:12,notRecordedTrainings:0,attendedWhenExpected:10,attendanceWhenExpectedRecorded:11,late:1,absent:1,unexcused:0,rated:8,averageRating:3.8,latestFiveAverage:4,trend:{label:"Improving",value:0.4,description:"Fictional trend"},participationRate:0.833,attendanceWhenExpectedRate:0.909,attendanceRate:0.909,reliabilityPenalty:0,averageReliabilityPenalty:0,ratingDistribution:{1:0,2:0,3:2,4:5,5:1},attendanceDistribution:{present:9,late:1,absent:1,notExpected:1,notRecorded:0},plannedAbsenceDistribution:{injured:0,sick:0,school:1,work:0,holiday:0,private:0,other:0},categorySummaries:["Technique","Game understanding","Intensity","Behavior"].map((label,index)=>({key:["ratingTechnique","ratingGameUnderstanding","ratingIntensity","ratingBehavior"][index],label,average:3.5+index/10,count:8,latestFive:[4,4,3,4,4],trend:{label:"Stable",value:0,description:"Stable"}})),evidenceBase:{label:"Stronger evidence base",detail:"Eight rated sessions"},dataSummary:"Fictional data",assessment:undefined});
      const longText="Keeps scanning before receiving, communicates clearly, and should continue improving the timing of forward actions under pressure. ".repeat(12);
      const development=(long)=>({goals:long?Array.from({length:8},(_,index)=>({id:"goal-"+index,title:"Development goal "+(index+1),successCriteria:longText,reviewDate:"2026-11-15"})):[],observations:long?Array.from({length:8},(_,index)=>({id:"observation-"+index,observationDate:"2026-10-0"+((index%8)+1),note:longText})):[],timeline:[]});
      const sections=(long)=>({attendance:true,absenceReasons:true,availability:true,performance:true,developmentGoals:true,observations:long,playerNotes:long});
      const reportProps=(id,type,long,mode,minimal=false)=>({playerId:id,summary:summary(id,type),development:development(long),medicalPeriods:minimal||type==="trial"?[]:[{id:"medical",userId:"user",playerId:id,type:"injured",startDate:"2026-09-01",endDate:"2026-09-07",description:"Minor ankle issue",status:"completed",createdAt:"2026-09-01",updatedAt:"2026-09-07"}],availabilityPeriods:[],notes:long?[{id:"note",playerId:id,squadId:"squad",userId:"user",note:longText,noteDate:"2026-10-01",visibility:"conversation_eligible",pinned:false,createdAt:"2026-10-01",updatedAt:"2026-10-01"}]:[],locale,period:"last10",sections:minimal?{attendance:false,absenceReasons:false,availability:false,performance:false,developmentGoals:false,observations:false,playerNotes:false}:sections(long),selectedNoteIds:long?["note"]:[],selectedObservationIds:long?Array.from({length:8},(_,index)=>"observation-"+index):[],mode,configured:true,includePrivateTrainingNotes:false,playerCard:{squadName:"U15 Fictional",trialSummary:type==="trial"?{status:"active",currentEndDate:"2026-11-30",remainingTrainingCount:3}:undefined},readOnly:true,conversation:mode==="player_conversation"?{id:"conversation",conversationDate:"2026-10-10",strengths:long?longText:"Calm first touch and clear communication.",developmentFocus:long?longText:"Earlier scanning under pressure.",playerPerspective:long?longText:"I want to play forward more often.",coachSummary:long?longText:"Positive development in the review period.",agreedNextSteps:long?longText:"Review progress after four Trainings.",nextReviewOn:"2026-11-15"}:undefined});
      const renderReport=(id,type,long,mode,packMode=false,minimal=false)=>React.createElement(PlayerConversationReport,{...reportProps(id,type,long,mode,minimal),packMode});
      let content;
      if(variant==="bulk") content=React.createElement("div",{className:"report-pack mx-auto max-w-5xl space-y-5"},React.createElement("div",{className:"report-pack-item"},renderReport("one","roster",false,"internal_coach_report",true,true)),React.createElement("div",{className:"report-pack-item"},renderReport("two","trial",false,"player_conversation",true,true)));
      else content=renderReport("one",variant==="trial"?"trial":"roster",variant==="long",variant==="coach"?"internal_coach_report":"player_conversation",false,variant==="short");
      createRoot(document.getElementById("root")).render(React.createElement("div",{className:"app-shell-content lg:pl-[var(--app-sidebar-width)]",style:{"--app-sidebar-width":"18rem"}},React.createElement("main",{className:"app-main"},content)));
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
    name: "player-report-fixture",
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
  response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;

try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.COACHBOARD_QA_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  for (const locale of ["en", "de"]) {
    for (const variant of ["short", "coach", "trial", "long", "bulk"]) {
      await page.goto(`${base}?locale=${locale}&variant=${variant}`);
      await page.locator(".player-report-sheet").first().waitFor();
      await page.emulateMedia({ media: "print" });
      const geometry = await page.evaluate(() => {
        const shell = document.querySelector(".app-shell-content");
        const main = document.querySelector(".app-main");
        const sheet = document.querySelector(".player-report-sheet");
        const rect = sheet.getBoundingClientRect();
        return {
          shellPaddingLeft: getComputedStyle(shell).paddingLeft,
          mainPaddingLeft: getComputedStyle(main).paddingLeft,
          sheetLeft: rect.left,
          sheetRightGap: document.documentElement.clientWidth - rect.right,
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        };
      });
      assert.equal(geometry.shellPaddingLeft, "0px", `${locale}/${variant}: print removes the sidebar offset`);
      assert.equal(geometry.mainPaddingLeft, "0px", `${locale}/${variant}: print removes main padding`);
      assert.ok(Math.abs(geometry.sheetLeft - geometry.sheetRightGap) <= 1, `${locale}/${variant}: report content is horizontally balanced`);
      assert.equal(geometry.horizontalOverflow, false, `${locale}/${variant}: print layout has no horizontal clipping`);

      const pdf = await page.pdf({ path: `/private/tmp/coachboard-player-report-${locale}-${variant}.pdf`, format: "A4", printBackground: true, preferCSSPageSize: true });
      const pageCount = (pdf.toString("latin1").match(/\/Type \/Page(?!s)/g) ?? []).length;
      if (variant === "short") assert.equal(pageCount, 1, `${locale}/${variant}: compact report fits one A4 page`);
      if (variant === "coach" || variant === "trial") assert.ok(pageCount >= 1, `${locale}/${variant}: complete report produces a valid A4 document`);
      if (variant === "long") assert.ok(pageCount >= 2, `${locale}/${variant}: long content breaks across A4 pages`);
      if (variant === "bulk") assert.equal(pageCount, 2, `${locale}/${variant}: each Player occupies one page without blanks`);
      await page.emulateMedia({ media: "screen" });
    }
  }
  assert.deepEqual(errors, []);
  console.log("Player Report browser regression: PASS (EN/DE, individual/coach/trial/long/bulk, print geometry and A4 PDFs)");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
