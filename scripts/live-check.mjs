// This check does not intercept, rewrite, or replace any API response.
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { loadTool } from "./toolchain.mjs";
import { serveExport } from "./static-server.mjs";
const module = await loadTool("playwright"),
  { chromium } = module.default ?? module;
const server = await serveExport(),
  browser = await chromium.launch({ headless: true });
const out = "test/scratch/live-check";
await mkdir(out, { recursive: true });
const report = {
  at: new Date().toISOString(),
  intercepted: false,
  api: [],
  consoleErrors: [],
};
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => report.consoleErrors.push(e.message));
  page.on("response", async (response) => {
    if (response.url().startsWith("https://api.squeekchain.com/")) {
      try {
        const body = await response.json();
        report.api.push({
          url: response.url(),
          status: response.status(),
          body,
        });
      } catch {}
    }
  });
  await page.goto(server.url);
  await page.waitForFunction(
    () =>
      document.querySelector(".hero-actions button") &&
      !document.querySelector(".hero-actions button").disabled,
    {},
    { timeout: 20000 },
  );
  await page.screenshot({path: out + "/real-live-home.png", fullPage: true});
  await page.getByRole("button", { name: "Start shift", exact: true }).click();
  for (let turn = 1; turn <= 6; turn++) {
    await page.waitForFunction(
      () =>
        document.querySelector(".end-turn") &&
        !document.querySelector(".end-turn").disabled,
    );
    if (turn === 1) await page.screenshot({path: out + "/real-live-play.png", fullPage: true});
    // This known feasible reserve strategy spends three power in each of the first three turns.
    if (turn <= 3)
      for (const system of ["heat", "water", "repair"])
        await page
          .getByRole("button", { name: `Increase ${system}`, exact: true })
          .click();
    await page
      .getByRole("button", { name: `End turn ${turn}`, exact: true })
      .click();
  }
  await page.locator(".result.won").waitFor();
  const save = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("burrow-power:save:v1")),
  );
  assert.equal(save.runs.live.completed, 6);
  assert.ok(save.profiles.live.blueprints >= 1);
  assert.equal(Object.keys(save.watermarks).length, 1);
  report.run = save.runs.live;
  report.blueprints = save.profiles.live.blueprints;
  report.round = save.lastRound;
  report.result = "passed";
  await page.screenshot({
    path: out + "/real-live-result.png",
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      result: report.result,
      round: report.round,
      blueprints: report.blueprints,
      turnGains: report.run.history.map((h) => h.gained),
      observations: report.run.history.map((h) => h.observation),
    }),
  );
} catch (e) {
  report.result = "unperformed or failed";
  report.error = e.message;
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await writeFile(out + "/results.json", JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
