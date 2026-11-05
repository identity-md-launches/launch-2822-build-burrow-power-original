import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertFresh,
  consumeEvents,
  DataError,
  validateEvents,
  validateStatus,
  wheelPower,
} from "../src/api";
const captured = JSON.parse(
  readFileSync("tests/fixtures/published-api.json", "utf8"),
);
const now = Date.parse(captured.checkedAt);
const status = () => structuredClone(captured.status.body);
const events = () => structuredClone(captured.events.body);
const rejects = (fn: () => unknown, kind: string) =>
  assert.throws(fn, (e) => e instanceof DataError && e.kind === kind);
test("documented hardware schema is supported and idle generates exactly zero", () => {
  const s = validateStatus(status(), now);
  assert.equal(s.measurement.provenance, "hardware");
  assert.equal(wheelPower(s.measurement), 0);
});
test("active rate conversion covers calibrated real magnitude and exact boundaries", () => {
  for (const [rpmMilli, power] of [
    [0, 0],
    [1, 1],
    [25000, 1],
    [25001, 2],
    [50000, 2],
    [77005, 4],
    [111256, 4],
    [9007199254740991, 4],
  ])
    assert.equal(wheelPower({ coreStatus: "ACTIVE", rpmMilli }), power);
  assert.equal(wheelPower({ coreStatus: "IDLE", rpmMilli: 77005 }), 0);
});
test("stale flag, observation age and receipt age independently pause live play", () => {
  for (const mutate of [
    (x: any) => (x.measurement.freshness = "stale"),
    (x: any) =>
      (x.measurement.receivedAt = new Date(now - 120001).toISOString()),
    (x: any) =>
      (x.measurement.observedAt = new Date(now - 120001).toISOString()),
  ]) {
    const s = status();
    mutate(s);
    rejects(() => validateStatus(s, now), "stale");
  }
});
test("a fresh response generated timestamp cannot hide an old observation", () => {
  const s = status();
  s.generatedAt = new Date(now).toISOString();
  s.measurement.observedAt = "2020-01-01T00:00:00Z";
  rejects(() => validateStatus(s, now), "stale");
});
test("time passage after fetch is checked again before gameplay", () =>
  rejects(
    () => assertFresh(validateStatus(status(), now).measurement, now + 121000),
    "stale",
  ));
test("unsupported versions, invalid types and malformed unsigned counters fail closed", () => {
  for (const mutate of [
    (x: any) => (x.schemaVersion = 99),
    (x: any) => (x.measurement.rpmMilli = "77005"),
    (x: any) => (x.measurement.rpmMilli = -1),
    (x: any) =>
      (x.measurement.counterEpoch = "------------------------------------"),
    (x: any) => (x.measurement.cumulativeWorkUnits = "18446744073709551616"),
    (x: any) => (x.measurement.observedAt = "nonsense"),
  ]) {
    const s = status();
    mutate(s);
    rejects(() => validateStatus(s, now), "schema");
  }
});
test("null measurements, counter faults and non-hardware provenance cannot enter live mode", () => {
  for (const mutate of [
    (x: any) => (x.measurement = null),
    (x: any) => (x.measurement.provenance = "simulated"),
    (x: any) => (x.measurement.coreStatus = "COUNTER_FAULT"),
    (x: any) => (x.oracle.state = "blocked"),
  ]) {
    const s = status();
    mutate(s);
    rejects(() => validateStatus(s, now), "unavailable");
  }
});
test("unknown extra fields are harmless within a supported schema", () => {
  const s = status();
  s.extra = { future: true };
  s.measurement.extra = 1;
  assert.ok(validateStatus(s, now));
});
test("documented safe settlement has the supported fields; zero-work settlements still qualify", () => {
  const p = validateEvents(events(), now);
  assert.ok(p.events.length > 0);
  assert.ok(p.events.every((e) => e.source.confirmationStatus === "safe"));
  assert.ok(
    p.events.some(
      (e) =>
        e.payload.settledThroughRound !== e.payload.previousSettledThroughRound,
    ),
  );
});
test("first sync claims only latest safe round; duplicates, refresh and older history do not re-credit", () => {
  const p = validateEvents(events(), now),
    first = consumeEvents(p, {});
  assert.equal(first.added, 1);
  const again = consumeEvents(p, JSON.parse(JSON.stringify(first.watermarks)));
  assert.equal(again.added, 0);
  const duplicate = { ...p, events: [p.events[0], p.events[0]] };
  assert.equal(consumeEvents(duplicate, {}).added, 1);
});
test("new events are credited individually in chain order, with BigInt positions", () => {
  const p = validateEvents(events(), now),
    first = consumeEvents(p, {}),
    latest = first.last!;
  const next = structuredClone(latest);
  next.id += ":test-new";
  next.source.blockNumber = (
    BigInt(latest.source.blockNumber) + 10n
  ).toString();
  next.payload.previousSettledThroughRound = latest.payload.settledThroughRound;
  next.payload.settledThroughRound = (
    BigInt(latest.payload.settledThroughRound) + 1n
  ).toString();
  const second = consumeEvents(
    { ...p, events: [next, next, ...p.events] },
    first.watermarks,
  );
  assert.equal(second.added, 1);
  assert.equal(
    consumeEvents({ ...p, events: [next] }, second.watermarks).added,
    0,
  );
});
test("unsupported event schemas, event versions, unsafe confirmations and wrong identity pause settlement unlocks", () => {
  for (const mutate of [
    (x: any) => (x.schemaVersion = 1),
    (x: any) => (x.catalogVersion = "future"),
    (x: any) =>
      (x.events.find(
        (e: any) => e.type === "system.settlement_completed",
      ).eventVersion = 3),
    (x: any) =>
      (x.events.find(
        (e: any) => e.type === "system.settlement_completed",
      ).source.confirmationStatus = "pending"),
    (x: any) =>
      (x.identities.core = "0x1111111111111111111111111111111111111111"),
  ]) {
    const e = events();
    mutate(e);
    rejects(() => validateEvents(e, now), "schema");
  }
});
test("an HTTP-200 unavailable envelope is not an empty successful feed", () =>
  rejects(
    () =>
      validateEvents(
        {
          schemaVersion: 3,
          status: "unavailable",
          reason: "indexer_unavailable",
        },
        now,
      ),
    "unavailable",
  ));
test("a frozen safe block pauses even if generatedAt is current", () => {
  const e = events();
  e.chain.safeBlockTimestamp = new Date(now - 600001).toISOString();
  e.generatedAt = new Date(now).toISOString();
  rejects(() => validateEvents(e, now), "stale");
});
