import test from "node:test";
import assert from "node:assert/strict";
import {
  canChoose,
  creditTurn,
  finishProfile,
  forecast,
  newProfile,
  newRun,
  playTurn,
  preview,
  score,
  SYSTEMS,
  type Run,
  type Levels,
} from "../src/game";
function ready(r: Run, gain = 0) {
  return creditTurn(r, gain, "labelled test fixture", 0);
}
function solve(r: Run, gains: number[]): Run | null {
  if (r.status !== "playing") return r.status === "won" ? r : null;
  const current = ready(r, gains[r.turn - 1]);
  const choices = forecast(current).choices.filter((c) =>
    canChoose(current, c.id),
  );
  choices.sort(
    (a, b) =>
      Math.min(...Object.values(preview(current, b.id))) -
      Math.min(...Object.values(preview(current, a.id))),
  );
  for (const c of choices) {
    const won = solve(playTurn(current, c.id), gains);
    if (won) return won;
  }
  return null;
}
test("each level has six authored threats and three distinct responses", () => {
  for (const level of [1, 2, 3] as Levels[]) {
    const names = new Set();
    for (let turn = 1; turn <= 6; turn++) {
      const e = forecast({ ...newRun("practice", level), turn });
      names.add(e.name);
      assert.equal(e.choices.length, 3);
      assert.deepEqual(
        e.choices.map((c) => c.cost),
        [2, 1, 0],
      );
    }
    assert.equal(names.size, 6);
  }
});
test("reserve-only full games are winnable at all depths without upgrades", () => {
  for (const level of [1, 2, 3] as Levels[]) {
    const win = solve(newRun("live", level), [0, 0, 0, 0, 0, 0]);
    assert.ok(win);
    assert.equal(win.completed, 6);
    assert.ok(win.history.every((h) => h.gained === 0));
    console.log(
      JSON.stringify({
        scenario: "idle hardware",
        level,
        choices: win.history.map((h) => h.choice),
        rooms: win.systems,
        points: score(win),
      }),
    );
  }
});
test("designed practice is completable, including a simple protect-when-affordable strategy", () => {
  for (const level of [1, 2, 3] as Levels[]) {
    let r = newRun("practice", level);
    while (r.status === "playing") {
      r = ready(r, [0, 1, 0, 0, 1, 0][r.turn - 1]);
      r = playTurn(r, forecast(r).choices.find((c) => canChoose(r, c.id))!.id);
    }
    assert.equal(r.status, "won");
  }
});
test("neglect has a visible loss condition, even with an active wheel", () => {
  let r = newRun("live", 1);
  while (r.status === "playing") r = playTurn(ready(r, 4), "salvage");
  assert.equal(r.status, "lost");
  assert.equal(r.completed, 4);
  assert.equal(r.systems.heat, 0);
  assert.throws(() => playTurn(r, "protect"));
});
test("the first decision has exact previews and a meaningful tradeoff", () => {
  const r = ready(newRun("live", 1));
  assert.deepEqual(preview(r, "protect"), { heat: 75, water: 58, repair: 58 });
  assert.deepEqual(preview(r, "improvise"), {
    heat: 66,
    water: 50,
    repair: 58,
  });
  assert.deepEqual(preview(r, "salvage"), { heat: 37, water: 58, repair: 58 });
  const n = playTurn(r, "protect");
  assert.equal(n.power, 7);
  assert.deepEqual(n.systems, preview(r, "protect"));
  assert.equal(n.ready, false);
  assert.equal(n.turn, 2);
  assert.throws(() => playTurn(n, "protect"));
});
test("unfunded responses, unknown IDs and replays fail closed", () => {
  const r = { ...ready(newRun("practice", 1)), power: 0 };
  assert.equal(canChoose(r, "protect"), false);
  assert.equal(canChoose(r, "salvage"), true);
  assert.throws(() => playTurn(r, "protect"));
  assert.throws(() => playTurn(r, "unknown"));
  assert.throws(() => preview(r, "unknown"));
});
test("wheel power is credited once per prepared encounter, including serialized restores", () => {
  const r = ready(newRun("live", 1), 4);
  assert.equal(r.power, 13);
  assert.deepEqual(
    creditTurn(JSON.parse(JSON.stringify(r)), 4, "later", 100000),
    r,
  );
  assert.equal(ready({ ...newRun("live", 1), power: 15 }, 4).power, 16);
});
test("flooding and aftershocks are state-dependent and announced in the forecast", () => {
  const wet = {
    ...newRun("practice", 2),
    systems: { heat: 60, water: 39, repair: 60 },
  };
  assert.equal(forecast(wet).damage.repair, 13);
  assert.equal(forecast(wet).effects.length, 1);
  const shaken = {
    ...newRun("practice", 3),
    systems: { heat: 60, water: 60, repair: 39 },
  };
  for (const s of SYSTEMS)
    assert.equal(
      forecast(shaken).damage[s] - forecast(newRun("practice", 3)).damage[s],
      4,
    );
});
test("installed upgrades reduce their own damage without changing the other rooms", () => {
  const a = forecast(newRun("live", 1)),
    b = forecast(newRun("live", 1, ["heat"]));
  assert.equal(a.damage.heat - b.damage.heat, 3);
  assert.equal(a.damage.water, b.damage.water);
});
test("wins unlock levels; practice rewards cannot mint real wheel blueprints", () => {
  for (const mode of ["live", "practice"] as const) {
    const win = solve(newRun(mode, 1), [0, 0, 0, 0, 0, 0])!;
    const p = finishProfile(newProfile(), win);
    assert.equal(p.level, 2);
    assert.equal(p.wins, 1);
    assert.equal(p.blueprints, mode === "practice" ? 1 : 0);
    assert.equal(p.best, score(win));
  }
});

test("salvage previews and history report only the power that fits in the bank", () => {
  for (const [power, expected] of [
    [15, 1],
    [16, 0],
  ]) {
    const r = { ...ready(newRun("live", 1)), power };
    assert.equal(
      forecast(r).choices.find((c) => c.id === "salvage")!.salvage,
      expected,
    );
    const next = playTurn(r, "salvage");
    assert.equal(next.power, 16);
    assert.equal(next.history[0].salvaged, expected);
  }
});
