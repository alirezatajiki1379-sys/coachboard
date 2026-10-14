import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const routeSource = readFileSync(path.join(root, "app/(app)/squad/analysis/report/page.tsx"), "utf8");
assert.match(routeSource, /parseAnalyticsFilters\(params\)/, "report parses the same Analytics filters");
assert.match(routeSource, /getSquadAnalyticsOverview/, "report uses the canonical Analytics query");
assert.match(readFileSync(path.join(root, "app/globals.css"), "utf8"), /@page analytics-report\s*\{\s*size: A4 landscape;/, "report declares A4 landscape");

const qaRequire = createRequire(path.join(process.env.COACHBOARD_QA_DEPS ?? "/private/tmp/coachboard-stability-tests", "package.json"));
const { build } = qaRequire("esbuild");
const { chromium } = qaRequire("playwright");

const bundle = await build({
  stdin: {
    contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {TeamAnalyticsReport} from "@/components/squad/team-analytics-report";
      const params=new URLSearchParams(location.search);
      const locale=params.get("locale")==="de"?"de":"en";
      const mode=params.get("mode")||"combined";
      const summaries=Array.from({length:24},(_,index)=>({
        player:{id:"player-"+index,firstName:"Player",lastName:String(index+1).padStart(2,"0"),position:index%6===0?"Goalkeeper":"Central Midfielder"},
        expectedTrainings:5,attended:4,attendedWhenExpected:4,attendanceWhenExpectedRecorded:5,attendanceWhenExpectedRate:0.8,
        notExpectedTrainings:index%3===0?1:0,absentWhenExpected:1,late:index%5===0?1:0,leftEarly:index%7===0?1:0,
        ratingCompletedExpectedCount:4,ratingEligibleCount:5,ratingCoverageRate:0.8,rated:4,averageRating:3.75,latestFiveAverage:4,
        trend:{label:"Stable",value:0.2},reliabilityPenalty:0
      }));
      const event=(index)=>({event:{id:"event-"+index,date:"2026-10-"+String(index+1).padStart(2,"0"),label:"Training "+(index+1)},attendance:{attendanceWhenExpectedRate:0.9,attendedWhenExpected:18,expectedRecorded:20,ratingCoverageRate:0.85,ratingCompletedCount:17,ratingEligibleCount:20,averageOverallRating:3.8},review:index%2===0?{overallQuality:4}:undefined});
      const teamAnalytics={activeSquad:{id:"squad",name:"U15 Fictional"},trainingSessions:10,teamAttendanceWhenExpectedRate:0.944,attendedWhenExpectedCount:84,expectedRecordedCount:89,absenceWhenExpectedRate:0.056,absentWhenExpectedCount:5,dataCoverageRate:1,attendanceRecordCount:118,participantRecordCount:118,ratingCoverageRate:0.965,ratingCompletedCount:82,ratingEligibleCount:85,teamAverageOverallRating:3.7,totalRatedPerformances:85,events:Array.from({length:10},(_,index)=>event(index))};
      createRoot(document.getElementById("root")).render(React.createElement(TeamAnalyticsReport,{locale,mode,summaries,teamAnalytics,periodLabel:locale==="de"?"Letzte 10 Trainingseinheiten":"Last 10 trainings",filterLabel:locale==="de"?"Alle Kaderspieler":"All roster players",generatedAt:"2026-10-15T12:00:00Z"}));
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
    name: "analytics-report-fixture",
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => {
        if (!args.path.startsWith("@/")) return;
        const base = path.join(root, args.path.slice(2));
        return { path: [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) };
      });
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
  response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main style="padding:8px"><div id="root"></div></main><script src="/bundle.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;

try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.COACHBOARD_QA_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  for (const width of [320, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}?locale=de&mode=attendance`);
    await page.locator(".analytics-report-sheet").waitFor();
    assert.equal(await page.locator("[data-analytics-player]").count(), 24, `${width}px renders every Player exactly once`);
    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      offenders: [...document.querySelectorAll("*")].map((element) => {
        const rect = element.getBoundingClientRect();
        return { tag: element.tagName, className: element.className, left: rect.left, right: rect.right, width: rect.width };
      }).filter((item) => item.right > document.documentElement.clientWidth + 1 || item.left < -1).slice(0, 8)
    }));
    assert.equal(overflow.page, false, `${width}px has no page-level horizontal overflow: ${JSON.stringify(overflow.offenders)}`);
    assert.deepEqual(errors, [], `${width}px has no runtime errors`);
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1123, height: 794 } });
  for (const locale of ["en", "de"]) {
    for (const mode of ["attendance", "performance", "combined"]) {
      await page.goto(`${base}?locale=${locale}&mode=${mode}`);
      await page.locator(".analytics-report-sheet").waitFor();
      await page.emulateMedia({ media: "print" });
      const geometry = await page.evaluate(() => ({
        rows: document.querySelectorAll("[data-analytics-player]").length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        pageName: getComputedStyle(document.querySelector(".analytics-report-sheet")).page
      }));
      assert.equal(geometry.rows, 24, `${locale}/${mode} keeps all Player rows`);
      assert.equal(geometry.overflow, false, `${locale}/${mode} print preview has no horizontal clipping`);
      assert.equal(geometry.pageName, "analytics-report", `${locale}/${mode} uses the named landscape page`);
      const pdf = await page.pdf({ path: `/private/tmp/coachboard-analytics-${locale}-${mode}.pdf`, printBackground: true, preferCSSPageSize: true });
      const pdfText = pdf.toString("latin1");
      const pageCount = (pdfText.match(/\/Type \/Page(?!s)/g) ?? []).length;
      const mediaBox = pdfText.match(/\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*\]/);
      assert.ok(pageCount >= 1, `${locale}/${mode} creates a valid PDF`);
      assert.ok(pageCount <= 4, `${locale}/${mode} does not create unexpected blank pages`);
      assert.ok(mediaBox && Number(mediaBox[1]) > Number(mediaBox[2]), `${locale}/${mode} PDF pages are landscape`);
      await page.emulateMedia({ media: "screen" });
    }
  }
  await page.close();
  console.log("Team Analytics report browser regression: PASS (EN/DE, all modes, 24 Players, 320/768/1440px, A4 landscape PDFs)");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
