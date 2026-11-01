import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { loadTool } from "./toolchain.mjs";
import { serveExport } from "./static-server.mjs";
const playwright = await loadTool("playwright");
const { chromium, webkit } = playwright.default ?? playwright;
const { default: AxeBuilder } = await loadTool("@axe-core/playwright");
const captured = JSON.parse(
  await readFile("artifacts/api-observations.json", "utf8"),
);
const out = "test/scratch/browser-checks";
await mkdir(out, { recursive: true });
const results = [];
const errors = [];
const resources = [];
const server = await serveExport();
const key = "burrow-power:save:v1";
let browser;
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, passed: false, error: e.stack });
    console.error("FAIL", name, e.message);
  }
}
async function save(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
}
async function ready(page, mode = "live") {
  await page.waitForFunction(
    ({ key, mode }) => JSON.parse(localStorage.getItem(key))?.runs[mode]?.ready,
    { key, mode },
  );
}
async function createContext(
  engine,
  viewport,
  scenario = "active",
  extra = {},
) {
  const context = await engine.newContext({ viewport, ...extra });
  const state = { scenario };
  await context.route("https://api.squeekchain.com/**", async (route) => {
    const url = route.request().url();
    if (state.scenario === "outage") {
      await route.abort("failed");
      return;
    }
    if (state.scenario === "http503") {
      await route.fulfill({
        status: 503,
        headers: { "Retry-After": "1" },
        body: '{"error":"database_busy"}',
      });
      return;
    }
    let json;
    if (url.includes("/v1/status")) {
      json = structuredClone(captured.status);
      json.generatedAt = new Date().toISOString();
      json.measurement.observedAt = new Date().toISOString();
      json.measurement.receivedAt = new Date().toISOString();
      json.measurement.coreStatus =
        state.scenario === "idle" ? "IDLE" : "ACTIVE";
      json.measurement.rpmMilli = state.scenario === "idle" ? 0 : 77005;
      if (state.scenario === "stale")
        json.measurement.observedAt = new Date(
          Date.now() - 121000,
        ).toISOString();
      if (state.scenario === "schema") json.schemaVersion = 99;
      if (state.scenario === "malformed") json.measurement.rpmMilli = "fast";
      if (state.scenario === "simulated")
        json.measurement.provenance = "simulated";
    } else {
      json = structuredClone(captured.events);
      json.generatedAt = new Date().toISOString();
      json.chain.safeBlockTimestamp = new Date(
        Date.now() - 180000,
      ).toISOString();
      if (state.scenario === "events-stale")
        json.chain.safeBlockTimestamp = new Date(
          Date.now() - 601000,
        ).toISOString();
      if (state.scenario === "events-unavailable")
        json = {
          schemaVersion: 3,
          status: "unavailable",
          reason: "indexer_unavailable",
        };
      if (state.scenario === "events-schema") json.schemaVersion = 42;
      if (state.scenario === "duplicate")
        json.events.push(...structuredClone(json.events));
      if (state.scenario === "new-round") {
        const next = structuredClone(json.events.find((e) => e.type === "system.settlement_completed"));
        next.id += ":synthetic-test-next-round";
        next.source.blockNumber = (BigInt(next.source.blockNumber) + 1n).toString();
        next.payload.previousSettledThroughRound = next.payload.settledThroughRound;
        next.payload.settledThroughRound = (BigInt(next.payload.settledThroughRound) + 1n).toString();
        json.events.unshift(next);
      }
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(json),
    });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().startsWith(server.url) && r.status() >= 400)
      resources.push({ url: r.url(), status: r.status() });
  });
  await page.goto(server.url);
  await page.evaluate(() => document.fonts.ready);
  return { context, page, state };
}
async function refresh(page) {
  const details = page.locator(".source-details");
  if (!(await details.evaluate((e) => e.open)))
    await details.locator("summary").click();
  await details.getByRole("button", { name: "Refresh source" }).click();
  await page.waitForFunction(
    () => !document.querySelector(".source-content button")?.disabled,
  );
}
async function clickTurn(page, turn, mode = "live", allocate = true) {
  await ready(page, mode);
  if (allocate)
    for (const s of ["heat", "water", "repair"])
      await page
        .getByRole("button", { name: `Increase ${s}`, exact: true })
        .click();
  await page
    .getByRole("button", { name: `End turn ${turn}`, exact: true })
    .click();
}
try {
  browser = await chromium.launch({ headless: true });
  let current = await createContext(browser, { width: 1440, height: 1000 });
  let { page, state } = current;
  await test("Desktop first screen, live active state and Start shift", async () => {
    await page
      .getByRole("button", { name: "Start shift", exact: true })
      .waitFor({ state: "visible" });
    await page.waitForFunction(
      () => !document.querySelector(".hero-actions button").disabled,
    );
    assert.match(await page.locator(".live-title").innerText(), /turning/);
    assert.match(await page.locator(".power-indicator").innerText(), /\+4/);
    assert.ok(
      await page.locator(".observation-line time").getAttribute("datetime"),
    );
    const box = await page
      .getByRole("button", { name: "Start shift", exact: true })
      .boundingBox();
    assert.ok(box.y + box.height < 1000);
    await page.screenshot({ path: out + "/desktop-home.png", fullPage: true });
  });
  await test("Full six-turn desktop live game, allocation caps, score and result", async () => {
    await page
      .getByRole("button", { name: "Start shift", exact: true })
      .click();
    await ready(page);
    assert.equal((await save(page)).runs.live.power, 12);
    for (const s of ["heat", "water", "repair"])
      await page
        .getByRole("button", { name: `Increase ${s}`, exact: true })
        .click();
    assert.equal(
      await page
        .getByRole("button", { name: "Increase heat", exact: true })
        .isDisabled(),
      true,
    );
    await page
      .getByRole("button", { name: "Decrease heat", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.locator('output[aria-label="heat allocation"]').innerText(),
      "0",
    );
    await page
      .getByRole("button", { name: "Increase heat", exact: true })
      .focus();
    await page.keyboard.press("Space");
    await page.screenshot({ path: out + "/desktop-play.png", fullPage: true });
    await page.getByRole("button", { name: "End turn 1", exact: true }).click();
    for (let turn = 2; turn <= 6; turn++) await clickTurn(page, turn);
    await page.locator(".result.won").waitFor();
    const s = await save(page);
    assert.equal(s.runs.live.completed, 6);
    assert.equal(s.profiles.live.level, 2);
    assert.ok(s.profiles.live.best > 0);
    assert.equal(s.runs.live.history.length, 6);
    await page.screenshot({
      path: out + "/desktop-result.png",
      fullPage: true,
    });
  });
  await test("Safe round blueprints, installation and deeper level selection affect actual rules", async () => {
    assert.equal((await save(page)).profiles.live.blueprints, 1);
    await page
      .getByRole("button", { name: "Install · 1 blueprint", exact: true })
      .first()
      .click();
    assert.deepEqual((await save(page)).profiles.live.installed, ["heat"]);
    assert.equal((await save(page)).profiles.live.blueprints, 0);
    await page.locator("#level").selectOption("2");
    await page
      .getByRole("button", { name: "Play another shift", exact: true })
      .click();
    await ready(page);
    assert.equal((await save(page)).runs.live.level, 2);
    assert.match(
      await page.locator(".forecast-loss").innerText(),
      /−15 warmth/,
    );
  });
  await test("Refresh preserves turn, power, upgrades and processed confirmed events", async () => {
    await clickTurn(page, 1);
    await ready(page);
    const before = await save(page);
    await page.reload();
    await ready(page);
    const after = await save(page);
    assert.deepEqual(after.runs.live, before.runs.live);
    assert.equal(
      after.profiles.live.blueprints,
      before.profiles.live.blueprints,
    );
    assert.deepEqual(after.watermarks, before.watermarks);
  });
  await test("Duplicate round response does not re-credit after refresh or restart", async () => {
    const before = await save(page);
    state.scenario = "duplicate";
    await refresh(page);
    assert.equal(
      (await save(page)).profiles.live.blueprints,
      before.profiles.live.blueprints,
    );
    await page
      .getByRole("button", { name: "Restart shift", exact: true })
      .click();
    await page.getByRole("button", { name: "Keep playing" }).waitFor();
    await page.getByRole("button", { name: "Keep playing" }).click();
    assert.equal((await save(page)).runs.live.turn, 2);
    await page
      .getByRole("button", { name: "Restart shift", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Restart shift", exact: true })
      .click();
    await ready(page);
    assert.equal((await save(page)).runs.live.turn, 1);
    assert.deepEqual((await save(page)).watermarks, before.watermarks);
    assert.equal(
      (await save(page)).profiles.live.blueprints,
      before.profiles.live.blueprints,
    );
  });
  await test("Stale data pauses an existing live run and retry recovers without spending", async () => {
    state.scenario = "stale";
    const before = await save(page);
    await refresh(page);
    await page.locator(".error-panel").waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "End turn 1", exact: true })
        .isDisabled(),
      true,
    );
    assert.match(await page.locator(".error-panel").innerText(), /120 seconds/);
    assert.deepEqual((await save(page)).runs.live, before.runs.live);
    await page.screenshot({ path: out + "/desktop-stale.png", fullPage: true });
    state.scenario = "active";
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.locator(".error-panel").waitFor({ state: "hidden" });
    assert.equal(
      await page
        .getByRole("button", { name: "End turn 1", exact: true })
        .isEnabled(),
      true,
    );
  });
  await test("A new confirmed round unlocks one blueprint and repeated sync does not duplicate it", async () => {
    const before = await save(page);
    state.scenario = "new-round";
    await refresh(page);
    assert.equal((await save(page)).profiles.live.blueprints, before.profiles.live.blueprints + 1);
    await refresh(page);
    assert.equal((await save(page)).profiles.live.blueprints, before.profiles.live.blueprints + 1);
    state.scenario = "active";
  });
  await test("Keyboard skip link preserves the active game and puts focus on main", async () => {
    const before = await save(page);
    const link = page.getByRole("link", { name: "Skip to content", exact: true });
    await link.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "main");
    assert.equal(await page.locator(".end-turn").isVisible(), true);
    assert.deepEqual((await save(page)).runs.live, before.runs.live);
  });
  await test("A losing game reaches a clear result and can be restarted", async () => {
    for (let turn = 1; turn <= 6; turn++) {
      if ((await save(page)).runs.live.status !== "playing") break;
      await clickTurn(page, turn, "live", false);
    }
    await page.locator(".result.lost").waitFor();
    assert.match(
      await page.locator(".result-copy").innerText(),
      /reached zero/,
    );
    await page.screenshot({
      path: out + "/desktop-failure.png",
      fullPage: true,
    });
  });
  await test("Rules navigation, in-page anchors and game points disclosure", async () => {
    await page.getByRole("link", { name: "How to play", exact: true }).click();
    await page
      .getByRole("heading", { name: "A keeper’s field guide." })
      .waitFor();
    await page.getByRole("link", { name: "Wheel power", exact: true }).click();
    assert.equal(await page.locator(".rules-page").isVisible(), true);
    assert.match(await page.locator("#rules-power").innerText(), /25000/);
    assert.match(await page.locator("#rules-score").innerText(), /not SQK/);
    await page.screenshot({ path: out + "/desktop-rules.png", fullPage: true });
  });
  await test("Axe checks on rules and interactive Play have no serious/critical violations", async () => {
    for (const hash of ["#how-to-play", "#play"]) {
      await page.goto(server.url + hash);
      await page.locator("h1").waitFor();
      if (hash === "#play") {
        await page.getByRole("button", {name: "Play another shift", exact: true}).click();
        await ready(page);
      }
      const report = await new AxeBuilder({ page }).analyze();
      const problems = report.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact),
      );
      assert.deepEqual(
        problems.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        [],
      );
    }
  });
  await current.context.close();
  // Full mobile touch game with idle telemetry and only the reserve.
  current = await createContext(browser, { width: 390, height: 844 }, "idle", {
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  page = current.page;
  await test("390px first screen shows product and enabled primary action", async () => {
    await page.waitForFunction(
      () => !document.querySelector(".hero-actions button").disabled,
    );
    const box = await page
      .getByRole("button", { name: "Start shift", exact: true })
      .boundingBox();
    assert.ok(box.y + box.height <= 844);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: out + "/mobile-home.png", fullPage: true });
    await page.screenshot({ path: out + "/mobile-first-screen.png" });
  });
  await test("Full six-turn mobile touch game survives idle activity with no new power", async () => {
    await page.getByRole("button", { name: "Start shift", exact: true }).tap();
    await ready(page);
    assert.equal((await save(page)).runs.live.power, 9);
    await page.screenshot({ path: out + "/mobile-play.png", fullPage: true });
    for (let turn = 1; turn <= 6; turn++) {
      await ready(page);
      if (turn <= 3)
        for (const s of ["heat", "water", "repair"])
          await page
            .getByRole("button", { name: `Increase ${s}`, exact: true })
            .tap();
      await page
        .getByRole("button", { name: `End turn ${turn}`, exact: true })
        .tap();
    }
    await page.locator(".result.won").waitFor();
    const s = await save(page);
    assert.ok(s.runs.live.history.every((h) => h.gained === 0));
    assert.equal(s.runs.live.power, 0);
    await page.screenshot({ path: out + "/mobile-result.png", fullPage: true });
  });
  await test("Practice is labelled, separately saved, resumable and playable for six turns", async () => {
    await page.getByRole("button", { name: "Practice", exact: true }).tap();
    await page
      .getByRole("button", { name: "Start practice", exact: true })
      .tap();
    await ready(page, "practice");
    assert.match(
      await page.locator(".practice-banner").innerText(),
      /bundled fixture/,
    );
    await clickTurn(page, 1, "practice");
    await ready(page, "practice");
    const before = await save(page);
    await page.reload();
    await page.locator(".practice-banner").waitFor();
    await ready(page, "practice");
    assert.deepEqual((await save(page)).runs.practice, before.runs.practice);
    for (let turn = 2; turn <= 6; turn++)
      await clickTurn(page, turn, "practice");
    await page.locator(".result.won").waitFor();
    const s = await save(page);
    assert.equal(s.profiles.live.wins, 1);
    assert.equal(s.profiles.practice.wins, 1);
    assert.deepEqual(
      s.runs.practice.history.map((h) => h.rpmMilli),
      [95000, 77005, 0, 50000, 0, 111256],
    );
  });
  await test("Reflow at 320, 390, 720, 940 and 1440 on all pages", async () => {
    for (const width of [320, 390, 720, 940, 1440])
      for (const hash of ["#burrow", "#play", "#how-to-play"]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(server.url + hash);
        await page.locator("h1").waitFor();
        assert.equal(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth >
              document.documentElement.clientWidth,
          ),
          false,
          `${width} ${hash}`,
        );
      }
  });
  await test("Reduced motion has no running animations and loaded local font", async () => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(server.url);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(
      await page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.playState === "running")
            .length,
      ),
      0,
    );
    assert.equal(
      await page.evaluate(() => document.fonts.check("16px Manrope")),
      true,
    );
  });
  await current.context.close();
  for (const scenario of [
    "stale",
    "outage",
    "schema",
    "malformed",
    "simulated",
    "events-stale",
    "events-unavailable",
    "events-schema",
    "http503",
  ]) {
    await test(`${scenario}: live start pauses with explanation; practice remains playable`, async () => {
      const c = await createContext(
        browser,
        { width: 390, height: 844 },
        scenario,
      );
      try {
        await c.page.waitForFunction(
          () =>
            document.querySelector(".live-title strong")?.textContent ===
            "Live shifts paused",
        );
        assert.equal(
          await c.page
            .getByRole("button", { name: "Start shift", exact: true })
            .isDisabled(),
          true,
        );
        assert.ok(
          (await c.page.locator(".home-live p").first().innerText()).length >
            15,
        );
        await c.page
          .getByRole("button", { name: "Play practice", exact: true })
          .click();
        await ready(c.page, "practice");
        assert.equal(
          await c.page
            .getByRole("button", { name: "End turn 1", exact: true })
            .isEnabled(),
          true,
        );
      } finally {
        await c.context.close();
      }
    });
  }
  await test("Blocked localStorage opens safely and supports all six practice turns", async () => {
    const c = await createContext(
      browser,
      { width: 390, height: 844 },
      "active",
    );
    try {
      await c.context.addInitScript(() => {
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new DOMException("Blocked", "SecurityError");
          },
        });
      });
      await c.page.reload();
      await c.page.locator(".storage-warning").waitFor();
      await c.page
        .getByRole("button", { name: "Play practice", exact: true })
        .click();
      for (let turn = 1; turn <= 6; turn++) {
        await c.page
          .getByRole("button", { name: `End turn ${turn}`, exact: true })
          .waitFor();
        for (const s of ["heat", "water", "repair"])
          await c.page
            .getByRole("button", { name: `Increase ${s}`, exact: true })
            .click();
        await c.page
          .getByRole("button", { name: `End turn ${turn}`, exact: true })
          .click();
      }
      await c.page.locator(".result.won").waitFor();
    } finally {
      await c.context.close();
    }
  });
  await test("Corrupt local save recovers with a visible explanation", async () => {
    const c = await createContext(
      browser,
      { width: 390, height: 844 },
      "active",
    );
    try {
      // Finish the initial API sync before deliberately replacing its saved value.
      // Otherwise the initial response can legitimately save over this test setup.
      await c.page.waitForFunction(() => !document.querySelector(".hero-actions button")?.disabled);
      await c.page.evaluate(
        (key) => localStorage.setItem(key, "broken JSON"),
        key,
      );
      await c.page.reload();
      await c.page.waitForFunction(
        () => !document.querySelector(".hero-actions button").disabled,
      );
      await c.page
        .getByRole("button", { name: "Start shift", exact: true })
        .click();
      await ready(c.page);
      assert.match(
        await c.page.locator(".recovery-notice").innerText(),
        /unreadable local save/,
      );
    } finally {
      await c.context.close();
    }
  });
  await test("No uncaught JavaScript errors or missing local production assets", async () => {
    assert.deepEqual(errors, []);
    assert.deepEqual(resources, []);
  });
  await browser.close();
  browser = null;
  // WebKit is optional when the host cannot supply its native dependencies. Report exact outcome.
  try {
    const safari = await webkit.launch({ headless: true });
    await test("WebKit 390px complete practice shift", async () => {
      const c = await createContext(
        safari,
        { width: 390, height: 844 },
        "idle",
      );
      try {
        await c.page
          .getByRole("button", { name: "Play practice", exact: true })
          .click();
        for (let turn = 1; turn <= 6; turn++)
          await clickTurn(c.page, turn, "practice");
        await c.page.locator(".result.won").waitFor();
        await c.page.screenshot({
          path: out + "/webkit-mobile-result.png",
          fullPage: true,
        });
      } finally {
        await c.context.close();
      }
    });
    await safari.close();
  } catch (e) {
    results.push({
      name: "WebKit complete practice shift",
      passed: null,
      limitation: e.message,
    });
    console.log(
      "UNPERFORMED WebKit:",
      e.message.split("\n").slice(0, 5).join(" "),
    );
  }
} finally {
  if (browser) await browser.close();
  await server.close();
  await writeFile(
    out + "/results.json",
    JSON.stringify(
      { at: new Date().toISOString(), results, errors, resources },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      passed: results.filter((r) => r.passed === true).length,
      failed: results.filter((r) => r.passed === false).length,
      unperformed: results.filter((r) => r.passed === null).length,
    }),
  );
  if (results.some((r) => r.passed === false)) process.exitCode = 1;
}
