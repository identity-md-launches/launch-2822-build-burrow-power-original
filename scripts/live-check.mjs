// Rendered browser check against the real public API: no fixtures or interception.
// scripts/integration-check.mjs supplies separate DOM-only evidence if browsers fail.
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { loadTool } from "./toolchain.mjs";
import { serveExport } from "./static-server.mjs";
const report = { at: new Date().toISOString(), runtime: "Playwright Chromium", intercepted: false, api: [], consoleErrors: [], games: [], result: "unperformed", limitations: [] };
let server, browser;
try {
  const module = await loadTool("playwright"), { chromium } = module.default ?? module;
  browser = await chromium.launch({ headless: true });
  server = await serveExport();
  await mkdir("test/scratch/live-check", { recursive: true });
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    page.on("pageerror", () => report.consoleErrors.push("Page JavaScript error"));
    page.on("response", async (response) => {
      if (!response.url().startsWith("https://api.squeekchain.com/")) return;
      try {
        const body = await response.json();
        report.api.push({ url: response.url(), httpStatus: response.status(), receivedAt: new Date().toISOString(), schemaVersion: body.schemaVersion, measurement: body.measurement ?? null, settledStatusRound: body.builder?.anchor?.settledThroughRound ?? null, safeBlockTimestamp: body.chain?.safeBlockTimestamp ?? null });
      } catch { /* Failed responses are not invented. */ }
    });
    await page.goto(server.url);
    await page.getByRole("button", { name: "Real wheel", exact: true }).click();
    await page.locator(".start-button:enabled").waitFor({ timeout: 20000 });
    const currentRound = await page.locator('[data-testid="current-round"]').innerText();
    assert.match(currentRound, /^\d+ · Sepolia$/);
    await page.locator(".start-button").click();
    for (let turn = 1; turn <= 6; turn++) {
      await page.locator(".response-choice:enabled").first().click();
      if (turn < 6) await page.locator(".next-button:enabled").click();
    }
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem("burrow-power:save:v2")));
    assert.equal(save.runs.live.status, "won");
    assert.equal(save.runs.live.completed, 6);
    const settlementsVerified = await page.locator(".settlements-ready").count() > 0;
    if (!settlementsVerified) {
      assert.equal(save.profiles.live.blueprints, 0);
      assert.deepEqual(save.watermarks, {});
      assert.match(await page.locator(".settlement-note").innerText(), /unlocks paused/);
    }
    report.games.push({ width, run: save.runs.live, currentRound, settlementsVerified, blueprints: save.profiles.live.blueprints, watermarkScopes: Object.keys(save.watermarks) });
    await page.screenshot({ path: `test/scratch/live-check/result-${width}.jpg`, type: "jpeg", quality: 80, fullPage: true });
    await page.close();
  }
  assert.deepEqual(report.consoleErrors, []);
  report.result = "passed";
} catch {
  report.result = browser ? "failed" : "unperformed";
  report.limitations.push(browser ? "The public API browser game did not complete; inspect the public observations before claiming verification." : "Chromium could not launch. No rendered public-API verification or screenshot is claimed. See separate production-bundle DOM evidence.");
  console.error(report.limitations[0]);
  process.exitCode = 1;
} finally {
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/live-validation.json", JSON.stringify(report, null, 2) + "\n");
  if (browser) await browser.close();
  if (server) await server.close();
}
