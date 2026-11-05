import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { consumeEvents, DataError, fetchSettlements, fetchWheel, validateEvents, validateStatus, validateStatusRound, type Settlement } from "../src/api";
const fixture = JSON.parse(readFileSync("tests/fixtures/published-api.json", "utf8"));
const observedStatus = JSON.parse(readFileSync("tests/fixtures/api/status.json", "utf8"));
const observedEvents = JSON.parse(readFileSync("tests/fixtures/api/events.json", "utf8"));
const observation = JSON.parse(readFileSync("tests/fixtures/api/status-request.json", "utf8"));
function status() {
  const s = structuredClone(fixture.status.body);
  s.generatedAt = s.measurement.receivedAt = s.measurement.observedAt = new Date().toISOString();
  s.measurement.rpmMilli = 0;
  s.measurement.coreStatus = "IDLE";
  return s;
}
function page() {
  const p = structuredClone(fixture.events.body);
  p.generatedAt = p.chain.safeBlockTimestamp = new Date().toISOString();
  return p;
}
function event(block: number, round: number): Settlement {
  const e = structuredClone(fixture.events.body.events[0]);
  e.id = `fixture:settlement:${block}:${round}`;
  e.source.blockNumber = String(block);
  e.payload.previousSettledThroughRound = String(round - 1);
  e.payload.settledThroughRound = String(round);
  return e;
}
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const failure = (kind: string, pattern?: RegExp) => (e: unknown) => e instanceof DataError && e.kind === kind && (!pattern || pattern.test(e.message));
test("unmodified captured public IDLE/0 status validates at its actual observation time", () => {
  const s = validateStatus(observedStatus, Date.parse(observation.checkedAt));
  assert.equal(s.schemaVersion, 1);
  assert.equal(s.measurement.coreStatus, "IDLE");
  assert.equal(s.measurement.rpmMilli, 0);
  assert.equal(validateStatusRound(s), observedStatus.builder.anchor.settledThroughRound);
});
test("live event envelope differs from published version and identity requirements", () => {
  const schema = JSON.parse(readFileSync("tests/fixtures/api/events-schema.json", "utf8"));
  assert.equal(schema.$defs.d3_available.properties.schemaVersion.const, 3);
  assert.equal(observedEvents.schemaVersion, 4);
  assert.equal(observedEvents.catalogVersion, "public-activity-v4");
  assert.ok(!("identities" in observedEvents));
  assert.ok("deployment" in observedEvents && "capabilities" in observedEvents);
  assert.throws(() => validateEvents(observedEvents), failure("schema", /version 4; expected 3/));
  // Merely relabelling v4 as v3 still fails: its envelope has changed too.
  assert.throws(() => validateEvents({ ...observedEvents, schemaVersion: 3 }), failure("schema", /envelope/));
});
test("settled-round display uses the validated builder frontier, including a lower new installation round", () => {
  const s = status();
  s.builder.anchor.settledThroughRound = "219";
  assert.equal(validateStatusRound(validateStatus(s)), "219");
  for (const invalid of ["219.0", "-1", 219, "18446744073709551616"]) {
    s.builder.anchor.settledThroughRound = invalid;
    assert.throws(() => validateStatusRound(s), failure("schema"));
    assert.ok(validateStatus(s)); // Display-data errors cannot hide the wheel.
  }
  s.builder = { status: "unavailable", reason: "oracle_head_unavailable" };
  assert.equal(validateStatusRound(s), null);
  assert.ok(validateStatus(s));
});
test("exactly 120 seconds is accepted, both older timestamps fail", () => {
  const s = status(), now = Date.now();
  s.measurement.receivedAt = s.measurement.observedAt = new Date(now - 120000).toISOString();
  assert.ok(validateStatus(s, now));
  assert.throws(() => validateStatus(s, now + 1), failure("stale"));
});
test("wheel fetching is successful despite an unsupported settlement request", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) => json(url.includes("/v1/status") ? status() : observedEvents));
  const wheel = await fetchWheel();
  assert.equal(wheel.status.measurement.rpmMilli, 0);
  await assert.rejects(fetchSettlements({}, wheel.status.installationId), failure("schema", /version 4/));
  assert.equal((await fetchWheel()).status.measurement.coreStatus, "IDLE");
});
test("invalid builder round becomes a separate display error, not a wheel failure", async (t) => {
  const s = status();
  s.builder.anchor.settledThroughRound = "invalid";
  t.mock.method(globalThis, "fetch", async () => json(s));
  const wheel = await fetchWheel();
  assert.equal(wheel.settledRound, null);
  assert.match(wheel.roundError!, /settled round/);
  assert.equal(wheel.status.measurement.rpmMilli, 0);
});
test("multi-page recovery is atomic, ordered and idempotent across saved watermarks", async (t) => {
  const first = page();
  first.events = [event(12015630, 348), event(12015625, 347)];
  first.nextCursor = "fixture-cursor";
  const next = { ...structuredClone(first), events: [event(12015625, 347), event(12015621, 346)], nextCursor: null };
  const seed = consumeEvents(validateEvents({ ...next, events: [event(12015621, 346)] }), {});
  const saved = structuredClone(seed.watermarks);
  let broken = true;
  t.mock.method(globalThis, "fetch", async (url: string) => json(url.includes("cursor=") ? broken ? { schemaVersion: 99 } : next : first));
  await assert.rejects(fetchSettlements(saved, first.installationId), failure("schema"));
  assert.deepEqual(saved, seed.watermarks);
  broken = false;
  const result = consumeEvents(await fetchSettlements(saved, first.installationId), saved);
  assert.equal(result.added, 2);
  assert.equal(result.last!.payload.settledThroughRound, "348");
  assert.equal(consumeEvents(await fetchSettlements(result.watermarks, first.installationId), result.watermarks).added, 0);
});
test("missing saved anchor, repeated cursors and changing frontiers never skip history", async (t) => {
  const p = page();
  const seed = consumeEvents(validateEvents({ ...p, events: [event(12015621, 346)] }), {});
  p.events = [event(12015630, 348)];
  t.mock.method(globalThis, "fetch", async () => json(p));
  await assert.rejects(fetchSettlements(seed.watermarks, p.installationId), failure("unavailable", /watermark/));
  p.nextCursor = "fixture-cycle";
  await assert.rejects(fetchSettlements(seed.watermarks, p.installationId), failure("schema", /repeated a cursor/));
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => json(++calls === 1 ? p : { ...p, chain: { ...p.chain, safeThroughBlock: "12015654" } }));
  await assert.rejects(fetchSettlements(seed.watermarks, p.installationId), failure("schema", /frontier changed/));
  assert.equal(seed.watermarks[Object.keys(seed.watermarks)[0]].round, "346");
});
test("wrong installations and regressing safe frontiers are rejected", async (t) => {
  const p = page();
  t.mock.method(globalThis, "fetch", async () => json(p));
  await assert.rejects(fetchSettlements({}, "fixture:other-installation"), failure("schema", /installations differ/));
  const seed = consumeEvents(validateEvents(p), {});
  p.chain.safeThroughBlock = "12015600";
  p.events = [];
  await assert.rejects(fetchSettlements(seed.watermarks, p.installationId), failure("stale", /behind the saved watermark/));
});
test("a save changed during a fetch cannot consume a page missing its new anchor", () => {
  const p = page();
  const initial = consumeEvents(validateEvents({ ...p, events: [event(12015621, 346)] }), {});
  const differentSave = consumeEvents(validateEvents({ ...p, events: [event(12015622, 347)] }), {});
  const firstSnapshot = validateEvents({ ...p, events: [event(12015630, 347), event(12015621, 346)] });
  assert.equal(consumeEvents(firstSnapshot, initial.watermarks).added, 1);
  assert.throws(() => consumeEvents(firstSnapshot, differentSave.watermarks), failure("unavailable", /watermark/));
  assert.equal(differentSave.watermarks[firstSnapshot.scope].round, "347");
});
test("an omitted intermediate settlement cannot be skipped even if the saved anchor is present", () => {
  const p = page();
  const initial = consumeEvents(validateEvents({ ...p, events: [event(12015621, 346)] }), {});
  const before = structuredClone(initial.watermarks);
  assert.throws(() => consumeEvents(validateEvents({ ...p, events: [event(12015630, 348), event(12015621, 346)] }), before), failure("unavailable", /gap/));
  assert.deepEqual(before, initial.watermarks);
});
test("an event-only Retry-After cooldown leaves status requests independent", async (t) => {
  let eventRequests = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("/v1/status")) return json(status());
    eventRequests++;
    return new Response("{}", { status: 429, headers: { "Retry-After": "60" } });
  });
  await assert.rejects(fetchSettlements({}, status().installationId), failure("rate"));
  await assert.rejects(fetchSettlements({}, status().installationId), failure("rate"));
  assert.equal(eventRequests, 1);
  assert.equal((await fetchWheel()).status.measurement.coreStatus, "IDLE");
});
