// Executes the production bundle in a DOM emulator. This does NOT measure layout,
// browser accessibility, native dialogs, screenshots, or real browser networking.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadTool } from "./toolchain.mjs";
const { JSDOM, VirtualConsole } = process.env.BURROW_JSDOM
  ? await import(pathToFileURL(process.env.BURROW_JSDOM).href)
  : await loadTool("jsdom");
const html = await readFile("dist/index.html", "utf8");
const script = await readFile("dist/" + html.match(/<script[^>]*src="([^"]+)/)[1], "utf8");
const documented = JSON.parse(await readFile("tests/fixtures/published-api.json", "utf8"));
const observedEvents = JSON.parse(await readFile("tests/fixtures/api/events.json", "utf8"));
const KEY = "burrow-power:save:v2";
const report = {
  checkedAt: new Date().toISOString(),
  target: "unmodified production JavaScript from dist/index.html, DOM emulator at /preview/",
  runtime: "JSDOM 26.1.0, not a rendered browser",
  checks: [],
  publicApi: [],
  limitations: ["No rendered layout, screenshots, native keyboard/dialog semantics, contrast measurements or physical device checks are established by this suite."],
};
function bodies() {
  const status = structuredClone(documented.status.body), events = structuredClone(documented.events.body);
  const now = new Date().toISOString();
  status.generatedAt = status.measurement.observedAt = status.measurement.receivedAt = now;
  status.measurement.coreStatus = "IDLE";
  status.measurement.rpmMilli = 0;
  status.builder.anchor.settledThroughRound = "219";
  events.generatedAt = events.chain.safeBlockTimestamp = now;
  return { status, events };
}
function seed() {
  const profile = { level: 2, best: 1777, wins: 2, blueprints: 3, installed: [] };
  return {
    version: 2, activeMode: "live", revision: 8,
    profiles: { live: structuredClone(profile), practice: { ...profile, blueprints: 1 } },
    runs: { live: null, practice: null }, lastRound: "1300",
    watermarks: { "fixture:previous-installation": { block: "10", log: "2", eventId: "fixture:older-event", round: "1300" } },
  };
}
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
async function waitFor(fn, label, timeout = 5000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error(`Timed out: ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
  await new Promise((r) => setTimeout(r, 10));
}
async function mount(fetcher, initial = null) {
  const errors = [], timers = new Map();
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  vc.on("error", (e) => errors.push(String(e)));
  const dom = new JSDOM(html, { url: "https://burrow.test/preview/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.fetch = fetcher;
  w.AbortController = globalThis.AbortController;
  w.HTMLElement.prototype.scrollIntoView = () => {}; // Scroll behavior is unverified.
  let id = 0, offset = 0;
  w.setInterval = (fn, ms) => { timers.set(++id, { fn, ms }); return id; };
  w.clearInterval = (key) => timers.delete(key);
  const OriginalDate = w.Date;
  w.Date = class extends OriginalDate {
    constructor(...args) { super(...(args.length ? args : [Date.now() + offset])); }
    static now() { return Date.now() + offset; }
  };
  if (initial) w.localStorage.setItem(KEY, typeof initial === "string" ? initial : JSON.stringify(initial));
  w.eval(script);
  await waitFor(() => w.document.querySelector(".start-button"), "home rendered");
  const q = (selector) => w.document.querySelector(selector);
  const text = (selector) => q(selector)?.textContent ?? "";
  const button = (name) => [...w.document.querySelectorAll("button")].find((b) => b.textContent.trim() === name);
  const save = () => JSON.parse(w.localStorage.getItem(KEY));
  const click = async (el) => { assert.ok(el, "Control exists"); assert.ok(!el.disabled, `Control enabled: ${el.textContent}`); el.click(); await new Promise((r) => setTimeout(r, 20)); };
  return { w, q, text, button, save, click, errors, close: () => w.close(), advance: async (ms, tick = true) => {
    offset += ms;
    if (tick) for (const timer of timers.values()) if (timer.ms === 1000) timer.fn();
    await new Promise((r) => setTimeout(r, 20));
  } };
}
async function check(name, fn) {
  try { report.checks.push({ name, result: "passed", detail: await fn() }); console.log(`PASS ${name}`); }
  catch (e) { report.checks.push({ name, result: "failed", error: e.message }); console.error(`FAIL ${name}: ${e.message}`); }
}
async function startLive(app) {
  if (app.button("Real wheel")) await app.click(app.button("Real wheel"));
  await waitFor(() => app.q(".start-button") && !app.q(".start-button").disabled, "live start enabled");
  await app.click(app.q(".start-button"));
  assert.equal(app.q(".response-choices").children.length, 3);
}
async function finish(app, mode) {
  for (let turn = 1; turn <= 6; turn++) {
    await app.click(app.q(".response-choice:not(:disabled)"));
    assert.equal(app.save().runs[mode].completed, turn);
    if (turn < 6) await app.click(app.q(".next-button"));
  }
  assert.equal(app.save().runs[mode].status, "won");
}
await check("Unmodified public API: fresh IDLE/0 plays six encounters while schema-4 unlocks stay paused", async () => {
  const api = [];
  const app = await mount(async (url, options) => {
    const response = await fetch(url, options);
    const body = await response.clone().json();
    const evidence = { url, httpStatus: response.status, checkedAt: new Date().toISOString(), schemaVersion: body.schemaVersion };
    if (body.measurement) Object.assign(evidence, { measurement: body.measurement, settledRound: body.builder?.anchor?.settledThroughRound });
    else Object.assign(evidence, { catalogVersion: body.catalogVersion, hasIdentities: "identities" in body, hasDeployment: "deployment" in body, safeBlockTimestamp: body.chain?.safeBlockTimestamp });
    api.push(evidence);
    return response;
  }, seed());
  try {
    await waitFor(() => app.q(".source-fresh"), "fresh real wheel", 15000);
    await waitFor(() => app.text(".source-error").includes("version 4"), "actual unsupported event feed", 15000);
    const status = api.find((x) => x.measurement);
    assert.ok(status);
    assert.equal(status.measurement.provenance, "hardware");
    assert.equal(status.measurement.freshness, "online");
    assert.equal(status.measurement.coreStatus, "IDLE");
    assert.equal(status.measurement.rpmMilli, 0);
    assert.equal(app.text('[data-testid="current-round"]'), `${status.settledRound} · Sepolia`);
    assert.ok(!app.text('[data-testid="current-round"]').includes("1300"));
    assert.match(app.text('[data-testid="local-round"]'), /1300.*saved history/);
    assert.match(app.text(".wheel-state"), /resting/);
    assert.equal(app.q(".wheel-active"), null);
    await startLive(app);
    assert.equal(app.save().runs.live.turnGain, 0);
    await finish(app, "live");
    assert.deepEqual(app.save().watermarks, seed().watermarks);
    assert.equal(app.save().profiles.live.blueprints, 3);
    assert.deepEqual(app.errors, []);
    report.publicApi = api;
    return { intercepted: false, rebasedTimestamps: false, mode: "live", encounters: 6, result: "won", turnGains: app.save().runs.live.history.map((h) => h.gained), currentStatusRound: status.settledRound, localHistoricalRound: "1300", settlementUnlocks: "paused", watermarksUnchanged: true };
  } finally { report.publicApi = api; app.close(); }
});
await check("Fixture: a pending event response never delays a valid wheel or primary action", async () => {
  const b = bodies(); let resolveFeed;
  const app = await mount((url) => url.includes("/v1/status") ? Promise.resolve(json(b.status)) : new Promise((r) => { resolveFeed = r; }), seed());
  try {
    await waitFor(() => app.q(".source-fresh"), "independent status");
    await startLive(app);
    await app.click(app.q(".response-choice"));
    assert.equal(app.save().runs.live.completed, 1);
    resolveFeed(json(observedEvents));
    await waitFor(() => app.text(".source-error").includes("version 4"), "feed error");
    assert.match(app.text(".wheel-state"), /resting/);
    assert.deepEqual(app.save().watermarks, seed().watermarks);
    return "Status rendered and a turn completed before the event response resolved; later schema failure did not hide status.";
  } finally { app.close(); }
});
for (const kind of ["unsupported", "unavailable", "outage", "rate", "stale-events"]) await check(`Fixture: ${kind} events pause only new settlement unlocks`, async () => {
  const b = bodies();
  const events = kind === "unsupported" ? observedEvents : kind === "unavailable" ? { schemaVersion: 3, status: "unavailable", reason: "indexer_unavailable" } : b.events;
  if (kind === "stale-events") events.chain.safeBlockTimestamp = new Date(Date.now() - 601000).toISOString();
  const app = await mount(async (url) => url.includes("/v1/status") ? json(b.status) : kind === "outage" ? new Response("", { status: 500 }) : kind === "rate" ? json({}, 429, { "Retry-After": "60" }) : json(events), seed());
  try {
    await waitFor(() => app.text(".source-error").length > 0, "feed failure explained");
    await startLive(app);
    assert.equal(app.save().runs.live.turnGain, 0);
    await app.click(app.q(".response-choice"));
    assert.equal(app.save().runs.live.completed, 1);
    assert.equal(app.save().profiles.live.blueprints, 3);
    assert.deepEqual(app.save().watermarks, seed().watermarks);
    assert.match(app.text('[data-testid="current-round"]'), /^219/);
    assert.match(app.text('[data-testid="local-round"]'), /1300.*saved history/);
    await app.click(app.button("View feed error and retry"));
    assert.equal(app.q(".source-details").open, true);
    assert.equal(app.w.location.hash, "#play");
    assert.ok(app.q(".next-button"), "Disclosure does not exit the game");
    return { fixture: true, unchangedWatermarks: true, localBlueprints: 3, liveTurnsSpent: 1, currentRound: "219", historicalRound: "1300", sourceDisclosureWorks: true };
  } finally { app.close(); }
});
await check("Fixture: an event-only 503 cooldown permits a later status refresh", async () => {
  const b = bodies(); let statusRequests = 0, eventRequests = 0;
  const app = await mount(async (url) => { if (url.includes("/v1/status")) { statusRequests++; return json(b.status); } eventRequests++; return json({}, 503, { "Retry-After": "60" }); }, seed());
  try {
    await waitFor(() => app.text(".source-error").includes("503"), "busy indexer");
    await app.click(app.button("Refresh official data"));
    await waitFor(() => statusRequests === 2, "status re-requested independently");
    assert.equal(eventRequests, 1);
    assert.ok(app.q(".source-fresh"));
    return { statusRequests, eventRequests };
  } finally { app.close(); }
});
for (const state of ["stale", "simulated", "invalid-status"]) await check(`Fixture: ${state} wheel cannot enter live play; practice remains usable`, async () => {
  const b = bodies();
  if (state === "stale") b.status.measurement.observedAt = new Date(Date.now() - 121000).toISOString();
  if (state === "simulated") b.status.measurement.provenance = "simulated";
  if (state === "invalid-status") b.status.schemaVersion = 99;
  const app = await mount(async (url) => json(url.includes("/v1/status") ? b.status : b.events), seed());
  try {
    await waitFor(() => app.text(".mode-note").includes(state === "stale" ? "120 seconds" : state === "simulated" ? "simulated" : "version 1"), "wheel failure shown");
    assert.equal(app.q(".start-button").disabled, true);
    assert.equal(app.q(".source-fresh"), null);
    assert.equal(app.q(".wheel-active"), null);
    assert.equal(app.text('[data-testid="current-round"]'), "Not currently verified");
    await app.click(app.button("Practice"));
    await app.click(app.q(".start-button"));
    await finish(app, "practice");
    assert.deepEqual(app.save().watermarks, seed().watermarks);
    assert.equal(app.save().profiles.live.best, 1777);
    return "Live action disabled, historical round not current, practice completed all six encounters with separate progress.";
  } finally { app.close(); }
});
for (const tick of [true, false]) await check(`Fixture: 120-second expiry ${tick ? "updates the UI" : "is enforced at the action even before a tick"}`, async () => {
  const b = bodies();
  const app = await mount(async (url) => json(url.includes("/v1/status") ? b.status : observedEvents), seed());
  try {
    await startLive(app);
    const before = structuredClone(app.save().runs.live);
    await app.advance(121001, tick);
    if (tick) assert.equal(app.q(".response-choice").disabled, true);
    else { app.q(".response-choice").click(); await new Promise((r) => setTimeout(r, 20)); }
    assert.deepEqual(app.save().runs.live, before);
    assert.match(app.text(".live-pause"), /paused/);
    assert.equal(app.q(".wheel-active"), null);
    assert.equal(app.text('[data-testid="current-round"]'), "Not currently verified");
    assert.match(app.text(".source-details dl"), /Last seen; not live/);
    return { simulatedTimePassageMs: 121001, noTurnOrPowerSpent: true };
  } finally { app.close(); }
});
await check("Fixture: outage recovery catches up two pages, preserves old scopes and never recredits after retry or reload", async () => {
  const b = bodies(), e = structuredClone(b.events.events[0]);
  const scope = `${b.events.installationId}:${b.events.chain.chainId}:${b.events.identities.core.toLowerCase()}`;
  const initial = seed();
  initial.watermarks[scope] = { block: e.source.blockNumber, log: e.source.logIndex, eventId: e.id, round: e.payload.settledThroughRound };
  const newer = [1, 2].map((n) => ({ ...structuredClone(e), id: `fixture:recovery:${n}`, source: { ...e.source, blockNumber: String(BigInt(e.source.blockNumber) + BigInt(n)) }, payload: { previousSettledThroughRound: String(BigInt(e.payload.settledThroughRound) + BigInt(n) - 1n), settledThroughRound: String(BigInt(e.payload.settledThroughRound) + BigInt(n)) } }));
  let available = false;
  const fetcher = async (url) => url.includes("/v1/status") ? json(b.status) : !available ? json({ schemaVersion: 3, status: "unavailable", reason: "indexer_unavailable" }) : json({ ...b.events, events: url.includes("cursor=") ? [newer[0], e] : [newer[1], newer[0]], nextCursor: url.includes("cursor=") ? null : "fixture-history" });
  const app = await mount(fetcher, initial);
  let restored;
  try {
    await waitFor(() => app.text(".source-error").includes("indexer_unavailable"), "initial feed outage");
    assert.deepEqual(app.save().watermarks, initial.watermarks);
    available = true;
    await app.click(app.button("Retry settlement feed"));
    await waitFor(() => app.q(".settlements-ready"), "settlement recovery");
    assert.equal(app.save().profiles.live.blueprints, 5);
    assert.equal(app.save().watermarks[scope].eventId, newer[1].id);
    assert.deepEqual(app.save().watermarks["fixture:previous-installation"], initial.watermarks["fixture:previous-installation"]);
    await app.click(app.button("Retry settlement feed"));
    assert.equal(app.save().profiles.live.blueprints, 5);
    restored = JSON.stringify(app.save());
  } finally { app.close(); }
  const next = await mount(fetcher, restored);
  try {
    await waitFor(() => next.q(".settlements-ready"), "reloaded watermark verified");
    assert.equal(next.save().profiles.live.blueprints, 5);
    assert.equal(next.save().profiles.live.best, 1777);
    return { recoveredEvents: 2, blueprintIncrease: 2, retryIncrease: 0, reloadIncrease: 0, previousInstallationWatermarkPreserved: true };
  } finally { next.close(); }
});
await mkdir("artifacts", { recursive: true });
report.result = report.checks.every((c) => c.result === "passed") ? "passed" : "failed";
await writeFile("artifacts/interaction-validation.json", JSON.stringify(report, null, 2) + "\n");
console.log(`${report.checks.filter((c) => c.result === "passed").length}/${report.checks.length} DOM checks passed`);
if (report.result !== "passed") process.exitCode = 1;
