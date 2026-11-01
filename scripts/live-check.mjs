// Real public API only: no routes, interception, rebased timestamps or fixtures.
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { loadTool } from "./toolchain.mjs";
import { serveExport } from "./static-server.mjs";
const module = await loadTool("playwright"),
  { chromium } = module.default ?? module;
const server = await serveExport(),
  browser = await chromium.launch({ headless: true });
await mkdir("test/scratch/live-check", { recursive: true });
const report = {
  at: new Date().toISOString(),
  intercepted: false,
  api: [],
  consoleErrors: [],
  games: [],
};
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 390 ? 844 : 1000 },
    });
    page.on("pageerror", (e) => report.consoleErrors.push(e.message));
    page.on("response", async (response) => {
      if (response.url().startsWith("https://api.squeekchain.com/")) {
        try {
          const body = await response.json();
          report.api.push({
            url: response.url(),
            httpStatus: response.status(),
            receivedAt: new Date().toISOString(),
            schemaVersion: body.schemaVersion,
            measurement: body.measurement ?? null,
            chain: body.chain ?? null,
            settlements:
              body.events
                ?.filter((e) => e.type === "system.settlement_completed")
                .map((e) => ({
                  id: e.id,
                  source: e.source,
                  payload: e.payload,
                })) ?? null,
          });
        } catch {
          /* The report does not invent a body for a failed read. */
        }
      }
    });
    await page.goto(server.url);
    await page.getByRole("button", { name: "Real wheel", exact: true }).click();
    await page.locator(".start-button:enabled").waitFor({ timeout: 20000 });
    await page.locator(".start-button").click();
    for (let turn = 1; turn <= 6; turn++) {
      await page.locator(".response-choice:enabled").first().click();
      if (turn < 6) await page.locator(".next-button:enabled").click();
    }
    const save = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("burrow-power:save:v2")),
    );
    assert.equal(save.runs.live.status, "won");
    assert.equal(save.runs.live.completed, 6);
    assert.ok(save.profiles.live.blueprints >= 1);
    assert.equal(Object.keys(save.watermarks).length, 1);
    report.games.push({
      width,
      run: save.runs.live,
      blueprints: save.profiles.live.blueprints,
      confirmedRound: save.lastRound,
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test/scratch/live-check/real-live-result-${width}.jpg`,
      type: "jpeg",
      quality: 80,
      fullPage: true,
    });
    console.log(
      JSON.stringify({
        width,
        result: "won",
        turnGains: save.runs.live.history.map((h) => h.gained),
        rooms: save.runs.live.systems,
        confirmedRound: save.lastRound,
      }),
    );
    await page.close();
  }
  assert.deepEqual(report.consoleErrors, []);
  report.result = "passed";
} catch (e) {
  report.result = "failed or unavailable";
  report.error = e.message;
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await writeFile(
    "artifacts/live-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await server.close();
}
