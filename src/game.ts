export type Mode = "live" | "practice";
export type System = "heat" | "water" | "repair";
export type Levels = 1 | 2 | 3;
export type Values = Record<System, number>;
export const SYSTEMS: System[] = ["heat", "water", "repair"];
export const SYSTEM_NAMES = {
  heat: "Nest warmth",
  water: "Garden health",
  repair: "Tunnel stability",
};
export const GAINS: Values = { heat: 18, water: 16, repair: 17 };
export const RESERVE = 9;
export const CAPACITY = 12;
export const TURN_LIMIT = 3;
export const LEVEL_NAMES = [
  "The first burrow",
  "Deeper roots",
  "Under the bedrock",
];
export const UPGRADES = [
  {
    id: "heat",
    name: "Moss lining",
    level: 1,
    description: "Nest loses 2 less warmth each turn.",
  },
  {
    id: "water",
    name: "Rain cistern",
    level: 2,
    description: "Garden loses 2 less health each turn.",
  },
  {
    id: "repair",
    name: "Root braces",
    level: 3,
    description: "Tunnels lose 2 less stability each turn.",
  },
] as const;
export interface TurnLog {
  turn: number;
  allocation: Values;
  before: Values;
  after: Values;
  gained: number;
  spent: number;
  event: string;
  observation: string;
  rpmMilli: number;
}
export interface Run {
  mode: Mode;
  level: Levels;
  turn: number;
  completed: number;
  systems: Values;
  power: number;
  ready: boolean;
  turnGain: number;
  observation: string;
  rpmMilli: number;
  installed: System[];
  status: "playing" | "won" | "lost";
  history: TurnLog[];
}
export interface Profile {
  level: Levels;
  best: number;
  wins: number;
  blueprints: number;
  installed: System[];
}
export const blankAllocation = (): Values => ({ heat: 0, water: 0, repair: 0 });
export const newProfile = (): Profile => ({
  level: 1,
  best: 0,
  wins: 0,
  blueprints: 0,
  installed: [],
});
export function newRun(
  mode: Mode,
  level: Levels,
  installed: System[] = [],
): Run {
  return {
    mode,
    level,
    turn: 1,
    completed: 0,
    systems: { heat: 58, water: 56, repair: 62 },
    power: RESERVE,
    ready: false,
    turnGain: 0,
    observation: "",
    rpmMilli: 0,
    installed: [...installed],
    status: "playing",
    history: [],
  };
}
const WEATHER = [
  {
    name: "Cold front",
    target: "heat",
    extra: 5,
    description: "A cool draft reaches the nest.",
  },
  {
    name: "Thirsty roots",
    target: "water",
    extra: 5,
    description: "New shoots need a little more water.",
  },
  {
    name: "Loose soil",
    target: "repair",
    extra: 5,
    description: "The eastern tunnel is starting to settle.",
  },
  {
    name: "Night chill",
    target: "heat",
    extra: 6,
    description: "The soil above the nest is cooling.",
  },
  {
    name: "Dry spell",
    target: "water",
    extra: 6,
    description: "The garden is drying out.",
  },
  {
    name: "Last tremor",
    target: "repair",
    extra: 6,
    description: "One last rumble before morning.",
  },
] as const;
export function forecast(run: Run) {
  const weather = WEATHER[run.turn - 1];
  const depth = (run.level - 1) * 2;
  const loss: Values = {
    heat: 10 + depth,
    water: 9 + depth,
    repair: 8 + depth,
  };
  loss[weather.target] += weather.extra;
  for (const system of run.installed) loss[system] -= 2;
  const effects: string[] = [];
  if (run.systems.water < 30) {
    loss.heat += 3;
    effects.push("Dry garden: nest loses 3 extra warmth.");
  }
  if (run.systems.heat < 30) {
    loss.repair += 3;
    effects.push("Cold nest: tunnels lose 3 extra stability.");
  }
  if (run.systems.repair < 30) {
    loss.water += 3;
    effects.push("Weak tunnels: garden loses 3 extra health.");
  }
  return { ...weather, loss, effects };
}
export const totalAllocation = (v: Values) =>
  SYSTEMS.reduce((n, k) => n + v[k], 0);
export function canAllocate(run: Run, allocation: Values): boolean {
  return (
    SYSTEMS.every(
      (s) =>
        Number.isInteger(allocation[s]) &&
        allocation[s] >= 0 &&
        allocation[s] <= 2,
    ) && totalAllocation(allocation) <= Math.min(TURN_LIMIT, run.power)
  );
}
export function preview(run: Run, allocation: Values): Values {
  const { loss } = forecast(run);
  return Object.fromEntries(
    SYSTEMS.map((s) => [
      s,
      Math.max(
        0,
        Math.min(100, run.systems[s] + allocation[s] * GAINS[s]) - loss[s],
      ),
    ]),
  ) as Values;
}
export function creditTurn(
  run: Run,
  gain: number,
  observation: string,
  rpmMilli: number,
): Run {
  if (run.status !== "playing" || run.ready) return run;
  const power = Math.min(
    CAPACITY,
    run.power + Math.max(0, Math.min(4, Math.floor(gain))),
  );
  return {
    ...run,
    ready: true,
    power,
    turnGain: power - run.power,
    observation,
    rpmMilli,
  };
}
export function playTurn(run: Run, allocation: Values): Run {
  if (run.status !== "playing" || !run.ready || !canAllocate(run, allocation))
    throw new Error(
      "This turn is not ready, or the allocation exceeds its limits.",
    );
  const systems = preview(run, allocation);
  const viable = SYSTEMS.every((s) => systems[s] > 0);
  const won = viable && run.turn === 6;
  return {
    ...run,
    systems,
    power: run.power - totalAllocation(allocation),
    completed: run.turn,
    turn: viable && !won ? run.turn + 1 : run.turn,
    ready: false,
    status: !viable ? "lost" : won ? "won" : "playing",
    history: [
      ...run.history,
      {
        turn: run.turn,
        allocation: { ...allocation },
        before: { ...run.systems },
        after: systems,
        gained: run.turnGain,
        spent: totalAllocation(allocation),
        event: forecast(run).name,
        observation: run.observation,
        rpmMilli: run.rpmMilli,
      },
    ],
  };
}
export function score(run: Run): number {
  return (
    run.completed * 100 +
    SYSTEMS.reduce((n, s) => n + run.systems[s], 0) * 2 +
    run.power * 25 +
    run.level * 100 +
    (run.status === "won" ? 500 : 0)
  );
}
export function finishProfile(profile: Profile, run: Run): Profile {
  return {
    ...profile,
    best: Math.max(profile.best, score(run)),
    wins: profile.wins + (run.status === "won" ? 1 : 0),
    level:
      run.status === "won"
        ? (Math.max(profile.level, Math.min(3, run.level + 1)) as Levels)
        : profile.level,
  };
}
