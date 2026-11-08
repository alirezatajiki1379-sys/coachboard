import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const qaRequire = createRequire(path.join(process.env.COACHBOARD_QA_DEPS ?? "/private/tmp/coachboard-stability-tests", "package.json"));
const { build } = qaRequire("esbuild");
const { chromium } = qaRequire("playwright");
const output = process.env.COACHBOARD_QA_OUTPUT ?? "/private/tmp/coachboard-drill-experience-2-screenshots";
mkdirSync(output, { recursive: true });

// Real presentation components and canvas renderer; navigation/auth writes are fixture boundaries.
const bundle = await build({
  stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState} from "react";
    import {createRoot} from "react-dom/client";
    import {I18nProvider} from "@/components/i18n/i18n-provider";
    import {DrillDetail} from "@/components/drills/drill-detail";
    import {DrillCard} from "@/components/drills/drill-card";
    import {DrillFilters} from "@/components/drills/drill-filters";
    import {createSystemTranslator} from "@/lib/i18n/system-text";
    const params=new URLSearchParams(location.search);
    const locale=params.get("locale")==="de"?"de":"en";
    const ui=createSystemTranslator(locale);
    window.qa={calls:[],ui};
    const graphic={version:1,pitch:"Full football pitch",pitchStyle:"Plain green",objects:[
      {id:"text",type:"text",x:310,y:230,rotation:0,color:"#ffffff",label:"Fictional drill"},
      {id:"line",type:"arrow",x:300,y:270,endX:500,endY:330,rotation:0,color:"#ffdd00",lineStyle:"solid",arrowHead:true}
    ]};
    const visual={source:"editor",graphic};
    const usage={drillId:"full",historicalUseCount:2,lastUsedAt:"2026-10-01",reviewedUseCount:1,averageEffectiveness:4,
      feedbackCounts:{worked_well:1,needs_adjustment:0,not_effective:0},teamBreakdown:[{teamId:"team",teamName:"Fictional Team",count:2}],
      history:[{instanceId:"instance",eventId:"event",date:"2026-10-01",trainingTitle:"Passing",teamName:"Fictional Team",trainingFocus:"Keep original focus",block:"Main part 1",durationMinutes:15,feedbackStatus:"worked_well",effectivenessRating:4,reviewNote:"Review note\\nNever translate this."}]};
    const drill={id:"full",userId:"fixture",title:"Passing",shortDescription:"Keep original description\\nSecond line",ageMode:"custom_range",ageGroups:[],minimumAge:7,maximumAge:12,
      mainFocus:"Passing",subFocus:"Keep original subfocus",trainingBlocks:["Main part 1"],drillType:"Technical drill",durationMinutes:15,minPlayers:4,maxPlayers:12,
      organization:"Organization first line\\nOrganization second line",coachingPoints:"Coaching first line\\nCoaching second line",variations:"Keep original variation",easierVersion:"Keep easier",harderVersion:"Keep harder",
      materials:[{type:"goals",quantity:2,color:"Red",variant:"normal goal",label:"Passing"},{type:"cones",quantity:8,color:"Blue"},{type:"balls",quantity:6,variant:"football"},{type:"bibs",quantity:6,color:"Yellow"},{type:"other",quantity:1,label:"Keep custom material"}],
      setupArea:{length:20,width:15,unit:"m"},setupParameters:[{id:"gap",label:"Width",value:7.5,unit:"m"}],setupNotes:"Keep setup notes",difficultyLevel:3,intensityLevel:4,
      sourcePublisher:"Keep publisher",sourceTitle:"Edit",sourcePage:"25",sourceReference:"Keep source reference",isFavorite:false,tags:["Passing","Keep tag"],status:"published",createdAt:"2026-01-01",updatedAt:"2026-10-01",visual,usage};
    function Fixture(){
      const [selected,setSelected]=useState(false);
      const [image,setImage]=useState(null);
      window.qa.upload=()=>setImage(document.querySelector("canvas").toDataURL());
      const simple=params.has("simple");
      const view=params.get("view")||"active";
      const long="SehrLangeBenutzerdefinierteMaterialbezeichnung".repeat(5);
      const item=simple?{...drill,organization:undefined,coachingPoints:undefined,variations:undefined,easierVersion:undefined,harderVersion:undefined,setupArea:undefined,setupParameters:[],setupNotes:undefined,materials:[],sourcePublisher:undefined,sourceTitle:undefined,sourcePage:undefined,sourceReference:undefined,tags:[]}:params.has("long")?{...drill,title:long,sourceReference:long,materials:[{type:"other",quantity:2,label:long}]}:drill;
      const evidence=simple?{...usage,historicalUseCount:0,lastUsedAt:undefined,reviewedUseCount:0,averageEffectiveness:undefined,history:[]}:usage;
      const chosenVisual=params.has("missing")?{...visual,source:"upload"}:image?{...visual,source:"upload",uploadedImageUrl:image}:simple?undefined:visual;
      return <I18nProvider locale={locale}><main className="mx-auto max-w-6xl space-y-6 p-3 sm:p-6">
        {location.pathname==="/drills"?<>
          <DrillFilters locale={locale} filters={{view,search:"",usage:"all",sort:"updated"}}/>
          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3"><DrillCard drill={{...item,status:view==="drafts"?"draft":"published"}} view={view} selectionMode selected={selected} onSelectionToggle={()=>setSelected(!selected)}/></div>
        </>:<DrillDetail drill={item} visual={chosenVisual} usage={evidence} locale={locale}/>}
      </main></I18nProvider>;
    }
    createRoot(document.getElementById("root")).render(<Fixture/>);
  ` },
  bundle: true, write: false, format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "fixture-boundaries", setup(builder) {
    builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "stub" }));
    builder.onResolve({ filter: /^@\/lib\/drills\/actions$/ }, () => ({ path: "actions", namespace: "stub" }));
    builder.onResolve({ filter: /^@\// }, ({ path: name }) => {
      const base = path.join(root, name.slice(2));
      return { path: [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) };
    });
    builder.onLoad({ filter: /.*/, namespace: "stub" }, ({ path: name }) => ({ resolveDir: root, loader: "tsx", contents: name === "link"
      ? 'import React from "react";export default function Link({href,children,...props}){const locale=new URLSearchParams(location.search).get("locale")||"en";return <a href={href+"?locale="+locale} {...props}>{children}</a>}'
      : `const done=(action,input)=>{window.qa.calls.push({action,id:input.get("drillId")});return {}};
         export async function toggleFavorite(input){return done("favorite",input)}
         export async function duplicateDrill(input){return done("duplicate",input)}
         export async function archiveDrill(input){return done("archive",input)}
         export async function restoreDrill(input){return done("restore",input)}
         export async function deleteDrill(_,input){return done("trash",input)}
         export async function permanentlyDeleteDrill(_,input){return done("permanent",input)}` }));
  } }]
});
const css = readdirSync(path.join(root, ".next/static/css")).filter((name) => name.endsWith(".css")).map((name) => readFileSync(path.join(root, ".next/static/css", name), "utf8")).join("\n");
const server = createServer((request, response) => {
  response.setHeader("Content-Type", request.url === "/bundle.js" ? "application/javascript" : "text/html");
  response.end(request.url === "/bundle.js" ? bundle.outputFiles[0].text : `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.COACHBOARD_QA_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const fits = async (context) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 ? [] : [...document.querySelectorAll("main *")].filter((element) => element.getBoundingClientRect().right > innerWidth + 1).map((element) => `${element.tagName}.${element.className}`).slice(0, 8));
    assert.deepEqual(overflow, [], context);
  };
  const translated = (source) => page.evaluate((value) => window.qa.ui(value), source);
  for (const locale of ["en", "de"]) {
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${base}/drills/full?locale=${locale}`);
      await page.locator("canvas").waitFor();
      const names = await page.locator("h2").allTextContents();
      const expected = await page.evaluate(() => ["Organization / Flow", "Coaching points", "Variations", "Easier version", "Harder version", "Setup", "Materials", "Usage", "Source", "Tags"].map(window.qa.ui));
      assert.deepEqual(names, expected, `detail hierarchy ${locale}`);
      assert.ok(await page.locator("canvas").evaluate((canvas) => canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data.some((value) => value !== 0)), "actual canvas renders pixels");
      assert.equal(await page.locator("h1").innerText(), "Passing", "user title not translated");
      const org = page.getByText("Organization first line", { exact: false });
      assert.equal(await org.textContent(), "Organization first line\nOrganization second line");
      assert.equal(await org.evaluate((element) => getComputedStyle(element).whiteSpace), "pre-wrap");
      assert.equal(await page.locator('dd[translate="no"]').filter({ hasText: /^Edit$/ }).count(), 1, "source title preserved");
      assert.equal(await page.locator('dt[translate="no"]').filter({ hasText: /^Width$/ }).count(), 1, "custom setup label preserved");
      await page.getByText(locale === "de" ? "7,5 m" : "7.5 m", { exact: true }).waitFor();
      const materialText = await page.locator("section").filter({ has: page.getByRole("heading", { name: await translated("Materials"), exact: true }) }).innerText();
      for (const value of ["2", await translated("Goals"), await translated("Red"), await translated("normal goal"), "Passing", "Keep custom material"]) assert.ok(materialText.includes(value), `structured material ${value}`);
      await fits(`detail fits ${width}px ${locale}`);
      await page.screenshot({ path: path.join(output, `detail-${locale}-${width}.png`), fullPage: true });
      await page.evaluate(() => window.qa.upload());
      await page.locator("img").waitFor();
      assert.ok(await page.locator("img").evaluate((image) => image.complete && image.naturalWidth > 0), "uploaded visual renders");
      await page.goto(`${base}/drills/full?locale=${locale}&simple=1`);
      await page.getByText(await translated("No feedback yet"), { exact: true }).waitFor();
      assert.deepEqual(await page.locator("h2").allTextContents(), [await translated("Usage")], "empty optional sections absent");
      assert.ok(!/0\s*\/\s*5|Not added yet/.test(await page.locator("main").innerText()), "no fake effectiveness/empty cards");
      await fits(`simple detail fits ${width}px ${locale}`);
      await page.goto(`${base}/drills/full?locale=${locale}&missing=1`);
      await page.getByText(locale === "de" ? "Bild nicht verfügbar" : "Image unavailable", { exact: true }).waitFor();
      await page.goto(`${base}/drills?locale=${locale}`);
      const card = page.locator("article");
      await card.waitFor();
      await card.getByRole("checkbox").check();
      assert.ok(page.url().includes("/drills?"), "checkbox does not navigate");
      await card.getByRole("button", { name: await translated("Add to favorites"), exact: true }).click();
      await card.getByRole("button", { name: await translated("Remove from favorites"), exact: true }).waitFor();
      await card.getByRole("button", { name: await translated("Duplicate"), exact: true }).click();
      await card.getByRole("button", { name: await translated("Archive"), exact: true }).click();
      await page.waitForFunction(() => window.qa.calls.length === 3);
      assert.deepEqual(await page.evaluate(() => window.qa.calls.map((call) => call.action)), ["favorite", "duplicate", "archive"]);
      page.once("dialog", (dialog) => dialog.dismiss());
      await card.getByRole("button", { name: await translated("Move to Trash"), exact: true }).click();
      assert.equal(await page.evaluate(() => window.qa.calls.length), 3, "cancel prevents delete");
      await card.locator("summary").click();
      await card.getByRole("button", { name: locale === "de" ? "+1 weitere" : "+1 more", exact: true }).click();
      await card.getByText(await translated("All materials"), { exact: true }).waitFor();
      await fits(`card and popover fit ${width}px ${locale}`);
      await page.keyboard.press("Escape");
      await page.screenshot({ path: path.join(output, `library-${locale}-${width}.png`), fullPage: true });
      const visual = card.locator('a[aria-label]');
      await visual.click();
      await page.waitForURL(`**/drills/full?locale=${locale}`);
      assert.equal(await page.locator('a[href^="/drills/full/print"]').count(), 1, "canonical print route retained");
      assert.equal(await page.locator('a[href^="/drills/full/edit"]').count(), 1, "canonical edit route retained");
      await page.goBack();
      await visual.focus();
      await page.keyboard.press("Enter");
      await page.waitForURL(`**/drills/full?locale=${locale}`);
      for (const route of ["/drills", "/drills/full"]) {
        await page.goto(`${base}${route}?locale=${locale}&long=1`);
        await page.locator(route === "/drills" ? "article" : "h1").waitFor();
        await fits(`long custom content fits ${route} ${width}px ${locale}`);
      }
      console.log(`PASS detail, simple, visuals, card actions, keyboard navigation, ${locale} ${width}px`);
    }
    for (const view of ["drafts", "archived", "trash"]) {
      await page.goto(`${base}/drills?locale=${locale}&view=${view}`);
      const card = page.locator("article");
      await card.waitFor();
      if (view === "drafts") await card.getByRole("link", { name: await translated("Continue editing"), exact: true }).waitFor();
      else await card.getByRole("button", { name: await translated("Restore"), exact: true }).click();
      if (view === "trash") {
        assert.equal(await card.locator('a[href*="/edit"]').count(), 0);
        await card.getByRole("button", { name: await translated("Delete permanently"), exact: true }).waitFor();
      }
    }
    await page.goto(`${base}/drills?locale=${locale}`);
    await page.locator('select[name="mainFocus"]').selectOption("Passing");
    await page.locator('select[name="drillType"]').selectOption("Technical drill");
    await page.locator('select[name="sort"]').selectOption("most_used");
    await page.locator('input[name="search"]').fill("fictional");
    await page.getByRole("button", { name: locale === "de" ? "Filtern" : "Filter", exact: true }).first().click();
    await page.waitForURL("**/*search=fictional*");
    const query = new URL(page.url()).searchParams;
    assert.equal(query.get("mainFocus"), "Passing");
    assert.equal(query.get("drillType"), "Technical drill");
    assert.equal(query.get("sort"), "most_used");
    assert.equal(query.get("view"), "active");
  }
  assert.deepEqual(errors, [], "no runtime errors");
  console.log(`Drill Experience 2.0 browser regression passed. Screenshots: ${output}`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
