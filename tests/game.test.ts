import test from "node:test";
import assert from "node:assert/strict";
import {
  canAllocate,
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
  type System,
  type Values,
} from "../src/game";
function prepare(r: Run, gain = 0) {
  return creditTurn(r, gain, "test fixture", 0);
}
function solve(run: Run, gains: number[]): Run | null {
  if (run.status !== "playing") return run.status === "won" ? run : null;
  const ready = prepare(run, gains[run.turn - 1]);
  const choices: Values[] = [];
  for (let h = 0; h <= 2; h++)
    for (let w = 0; w <= 2; w++)
      for (let r = 0; r <= 2; r++)
        if (canAllocate(ready, { heat: h, water: w, repair: r }))
          choices.push({ heat: h, water: w, repair: r });
  choices.sort((a, b) => {
    const aa = preview(ready, a),
      bb = preview(ready, b);
    return Math.min(...Object.values(bb)) - Math.min(...Object.values(aa));
  });
  for (const choice of choices) {
    const next = playTurn(ready, choice);
    const result = solve(next, gains);
    if (result) return result;
  }
  return null;
}
test("power is credited exactly once per turn, including a serialized restore", () => {
  const run = prepare(newRun("live", 1), 4);
  assert.equal(run.power, 12);
  assert.equal(run.turnGain, 3);
  assert.deepEqual(
    creditTurn(JSON.parse(JSON.stringify(run)), 4, "later", 100000),
    run,
  );
});
test("allocation costs, per-room cap, turn cap, negative and fractional inputs are enforced", () => {
  const r = prepare(newRun("practice", 1));
  assert.equal(canAllocate(r, { heat: 2, water: 1, repair: 0 }), true);
  for (const a of [
    { heat: 3, water: 0, repair: 0 },
    { heat: 2, water: 2, repair: 0 },
    { heat: -1, water: 0, repair: 0 },
    { heat: 0.5, water: 0, repair: 0 },
  ])
    assert.equal(canAllocate(r, a), false);
  assert.throws(() => playTurn(r, { heat: 2, water: 2, repair: 0 }));
});
test("care applies before weather, never over 100; unspent power carries", () => {
  const r = prepare(
    { ...newRun("live", 1), systems: { heat: 96, water: 56, repair: 62 } },
    0,
  );
  const n = playTurn(r, { heat: 2, water: 0, repair: 0 });
  assert.equal(n.systems.heat, 85);
  assert.equal(n.power, 7);
  assert.equal(n.turn, 2);
  assert.equal(n.ready, false);
  assert.equal(n.history[0].spent, 2);
});
test("conditions below 30 add linked losses and change the next turn forecast", () => {
  const r = {
    ...newRun("live", 1),
    systems: { heat: 29, water: 29, repair: 29 },
  };
  assert.deepEqual(forecast(r).loss, { heat: 18, water: 12, repair: 11 });
  assert.equal(forecast(r).effects.length, 3);
});
test("an unfunded turn cannot be committed", () =>
  assert.throws(() =>
    playTurn(newRun("live", 1), { heat: 0, water: 0, repair: 0 }),
  ));
test("one system at zero immediately ends a shift; result cannot be played again", () => {
  const r = prepare({
    ...newRun("practice", 1),
    systems: { heat: 15, water: 80, repair: 80 },
  });
  const n = playTurn(r, { heat: 0, water: 0, repair: 0 });
  assert.equal(n.status, "lost");
  assert.equal(n.systems.heat, 0);
  assert.throws(() => playTurn(n, { heat: 1, water: 0, repair: 0 }));
});
test("all-idle level 1 can be won with only its 9-power reserve", () => {
  const n = solve(newRun("live", 1), [0, 0, 0, 0, 0, 0]);
  assert.ok(n);
  assert.equal(n.completed, 6);
  assert.equal(n.history.length, 6);
  assert.ok(n.history.every((h) => h.gained === 0));
  console.log(
    "idle level 1 playthrough",
    JSON.stringify(n.history.map((h) => h.allocation)),
    "score",
    score(n),
  );
});
test("deeper levels have stronger losses; all three are winnable at captured active power", () => {
  for (const level of [1, 2, 3] as const) {
    const n = solve(newRun("live", level), [4, 4, 4, 4, 4, 4]);
    assert.ok(n);
    assert.equal(n.status, "won");
  }
  assert.equal(
    forecast(newRun("live", 3)).loss.heat -
      forecast(newRun("live", 1)).loss.heat,
    4,
  );
});
test("installed upgrades reduce only their own loss and improve idle survival at depth", () => {
  const installed: System[] = ["heat", "water", "repair"];
  const plain = forecast(newRun("live", 3)),
    upgraded = forecast(newRun("live", 3, installed));
  for (const s of SYSTEMS) assert.equal(plain.loss[s] - upgraded.loss[s], 2);
  assert.ok(solve(newRun("live", 3, installed), [0, 0, 0, 0, 0, 0]));
});
test("neglect can lose a complete shift even with plenty of active wheel power", () => {
  let r = newRun("live", 1);
  while (r.status === "playing")
    r = playTurn(prepare(r, 4), { heat: 2, water: 0, repair: 0 });
  assert.equal(r.status, "lost");
  assert.ok(r.systems.water === 0 || r.systems.repair === 0);
});
test("score and level progression follow the documented formula", () => {
  const n = solve(newRun("practice", 1), [0, 0, 0, 0, 0, 0])!;
  assert.equal(
    score(n),
    600 +
      Object.values(n.systems).reduce((a, b) => a + b, 0) * 2 +
      n.power * 25 +
      100 +
      500,
  );
  const p = finishProfile(newProfile(), n);
  assert.equal(p.level, 2);
  assert.equal(p.wins, 1);
  assert.equal(p.best, score(n));
});
