import test from "node:test";
import assert from "node:assert/strict";
import { freshSave, openStorage, parseSave, persist } from "../src/storage";
import { creditTurn, newRun } from "../src/game";
test("a valid in-progress save roundtrips without refilling turn power", () => {
  const s = freshSave();
  s.runs.live = creditTurn(
    newRun("live", 1),
    4,
    "2026-11-01T12:00:00Z",
    100000,
  );
  assert.deepEqual(parseSave(JSON.stringify(s)), s);
});
test("practice progress and blueprint inventory are separate", () => {
  const s = freshSave();
  s.profiles.practice.level = 3;
  s.profiles.practice.blueprints = 8;
  assert.equal(s.profiles.live.level, 1);
  assert.equal(s.profiles.live.blueprints, 0);
});
test("corrupt, unsupported and oversized saves are rejected without throwing", () => {
  for (const raw of [
    "garbage",
    "null",
    "{}",
    JSON.stringify({ ...freshSave(), version: 3 }),
    " ".repeat(2000001),
  ])
    assert.equal(parseSave(raw), null);
  const s = freshSave();
  s.profiles.live.level = 99 as 1;
  assert.equal(parseSave(JSON.stringify(s)), null);
});
test("blocked browser storage does not prevent initialization or in-memory play", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("blocked");
    },
  });
  const loaded = openStorage();
  assert.equal(loaded.available, false);
  assert.equal(loaded.save.profiles.practice.blueprints, 1);
  assert.equal(persist(freshSave()), false);
  Reflect.deleteProperty(globalThis, "localStorage");
});

test("legacy profiles and settlement watermarks migrate without replaying old turns", () => {
  const save = freshSave();
  save.profiles.live.level = 3;
  save.profiles.live.blueprints = 4;
  save.profiles.live.installed = ["heat"];
  save.watermarks = {
    "test-fixture:deployment": {
      block: "10",
      log: "2",
      eventId: "fixture:settlement",
      round: "3",
    },
  };
  const old = { ...save, version: 1 };
  const memory = new Map([["burrow-power:save:v1", JSON.stringify(old)]]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    },
  });
  const loaded = openStorage();
  assert.deepEqual(loaded.save.profiles, save.profiles);
  assert.deepEqual(loaded.save.watermarks, save.watermarks);
  assert.equal(loaded.save.version, 2);
  assert.deepEqual(loaded.save.runs, { live: null, practice: null });
  assert.ok(memory.has("burrow-power:save:v1"));
  Reflect.deleteProperty(globalThis, "localStorage");
});
