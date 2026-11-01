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
    JSON.stringify({ ...freshSave(), version: 2 }),
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
