import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const qaRequire = createRequire(path.join(process.env.COACHBOARD_QA_DEPS ?? "/private/tmp/coachboard-stability-tests", "package.json"));
const { build } = qaRequire("esbuild");
const { chromium } = qaRequire("playwright");

const bundle = await build({
  stdin: {
    contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import {AnalyticsPrimarySummary,AttendanceAnalyticsSummary} from "@/components/squad/analytics-primary-summary";
      const params=new URLSearchParams(location.search);
      const locale=params.get("locale")==="de"?"de":"en";
      const incomplete=params.get("incomplete")==="1";
      const single=params.get("single")==="1";
      const analytics={
        trainingSessions:single?1:5,participantRecordCount:118,averageParticipantsPerTraining:17,
        teamAttendanceWhenExpectedRate:84/89,attendedWhenExpectedCount:84,expectedRecordedCount:89,
        teamAverageOverallRating:3.8,totalRatedPerformances:85,present:80,late:4,leftEarly:1,
        ratingEligibleCount:85,ratingCompletedCount:incomplete?82:85,ratingCoverageRate:incomplete?82/85:1,
        notRecorded:incomplete?2:0,dataCoverageRate:incomplete?116/118:1
      };
      createRoot(document.getElementById("root")).render(React.createElement(React.Fragment,null,
        React.createElement(AnalyticsPrimarySummary,{
          locale,analytics,filteredPlayerCount:24,playerType:"roster",position:"MF",
          periodLabel:locale==="de"?"01.09.–14.10.2026":"01 Sep–14 Oct 2026",singleTraining:single
        }),
        React.createElement(AttendanceAnalyticsSummary,{locale,analytics})
      ));
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
    name: "analytics-summary-fixture",
    setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next-link", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "jsx", resolveDir: root, contents: `import React from "react"; export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}` }));
      builder.onResolve({ filter: /^@\// }, (args) => {
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
  response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main style="padding:16px"><div id="root"></div></main><script src="/bundle.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;

try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.COACHBOARD_QA_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  for (const locale of ["de", "en"]) {
    for (const width of [320, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}?locale=${locale}`);
      await page.locator("[data-primary-kpis]").waitFor();
      assert.equal(await page.locator("[data-primary-kpi]").count(), 3, `${locale}/${width}px renders exactly three primary KPIs`);
      assert.equal(await page.locator("[data-attendance-metric]").count(), 3, `${locale}/${width}px renders exactly three Attendance metrics`);
      assert.equal(await page.locator("[data-data-status=complete]").count(), 1, `${locale}/${width}px shows compact complete status`);
      const columns = await page.locator("[data-primary-kpis]").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
      assert.equal(columns, width >= 768 ? 3 : 1, `${locale}/${width}px uses the expected KPI columns`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, `${locale}/${width}px has no page overflow`);
      assert.deepEqual(errors, [], `${locale}/${width}px has no runtime errors`);
      await page.close();
    }
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.goto(`${base}?locale=de&incomplete=1`);
  assert.equal(await page.locator("[data-data-status=incomplete]").count(), 1, "incomplete data links to Actions");
  assert.equal(await page.locator("[data-data-status=incomplete]").getAttribute("href"), "/actions");
  await page.goto(`${base}?locale=de&single=1`);
  assert.match(await page.locator("[data-primary-kpi]").first().innerText(), /85 Teilnehmer/, "single Training shows the actual participant count");
  await page.close();
  console.log("Analytics 2.1 summary browser regression: PASS (EN/DE, complete/incomplete/single Training, 320/768/1440px)");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
