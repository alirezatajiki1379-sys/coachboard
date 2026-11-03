import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Uses the real UI with fictional persisted browser fixtures, not a live database.
export async function checkInlineRatings(page) {
  const card = (name = "Anna") => page.locator("article").filter({ hasText: `${name} Example` });
  const overall = () => card().getByRole("group", { name: "Overall rating", exact: true });
  const rating = (value) => overall().getByRole("button", { name: new RegExp(`^Overall rating ${value}(,|$)`) });
  const saved = async () => { await card().getByRole("status").filter({ hasText: "Rating saved." }).waitFor(); };
  const selected = async (value) => assert.equal(await rating(value).getAttribute("aria-pressed"), "true");
  const row = () => page.evaluate(() => window.qaRows[0]);
  const reload = async () => { await page.reload(); await overall().waitFor(); };
  await page.evaluate(() => window.qa.render("en", "open"));
  await card().getByRole("button", { name: "Present", exact: true }).click();
  await page.getByText("1 of 4 recorded", { exact: true }).waitFor();
  assert.equal(await overall().locator('[aria-pressed="true"]').count(), 0, "no default 3");
  await rating(4).click();
  await selected(4);
  assert.equal(await card("Bela").getByRole("button", { name: "Present", exact: true }).isEnabled(), true);
  await saved();
  assert.equal(await rating(4).evaluate((button) => document.activeElement === button), true, "rating focus survives save");
  await reload();
  await selected(4);
  await rating(5).click();
  const nextPlayerButton = card("Bela").getByRole("button", { name: "Present", exact: true });
  await nextPlayerButton.focus(); await saved();
  assert.equal(await nextPlayerButton.evaluate((button) => document.activeElement === button), true, "save must not steal focus from another player");
  await reload(); await selected(5);
  await rating(5).click(); await saved();
  assert.equal((await row()).overallRating, null);
  await rating(4).click(); await saved();
  await page.evaluate(() => { window.qaFail = true; });
  await rating(2).click();
  await selected(2);
  await card().getByRole("alert").waitFor();
  await selected(4);
  assert.equal((await row()).overallRating, 4);
  await page.evaluate(() => { window.qaFail = false; });

  await card().locator("summary").filter({ hasText: "Rating details" }).click();
  const categories = [["Technique", 3], ["Game understanding", 4], ["Intensity", 5], ["Behavior", 4]];
  for (const [label, value] of categories) await card().getByRole("group", { name: label, exact: true }).getByRole("button", { name: `${label} ${value}`, exact: true }).click();
  const note = "  Sehr mutig im 1v1.\nPrivate observation  ";
  await card().getByLabel("Coach note", { exact: true }).fill(note);
  await card().getByLabel("Sensitive note", { exact: true }).check();
  await page.evaluate(() => { window.qaFail = true; });
  await card().getByRole("button", { name: "Save details", exact: true }).click();
  await card().getByRole("alert").waitFor();
  assert.equal(await card().getByLabel("Coach note", { exact: true }).inputValue(), note);
  await page.evaluate(() => { window.qaFail = false; });
  await card().getByRole("button", { name: "Save details", exact: true }).click(); await saved();
  await selected(4);
  assert.equal((await row()).coachNote, note);
  assert.equal((await row()).sensitiveNote, true);
  await reload();
  await card().locator("summary").filter({ hasText: "Rating details" }).click();
  for (const [label, value] of categories) assert.equal(await card().getByRole("group", { name: label, exact: true }).locator('[aria-pressed="true"]').innerText(), String(value));
  assert.equal(await card().getByLabel("Coach note", { exact: true }).inputValue(), note);
  await rating(4).click(); await saved();
  await card().getByRole("button", { name: "Save details", exact: true }).click(); await saved();
  assert.equal((await row()).overallRating, null, "category suggestion must not create overall");
  await rating(4).click(); await saved();
  await page.evaluate(() => window.qa.render("en", "ratings"));
  await card().getByRole("group", { name: "Overall", exact: true }).waitFor();
  assert.equal(await card().getByRole("group", { name: "Overall", exact: true }).locator('[aria-pressed="true"]').innerText(), "4");
  await card().getByRole("group", { name: "Overall", exact: true }).getByRole("button", { name: "Overall 5", exact: true }).click();
  await card().getByRole("button", { name: "Save rating", exact: true }).click(); await saved();
  await page.evaluate(() => window.qa.render("en", "resume"));
  await selected(5);

  await card().getByRole("button", { name: "Absent", exact: true }).click();
  assert.equal(await overall().count(), 0);
  await card().getByLabel(/Reason/).selectOption("school");
  await card().getByRole("button", { name: "Save attendance details", exact: true }).click();
  await page.waitForFunction(() => window.qaRows[0].finalStatus === "absent");
  for (const key of ["overallRating", "ratingTechnique", "ratingGameUnderstanding", "ratingIntensity", "ratingBehavior", "ratingAutoSuggestion"]) assert.equal((await row())[key], null);
  await page.reload();
  assert.equal(await overall().count(), 0);
  await card().getByRole("button", { name: "Present", exact: true }).click();
  await page.waitForFunction(() => window.qaRows[0].finalStatus === "present");
  assert.equal(await overall().locator('[aria-pressed="true"]').count(), 0);
  for (const [status, minuteLabel, field] of [["Late", "Late minutes", "lateMinutes"], ["Left early", "Left after minute", "leftEarlyMinute"]]) {
    await card().getByRole("button", { name: status, exact: true }).click();
    await card().getByLabel(minuteLabel, { exact: true }).fill("12");
    if (status === "Left early") await card().getByLabel(/Reason/).selectOption("other");
    await card().getByRole("button", { name: "Save attendance details", exact: true }).click();
    await page.waitForFunction((key) => window.qaRows[0][key] === 12, field);
    if (await rating(3).getAttribute("aria-pressed") === "true") { await rating(3).click(); await saved(); }
    await rating(3).click(); await saved(); await reload(); await selected(3);
  }

  for (const locale of ["en", "de"]) {
    await page.evaluate((value) => window.qa.render(value, "complete"), locale);
    const label = locale === "de" ? "Gesamtbewertung" : "Overall rating";
    await card().getByRole("group", { name: label, exact: true }).waitFor();
    assert.equal(await card().getByRole("group", { name: label, exact: true }).locator('[aria-pressed="true"]').count(), 0);
    await page.getByText(locale === "de" ? "Anwesenheit vollständig erfasst" : "Attendance complete", { exact: true }).first().waitFor();
    const disclosure = card().locator("summary").filter({ hasText: locale === "de" ? "Bewertungsdetails" : "Rating details" });
    await disclosure.focus(); await page.keyboard.press("Enter");
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${locale}/${width}: overflow`);
      const boxes = await card().getByRole("group", { name: label, exact: true }).getByRole("button").evaluateAll((buttons) => buttons.map((button) => { const r = button.getBoundingClientRect(); return { y: r.y, height: r.height }; }));
      assert.equal(new Set(boxes.map((box) => box.y)).size, 1, "all five buttons on one row");
      assert.ok(boxes.every((box) => box.height >= 40));
      await page.screenshot({ path: `/private/tmp/check-in-2-1-${locale}-${width}.png`, fullPage: true });
    }
    if (locale === "de") {
      assert.equal(await card().getByLabel("Trainernotiz", { exact: true }).count(), 1);
      assert.equal(await card().getByRole("button", { name: "Details speichern", exact: true }).count(), 1);
    }
  }
  console.log("Check-in 2.1 browser: PASS (instant rating, rollback, details, reload, Ratings roundtrip, absent cleanup, late/left early, keyboard, EN/DE, 320/768/1440)");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = spawnSync(process.execPath, ["scripts/check-in-2-regression.mjs"], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}
