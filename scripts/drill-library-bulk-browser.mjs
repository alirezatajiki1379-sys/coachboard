import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const qaRoot = process.env.COACHBOARD_QA_DEPS ?? "/private/tmp/coachboard-stability-tests";
const qaRequire = createRequire(path.join(qaRoot, "package.json"));
const { build } = qaRequire("esbuild");
const { chromium } = qaRequire("playwright");

const actionsStub = `
  const done=(action,input)=>{window.qa.calls.push({action,input});return {ok:true,action,requestedCount:input.drillIds.length,affectedIds:input.drillIds,unchangedCount:0,failedIds:[]}};
  export const bulkArchiveDrills=input=>done("archive",input);
  export const bulkRestoreDrills=input=>done("restore",input);
  export const bulkSetDrillFavorite=input=>done(input.favorite?"favorite":"unfavorite",input);
  export const bulkUpdateDrillTags=input=>done(input.mode==="add"?"add_tags":"remove_tags",input);
  export const bulkMoveDrillsToTrash=input=>done("trash",input);
  export async function archiveDrill(){} export async function restoreDrill(){} export async function duplicateDrill(){}
  export async function deleteDrill(){return {}} export async function permanentlyDeleteDrill(){return {}} export async function toggleFavorite(){return {ok:true}}
`;

const bundle = await build({
  stdin: {
    contents: `
      import React,{useState} from "react";
      import {createRoot} from "react-dom/client";
      import {DrillLibraryBulkManager} from "@/components/drills/drill-library-bulk-manager";
      window.qa={calls:[],refreshes:0};
      const locale=new URLSearchParams(location.search).get("locale")==="de"?"de":"en";
      const drills=Array.from({length:120},(_,index)=>({
        id:"drill-"+index,userId:"user",title:"Fictional Drill "+(index+1),shortDescription:"Safe browser fixture",ageMode:"all_ages",ageGroups:[],mainFocus:"Passing",trainingBlocks:["Main part 1"],drillType:"Technical drill",durationMinutes:15,minPlayers:4,maxPlayers:12,materials:[],setupParameters:[],difficultyLevel:3,intensityLevel:3,isFavorite:index%2===0,tags:index%3===0?["Transition"]:["Passing"],status:"published",archivedAt:index===1?"2026-10-01T00:00:00Z":undefined,createdAt:"2026-01-01",updatedAt:"2026-10-01",usage:{drillId:"drill-"+index,historicalUseCount:0,reviewedUseCount:0,feedbackCounts:{worked_well:0,needs_adjustment:0,not_effective:0},history:[],teamBreakdown:[]}
      }));
      function Fixture(){const [filtered,setFiltered]=useState(false);return <main className="mx-auto max-w-[1800px] p-3"><button data-testid="change-filter" onClick={()=>setFiltered(value=>!value)}>Change fixture filter</button><DrillLibraryBulkManager drills={filtered?drills.slice(0,10):drills} view="active" locale={locale} libraryTags={["Passing","Transition","Finishing"]} emptyState={<p>Empty</p>}/></main>}
      createRoot(document.getElementById("root")).render(<Fixture/>);
    `,
    resolveDir: root,
    loader: "tsx"
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{
    name: "drill-bulk-browser-stubs",
    setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next-link", namespace: "stub" }));
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "next-navigation", namespace: "stub" }));
      builder.onResolve({ filter: /^@\/lib\/drills\/actions$/ }, () => ({ path: "drill-actions", namespace: "stub" }));
      builder.onResolve({ filter: /^@\/components\/drills\/drill-visual-preview$/ }, () => ({ path: "drill-preview", namespace: "stub" }));
      builder.onResolve({ filter: /^@\// }, (args) => {
        const base = path.join(root, args.path.slice(2));
        return { path: [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) };
      });
      builder.onLoad({ filter: /.*/, namespace: "stub" }, (args) => {
        if (args.path === "next-link") return { contents: 'import React from "react";export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}', loader: "tsx", resolveDir: root };
        if (args.path === "next-navigation") return { contents: 'export const useRouter=()=>({refresh(){window.qa.refreshes++}});', loader: "js", resolveDir: root };
        if (args.path === "drill-preview") return { contents: 'import React from "react";export function DrillVisualPreview({title}){return <div className="aspect-[16/9] bg-green-700 p-4 text-white">{title}</div>}', loader: "tsx", resolveDir: root };
        return { contents: actionsStub, loader: "js", resolveDir: root };
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
  response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

const baseUrl = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.COACHBOARD_QA_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const page = await browser.newPage();
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  for (const locale of ["en", "de"]) {
    for (const width of [375, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${baseUrl}?locale=${locale}`);
      const selectLabel = locale === "de" ? "Auswählen" : "Select";
      await page.getByRole("button", { name: selectLabel, exact: true }).click();
      await page.getByRole("checkbox", { name: locale === "de" ? "Alle sichtbaren auswählen" : "Select all visible" }).first().check();
      await page.getByText(locale === "de" ? "120 ausgewählt" : "120 selected", { exact: true }).first().waitFor();
      await page.getByTestId("change-filter").click();
      await page.getByText(locale === "de" ? "120 ausgewählt" : "120 selected", { exact: true }).first().waitFor();
      await page.getByTestId("change-filter").click();
      assert.ok(await page.locator("article").first().evaluate((card) => card.className.includes("ring-2")), "selected cards have visible state");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no horizontal overflow at ${width}px (${locale})`);

      await page.getByRole("button", { name: "Tags", exact: true }).click();
      const tagDialog = page.getByRole("dialog");
      await tagDialog.waitFor();
      const bounds = await tagDialog.locator(".app-dialog-panel").boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `tag dialog fits ${width}px`);
      await page.keyboard.press("Escape");
      await tagDialog.waitFor({ state: "detached" });

      await page.getByRole("button", { name: locale === "de" ? "Löschen" : "Delete", exact: true }).click();
      const deleteDialog = page.getByRole("dialog");
      await deleteDialog.waitFor();
      await deleteDialog.getByRole("button", { name: locale === "de" ? "Abbrechen" : "Cancel" }).click();
      await deleteDialog.waitFor({ state: "detached" });
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: selectLabel, exact: true }).waitFor();
    }
  }
  assert.deepEqual(runtimeErrors, [], "bulk selection fixture has no browser runtime errors");
  console.log("Drill Library bulk browser checks passed at 375, 430, 768 and 1440px in English and German.");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
