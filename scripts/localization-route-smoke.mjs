import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { localizationInventory } from "./localization-inventory.mjs";

// This unauthenticated check never submits forms or treats login redirects as page coverage.
const base = process.env.COACHBOARD_QA_URL ?? "http://127.0.0.1:3100";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Use a local test server.");
const qaRequire = createRequire(path.join(process.env.COACHBOARD_QA_DEPS ?? "/private/tmp/coachboard-stability-tests", "package.json"));
const { chromium } = qaRequire("playwright");
const routes = localizationInventory().routes;
const publicRoutes = new Set(["/login", "/signup", "/forgot-password", "/reset-password"]);
const results = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.COACHBOARD_QA_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
try {
  const context = await browser.newContext({ locale: "de-DE" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const locale of ["en", "de"]) {
    await context.addCookies([{ name: "coachboard_locale", value: locale, url: base }]);
    const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
    for (const { route } of routes) {
      const target = route.replaceAll("[id]", "00000000-0000-4000-8000-000000000001");
      const response = await page.goto(`${base}${target}`);
      assert.ok(response && response.status() < 400, `${locale} ${route}: HTTP ${response?.status()}`);
      const pathname = new URL(page.url()).pathname;
      if (publicRoutes.has(route)) {
        assert.equal(pathname, route);
        await page.waitForFunction((language) => document.documentElement.lang === language, locale);
        if (route === "/login") await page.getByRole("heading", { name: messages.auth.login.title, exact: true }).waitFor();
        if (route === "/signup") await page.getByRole("heading", { name: messages.auth.signup.title, exact: true }).waitFor();
        for (const width of [320, 360, 375, 390, 430, 768, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${locale} ${route}: overflow at ${width}`);
        }
        results.push({ route, locale, result: "PASS: public page loads; locale and responsive smoke", authenticated: false });
      } else {
        assert.equal(pathname, "/login", `${locale} ${route}: must protect unauthenticated access`);
        results.push({ route, locale, result: "WARNING: login redirect verified; signed-in UI not tested", authenticated: false });
      }
    }
  }
  assert.deepEqual(errors, []);
  writeFileSync("/private/tmp/coachboard-localization-routes.json", JSON.stringify(results, null, 2));
  console.log(`PASS: ${routes.length} route requests per locale; 4 public pages; protected redirects. Signed-in page content is NOT verified.`);
} finally {
  await browser.close();
}
