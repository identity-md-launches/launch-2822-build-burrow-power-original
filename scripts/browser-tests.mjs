// Production-export tests. Intercepted API scenarios are explicitly labelled fixtures.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadTool, requireTool } from "./toolchain.mjs";
import { serveExport } from "./static-server.mjs";
const playwrightModule = await loadTool("playwright");
const { chromium, webkit } = playwrightModule.default ?? playwrightModule;
const AxeModule = requireTool("@axe-core/playwright");
const AxeBuilder = AxeModule.default ?? AxeModule;
const captured = JSON.parse(
  await readFile("tests/fixtures/published-api.json", "utf8"),
);
const out = "test/scratch/browser";
await mkdir(out, { recursive: true });
await mkdir("artifacts/screenshots", { recursive: true });
const server = await serveExport();
const report = {
  at: new Date().toISOString(),
  target: "production dist/ served under /preview/",
  checks: [],
  limitations: [],
  screenshots: [],
};
let failures = 0;
let aborted = false;
async function check(name, fn) {
  try {
    const detail = await fn();
    report.checks.push({ name, result: "passed", detail });
    console.log(`PASS ${name}`);
  } catch (e) {
    failures++;
    report.checks.push({ name, result: "failed", error: e.message });
    console.error(`FAIL ${name}: ${e.message}`);
  }
}
function bodies(state = "idle") {
  const status = structuredClone(captured.status.body),
    events = structuredClone(captured.events.body),
    now = new Date().toISOString();
  status.generatedAt = now;
  status.measurement.observedAt = now;
  status.measurement.receivedAt = now;
  status.measurement.coreStatus = state === "active" ? "ACTIVE" : "IDLE";
  status.measurement.rpmMilli = state === "active" ? 50000 : 0;
  events.generatedAt = now;
  events.chain.safeBlockTimestamp = now;
  if (state === "stale")
    status.measurement.observedAt = new Date(Date.now() - 121000).toISOString();
  if (state === "simulated") status.measurement.provenance = "simulated";
  return { status, events };
}
async function context(
  browser,
  width = 1440,
  scenario = "offline",
  extra = {},
) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 600 ? 844 : 1000 },
    ...extra,
  });
  if (scenario === "offline")
    await ctx.route("https://api.squeekchain.com/**", (r) => r.abort());
  else {
    const fixture = bodies(scenario);
    await ctx.route("https://api.squeekchain.com/**", (r) => {
      if (scenario === "rate")
        return r.fulfill({
          status: 429,
          headers: { "Retry-After": "60" },
          contentType: "application/json",
          body: '{"error":"rate_limited"}',
        });
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          r.request().url().includes("/v1/status")
            ? fixture.status
            : fixture.events,
        ),
      });
    });
  }
  const page = await ctx.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().startsWith(server.url) && r.status() >= 400)
      errors.push(
        `Local resource HTTP ${r.status()}: ${r.url().split("/preview/")[1]}`,
      );
  });
  await page.goto(server.url);
  return { ctx, page, errors };
}
async function capture(page, name, permanent = false) {
  const path =
    (permanent ? "artifacts/screenshots/" : out + "/") + name + ".jpg";
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path, fullPage: true, type: "jpeg", quality: 82 });
  if (permanent) report.screenshots.push(path);
}
const readSave = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("burrow-power:save:v2")));
async function finish(page, mode = "practice", strategy = "first") {
  let turns = 0;
  while (await page.locator(".response-choices").count()) {
    const before = await readSave(page);
    const button =
      strategy === "neglect"
        ? page.locator('[data-choice="salvage"]')
        : page.locator(".response-choice:enabled").first();
    await button.click();
    turns++;
    const saved = await readSave(page);
    assert.equal(saved.runs[mode].completed, before.runs[mode].completed + 1);
    assert.ok(await page.locator(".outcome-list,.score-display").count());
    if (await page.locator(".next-button").count())
      await page.locator(".next-button").click();
    if (turns > 6) throw new Error("Encounter loop exceeded six turns");
  }
  return (await readSave(page)).runs[mode];
}
async function tabTo(page, selector) {
  for (let i = 0; i < 60; i++) {
    if (
      await page
        .locator(selector)
        .evaluate((el) => el === document.activeElement)
    )
      return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab did not reach ${selector}`);
}
try {
  const browser = await chromium.launch({ headless: true });
  for (const width of [1440, 390])
    await check(
      `Chromium ${width}px: full three-hollow practice campaign`,
      async () => {
        const { ctx, page, errors } = await context(browser, width);
        const start = await page.locator(".start-button").boundingBox();
        if (width === 390)
          assert.ok(
            start.y + start.height <= 844,
            "Start action below the first screen",
          );
        assert.equal(await page.locator(".wheel-active").count(), 0);
        await capture(page, `home-${width}`, true);
        await page.locator(".start-button").click();
        const choice = await page
          .locator('[data-choice="protect"]')
          .boundingBox();
        if (width === 390)
          assert.ok(
            choice.y + choice.height <= 844,
            "First response is not fully visible",
          );
        await page.locator('[data-choice="protect"]').focus();
        assert.match(
          await page.locator(".room-status.system-heat .room-name").innerText(),
          /64 → 75/,
        );
        await capture(page, `encounter-${width}`, true);
        for (let level = 1; level <= 3; level++) {
          const run = await finish(page);
          assert.equal(run.status, "won");
          assert.equal(run.completed, 6);
          assert.equal(run.level, level);
          assert.equal((await readSave(page)).profiles.practice.wins, level);
          await capture(page, `win-level-${level}-${width}`, level === 3);
          if (level < 3)
            await page
              .getByRole("button", {
                name: "Explore the next hollow",
                exact: true,
              })
              .click();
        }
        assert.deepEqual(errors, []);
        await ctx.close();
        return {
          levels: 3,
          encounters: 18,
          scriptOrLocalResourceErrors: errors,
        };
      },
    );
  await check(
    "Keyboard: help, focus restoration and a full six-encounter win",
    async () => {
      const { ctx, page } = await context(browser, 390);
      await tabTo(page, ".nav-link");
      await page.keyboard.press("Enter");
      assert.ok(
        await page.locator("dialog.help-dialog").evaluate((e) => e.open),
      );
      await page.keyboard.press("Escape");
      assert.ok(
        await page
          .locator(".nav-link")
          .evaluate((e) => e === document.activeElement),
      );
      await tabTo(page, ".start-button");
      await page.keyboard.press("Enter");
      for (let turn = 1; turn <= 6; turn++) {
        const choice = await page
          .locator(".response-choice:enabled")
          .first()
          .getAttribute("data-choice");
        await tabTo(page, `[data-choice="${choice}"]`);
        await page.keyboard.press("Enter");
        if (turn < 6) {
          await tabTo(page, ".next-button");
          await page.keyboard.press("Enter");
        }
      }
      assert.equal((await readSave(page)).runs.practice.status, "won");
      await ctx.close();
      return "Tab and Enter complete the full primary flow; Escape restores help trigger focus.";
    },
  );
  await check(
    "Loss, restart confirmation, save restoration and mode separation",
    async () => {
      const { ctx, page } = await context(browser, 390);
      await page.locator(".start-button").click();
      await page
        .getByRole("button", { name: "Restart shift", exact: true })
        .click();
      assert.ok(await page.locator(".restart-dialog").evaluate((e) => e.open));
      await page.getByRole("button", { name: "Keep playing" }).click();
      assert.equal((await readSave(page)).runs.practice.completed, 0);
      await page.locator('[data-choice="salvage"]').click();
      await page.reload();
      assert.ok(await page.locator(".outcome-list").count());
      assert.equal((await readSave(page)).runs.practice.completed, 1);
      await page.locator(".next-button").click();
      const lost = await finish(page, "practice", "neglect");
      assert.equal(lost.status, "lost");
      assert.equal(lost.completed, 4);
      await capture(page, "loss-mobile", true);
      assert.equal((await readSave(page)).profiles.live.wins, 0);
      await page
        .getByRole("button", { name: "Play this hollow again" })
        .click();
      assert.equal((await readSave(page)).runs.practice.completed, 0);
      await ctx.close();
      return {
        lossEncounter: 4,
        restore: "resolved encounter preserved",
        replay: "new run",
      };
    },
  );
  await check(
    "An earlier-hollow shift survives reload and mode changes after later unlocks",
    async () => {
      const { ctx, page } = await context(browser, 390);
      await page.locator(".start-button").click();
      await page.locator('[data-choice="protect"]').click();
      await page.evaluate(() => {
        const key = "burrow-power:save:v2",
          save = JSON.parse(localStorage.getItem(key));
        save.profiles.practice.level = 3;
        localStorage.setItem(key, JSON.stringify(save));
      });
      await page.reload();
      await page.locator(".brand").click();
      await page
        .getByRole("button", { name: "Real wheel", exact: true })
        .click();
      await page.getByRole("button", { name: "Practice", exact: true }).click();
      await page
        .getByRole("button", { name: "Resume the shift", exact: true })
        .click();
      const run = (await readSave(page)).runs.practice;
      assert.equal(run.level, 1);
      assert.equal(run.completed, 1);
      assert.ok(await page.locator(".outcome-list").count());
      await ctx.close();
      return "One completed encounter in hollow 1 is retained even when the profile has unlocked hollow 3.";
    },
  );
  await check(
    "Fixture integration: fresh active hardware, actual power conversion, dedup and pause motion",
    async () => {
      const { ctx, page } = await context(browser, 1440, "active");
      await page
        .getByRole("button", { name: "Real wheel", exact: true })
        .click();
      await page.locator(".source-fresh").waitFor({ state: "attached" });
      await page.locator(".start-button:enabled").waitFor();
      await page.locator(".settlements-ready").waitFor();
      assert.equal((await readSave(page)).profiles.live.blueprints, 1);
      await page.locator(".source-details summary").click();
      await page.getByRole("button", { name: "Refresh official data" }).click();
      await page
        .getByRole("button", { name: "Refresh official data" })
        .waitFor();
      assert.equal((await readSave(page)).profiles.live.blueprints, 1);
      await page.locator(".start-button").click();
      assert.equal((await readSave(page)).runs.live.power, 11);
      assert.equal((await readSave(page)).runs.live.turnGain, 2);
      assert.equal(await page.locator(".wheel-active").count(), 1);
      assert.equal(
        await page
          .locator(".wheel-spokes")
          .evaluate((e) => getComputedStyle(e).animationName),
        "wheel-spin",
      );
      await page.getByRole("button", { name: "Pause wheel motion" }).click();
      assert.equal(await page.locator(".wheel-active").count(), 0);
      const r = await finish(page, "live");
      assert.equal(r.status, "won");
      assert.equal((await readSave(page)).profiles.practice.wins, 0);
      await page
        .getByRole("button", { name: "Return to burrow", exact: true })
        .click();
      await page.locator(".workshop summary").click();
      await page
        .getByRole("button", { name: "Install · 1 blueprint", exact: true })
        .first()
        .click();
      assert.deepEqual((await readSave(page)).profiles.live.installed, [
        "heat",
      ]);
      assert.equal((await readSave(page)).profiles.live.blueprints, 0);
      await ctx.close();
      return {
        source:
          "intercepted fresh hardware fixture; not a real activity observation",
        powerPerEncounter: 2,
        blueprintsCreditedOnce: 1,
        upgradeInstalled: "Moss blanket",
      };
    },
  );
  for (const state of ["idle", "stale", "simulated", "rate"])
    await check(`Fixture integration: ${state} state is honest`, async () => {
      const { ctx, page } = await context(browser, 390, state);
      await page
        .getByRole("button", { name: "Real wheel", exact: true })
        .click();
      if (state === "idle") {
        await page.locator(".start-button:enabled").waitFor();
        await page.locator(".start-button").click();
        assert.equal((await readSave(page)).runs.live.turnGain, 0);
        assert.equal(await page.locator(".wheel-active").count(), 0);
        const run = await finish(page, "live");
        assert.equal(run.status, "won");
      } else {
        await page.waitForFunction(
          () =>
            !document
              .querySelector(".mode-note")
              .textContent.includes("Checking official"),
        );
        assert.equal(await page.locator(".start-button").isDisabled(), true);
        assert.equal(await page.locator(".wheel-active").count(), 0);
        assert.match(
          await page.locator(".wheel-state").innerText(),
          /stale|unavailable|unsupported/i,
        );
        const text = await page.locator(".mode-note").innerText();
        assert.ok(
          state === "stale"
            ? /120 seconds/.test(text)
            : state === "simulated"
              ? /simulated/.test(text)
              : /429/.test(text),
        );
        await page
          .getByRole("button", { name: "Practice", exact: true })
          .click();
        await page.locator(".start-button").click();
        assert.equal(await page.locator(".response-choice").count(), 3);
      }
      await ctx.close();
      return `Intercepted ${state} fixture; no fixture is claimed as a real observed hardware event in this report.`;
    });
  await check(
    "Fixture integration: time passing pauses a prepared live turn without spending",
    async () => {
      const { ctx, page } = await context(browser, 390, "active");
      await page
        .getByRole("button", { name: "Real wheel", exact: true })
        .click();
      await page.locator(".start-button:enabled").waitFor();
      await page.locator(".start-button").click();
      const before = (await readSave(page)).runs.live;
      await page.clock.install();
      await page.clock.fastForward(121000);
      await page.locator(".live-pause").waitFor();
      const after = (await readSave(page)).runs.live;
      assert.equal(after.completed, before.completed);
      assert.equal(after.power, before.power);
      assert.equal(await page.locator(".response-choice:enabled").count(), 0);
      assert.equal(await page.locator(".wheel-active").count(), 0);
      await ctx.close();
      return "121 seconds simulated with the browser clock; prepared turn and bank unchanged.";
    },
  );
  await check("Blocked localStorage keeps practice playable", async () => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await ctx.addInitScript(() =>
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new Error("storage denied for test");
        },
      }),
    );
    await ctx.route("https://api.squeekchain.com/**", (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto(server.url);
    await page.locator(".start-button").click();
    await page.locator('[data-choice="protect"]').click();
    assert.equal(await page.locator(".outcome-list").count(), 1);
    assert.match(
      await page.locator(".warning-banner").innerText(),
      /Practice works/,
    );
    await ctx.close();
    return "In-memory practice works without claiming saved progress.";
  });
  await check(
    "Responsive, reduced motion and automated accessibility on home, encounter and result",
    async () => {
      const audits = [];
      for (const width of [320, 390, 768, 1440]) {
        const { ctx, page } = await context(browser, width, "active", {
          reducedMotion: "reduce",
        });
        const overflow = () =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth >
              document.documentElement.clientWidth,
          );
        assert.equal(await overflow(), false, `Home overflow ${width}`);
        if (width === 390)
          audits.push({
            state: "home",
            violations: (
              await new AxeBuilder({ page })
                .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
                .analyze()
            ).violations,
          });
        await page.locator(".start-button").click();
        assert.equal(await overflow(), false, `Encounter overflow ${width}`);
        if (width === 390)
          audits.push({
            state: "encounter",
            violations: (
              await new AxeBuilder({ page })
                .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
                .analyze()
            ).violations,
          });
        const run = await finish(page);
        assert.equal(run.status, "won");
        assert.equal(await overflow(), false, `Result overflow ${width}`);
        if (width === 390)
          audits.push({
            state: "result",
            violations: (
              await new AxeBuilder({ page })
                .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
                .analyze()
            ).violations,
          });
        await page
          .getByRole("button", { name: "Return to burrow", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Real wheel", exact: true })
          .click();
        await page.locator(".source-fresh").waitFor({ state: "attached" });
        assert.equal(
          await page
            .locator(".wheel-spokes")
            .evaluate((e) => getComputedStyle(e).animationName),
          "none",
        );
        await ctx.close();
      }
      await writeFile(out + "/axe.json", JSON.stringify(audits, null, 2));
      assert.equal(
        audits.reduce((n, a) => n + a.violations.length, 0),
        0,
        JSON.stringify(
          audits.map((a) => ({
            state: a.state,
            violations: a.violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => n.target),
            })),
          })),
        ),
      );
      return {
        viewports: [320, 390, 768, 1440],
        audits: audits.map((a) => ({
          state: a.state,
          violations: a.violations.length,
        })),
        activeWheelAnimationUnderReducedMotion: "none",
      };
    },
  );
  await browser.close();
  try {
    const safari = await webkit.launch({ headless: true });
    for (const width of [1440, 390])
      await check(`WebKit ${width}px: complete practice game`, async () => {
        const { ctx, page, errors } = await context(safari, width);
        await page.locator(".start-button").click();
        const run = await finish(page);
        assert.equal(run.status, "won");
        assert.deepEqual(errors, []);
        await ctx.close();
        return "Six encounters completed in WebKit.";
      });
    await safari.close();
  } catch {
    report.limitations.push(
      "WebKit could not launch because its native runtime dependencies were unavailable. No Safari/WebKit result is claimed.",
    );
    console.log("UNPERFORMED WebKit: browser runtime unavailable");
  }
} catch {
  aborted = true;
  report.limitations.push("Chromium could not launch or the suite aborted before completing. Rendered checks are unperformed; no pass is claimed.");
  console.error("UNPERFORMED: rendered interaction suite could not complete.");
} finally {
  report.result = aborted ? "unperformed" : failures ? "failed" : "passed";
  await writeFile(
    "artifacts/browser-validation.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await server.close();
}
if (failures || aborted) process.exitCode = 1;
