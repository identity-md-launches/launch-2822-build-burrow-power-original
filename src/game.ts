export type Mode = "live" | "practice";
export type System = "heat" | "water" | "repair";
export type Levels = 1 | 2 | 3;
export type Values = Record<System, number>;
export const SYSTEMS: System[] = ["heat", "water", "repair"];
export const SYSTEM_NAMES = {
  heat: "Nest",
  water: "Garden",
  repair: "Tunnels",
};
export const RESERVE = 9;
export const CAPACITY = 16;
export const LEVEL_NAMES = [
  "The first burrow",
  "The flooded hollow",
  "The faultline",
];
export const LEVEL_DESCRIPTIONS = [
  "A cold night. A small home. Learn to look after all three rooms.",
  "Water is rising. A garden below 40 also weakens the tunnels.",
  "The earth is moving. Tunnels below 40 put every room at risk.",
];
export const UPGRADES = [
  {
    id: "heat",
    name: "Moss blanket",
    level: 1,
    description: "Nest takes 3 less damage each encounter.",
  },
  {
    id: "water",
    name: "Rain catcher",
    level: 2,
    description: "Garden takes 3 less damage each encounter.",
  },
  {
    id: "repair",
    name: "Root braces",
    level: 3,
    description: "Tunnels take 3 less damage each encounter.",
  },
] as const;
export interface Choice {
  id: string;
  name: string;
  description: string;
  cost: number;
  care: Values;
  salvage: number;
  result: string;
}
export interface Encounter {
  name: string;
  description: string;
  target: System;
  hazard: "cold" | "dry" | "rocks" | "moths" | "flood" | "quake";
  damage: Values;
  choices: Choice[];
}
const zero = (): Values => ({ heat: 0, water: 0, repair: 0 });
function encounter(
  name: string,
  description: string,
  target: System,
  hazard: Encounter["hazard"],
  names: [string, string, string],
  results: [string, string, string],
): Encounter {
  const other = SYSTEMS[(SYSTEMS.indexOf(target) + 1) % 3];
  return {
    name,
    description,
    target,
    hazard,
    damage: {
      ...(Object.fromEntries(SYSTEMS.map((s) => [s, 6])) as Values),
      [target]: 27,
    },
    choices: [
      {
        id: "protect",
        name: names[0],
        description: `Protect the ${SYSTEM_NAMES[target].toLowerCase()}.`,
        cost: 2,
        care: { ...zero(), [target]: 38 },
        salvage: 0,
        result: results[0],
      },
      {
        id: "improvise",
        name: names[1],
        description: `A quick fix, at the ${SYSTEM_NAMES[other].toLowerCase()}’s expense.`,
        cost: 1,
        care: { ...zero(), [target]: 29, [other]: -8 },
        salvage: 0,
        result: results[1],
      },
      {
        id: "salvage",
        name: names[2],
        description: "Take the damage. Save 2 power for later.",
        cost: 0,
        care: zero(),
        salvage: 2,
        result: results[2],
      },
    ],
  };
}
const E = encounter;
const FIRST: Encounter[] = [
  E(
    "A chill in the nest",
    "A cold draft slips underground. Pip’s blanket won’t last the night.",
    "heat",
    "cold",
    ["Wrap the nest", "Burn garden roots", "Gather spare cells"],
    [
      "Snug as a burrow bug.",
      "A little warmth, a few fewer roots.",
      "Power saved. The chill gets through.",
    ],
  ),
  E(
    "Thirsty little sprouts",
    "The last drops have dried up. Those tiny leaves need a drink.",
    "water",
    "dry",
    ["Start the sprinkler", "Divert tunnel water", "Collect dry seeds"],
    [
      "Every sprout gets a sip.",
      "The garden drinks. The tunnels soften.",
      "Seeds tucked away. Leaves still thirsty.",
    ],
  ),
  E(
    "Pebbles from above",
    "The ceiling is shedding stones. Shore it up before the next rumble.",
    "repair",
    "rocks",
    ["Brace the ceiling", "Borrow nest beams", "Scavenge the rubble"],
    [
      "That ceiling isn’t going anywhere.",
      "The tunnel holds. The nest feels the draft.",
      "Useful scraps, but a weaker ceiling.",
    ],
  ),
  E(
    "Uninvited night moths",
    "Moths are nibbling at the nest lining. Pip would prefer a quieter roommate.",
    "heat",
    "moths",
    ["Light the moth lamp", "Make a leaf decoy", "Save the lamp’s power"],
    [
      "Moths out. Cosiness restored.",
      "The leaves lure them away.",
      "The moths get their midnight snack.",
    ],
  ),
  E(
    "Water at the roots",
    "A trickle becomes a puddle. The garden needs drainage, fast.",
    "water",
    "flood",
    ["Pump out the garden", "Dig a tunnel drain", "Bottle spare power"],
    [
      "Roots can breathe again.",
      "Water drained into the tunnel floor.",
      "Power banked. Roots under water.",
    ],
  ),
  E(
    "One last rumble",
    "Dawn is close. One more tremor stands between this burrow and morning.",
    "repair",
    "quake",
    ["Anchor the tunnels", "Use the nest frame", "Ride out the tremor"],
    [
      "The burrow holds. Hello, morning.",
      "The nest frame takes the strain.",
      "A rough landing for the little home.",
    ],
  ),
];
const FLOOD: Encounter[] = [
  E(
    "The seep is rising",
    "Groundwater reaches the seedlings. Keep the roots above the waterline.",
    "water",
    "flood",
    ["Run the sump pump", "Open a side drain", "Gather floating cells"],
    [
      "Waterline falling. Leaves lifting.",
      "A drain saves the roots, but wets the tunnels.",
      "Cells recovered. The garden floods.",
    ],
  ),
  E(
    "A soggy sleeping bag",
    "Water has soaked the bedding. Pip needs somewhere warm and dry.",
    "heat",
    "cold",
    ["Dry the moss bed", "Burn fallen leaves", "Rescue spare cells"],
    [
      "A warm, dry place for small paws.",
      "Dry bedding costs the garden a few leaves.",
      "Cells saved. Bedding still soaked.",
    ],
  ),
  E(
    "The western washout",
    "A stream is eating the tunnel wall. Hold the earth together.",
    "repair",
    "rocks",
    ["Build a retaining wall", "Use the bed frame", "Catch drifting cells"],
    [
      "The stream meets its match.",
      "The frame holds the wall.",
      "Power caught. More earth slips away.",
    ],
  ),
  E(
    "Roots underwater",
    "The water returns, deeper this time. The garden needs room to breathe.",
    "water",
    "flood",
    ["Raise the planter", "Drain into the tunnel", "Salvage the lantern"],
    [
      "A little island of green.",
      "Roots drain. Tunnel supports soften.",
      "Lantern saved. The garden struggles.",
    ],
  ),
  E(
    "Mist through the moss",
    "Even underground, the mist finds a way. Seal the nest before it chills.",
    "heat",
    "cold",
    ["Seal the warm chamber", "Pack it with leaves", "Save the heater cell"],
    [
      "Mist outside. Warmth inside.",
      "Leaves patch the nest.",
      "A colder room, a fuller battery.",
    ],
  ),
  E(
    "The bank gives way",
    "The flood loosens the final support. Make this last repair count.",
    "repair",
    "quake",
    ["Drive in root anchors", "Repurpose nest beams", "Weather the collapse"],
    [
      "Anchors set. The hollow is safe.",
      "The nest shares its strength.",
      "The flooded earth takes its toll.",
    ],
  ),
];
const FAULT: Encounter[] = [
  E(
    "A crack in the dark",
    "The first aftershock splits a tunnel brace. Keep the structure above 40.",
    "repair",
    "quake",
    ["Install shock braces", "Borrow the bed frame", "Search the cracks"],
    [
      "The first shock, absorbed.",
      "Pip lends a piece of home.",
      "Cells found. The fault stays open.",
    ],
  ),
  E(
    "Roots on the faultline",
    "Shifting soil snaps the water line. The seedlings are drying out.",
    "water",
    "dry",
    ["Patch the water line", "Reroute tunnel water", "Collect fallen cells"],
    [
      "Water finds the roots again.",
      "A shortcut with a structural cost.",
      "Power recovered. The roots wait.",
    ],
  ),
  E(
    "Cold from the crevice",
    "A crack opens behind the bedding. The warmth is escaping.",
    "heat",
    "cold",
    ["Seal the crevice", "Burn root kindling", "Keep the battery"],
    [
      "The crack is sealed tight.",
      "A few roots keep Pip warm.",
      "The battery stays full. The nest cools.",
    ],
  ),
  E(
    "The deep aftershock",
    "The earth shivers again. Weak tunnels will send damage to every room.",
    "repair",
    "quake",
    ["Reinforce the arches", "Use the nest scaffold", "Salvage loose wiring"],
    [
      "The arches take the shock.",
      "The nest supports the tunnels.",
      "Wiring saved. Supports weakened.",
    ],
  ),
  E(
    "Dust over the seedlings",
    "Falling dust blocks the irrigation. Give the garden a fresh start.",
    "water",
    "rocks",
    ["Flush the irrigation", "Open the tunnel pipe", "Store the pump cell"],
    [
      "Clean water. Greener leaves.",
      "The pipe clears, weakening its supports.",
      "Power stored. Dust settles on the leaves.",
    ],
  ),
  E(
    "The cold before dawn",
    "The final shock opens the nest wall. Keep this little home together.",
    "heat",
    "cold",
    ["Shield the nest", "Burn the last roots", "Hold onto the cells"],
    [
      "Home is safe, all the way down.",
      "The last roots give their warmth.",
      "The final chill reaches home.",
    ],
  ),
];
export interface TurnLog {
  turn: number;
  choice: string;
  result: string;
  before: Values;
  after: Values;
  gained: number;
  spent: number;
  salvaged: number;
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
    systems: { heat: 64, water: 64, repair: 64 },
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
export function forecast(run: Run): Encounter & { effects: string[] } {
  const base = [FIRST, FLOOD, FAULT][run.level - 1][run.turn - 1];
  const depth = (run.level - 1) * 2;
  const damage = Object.fromEntries(
    SYSTEMS.map((s) => [
      s,
      base.damage[s] + depth - (run.installed.includes(s) ? 3 : 0),
    ]),
  ) as Values;
  const effects: string[] = [];
  if (run.level === 2 && run.systems.water < 40) {
    damage.repair += 5;
    effects.push("Waterlogged garden: tunnels take 5 extra damage.");
  }
  if (run.level === 3 && run.systems.repair < 40) {
    for (const s of SYSTEMS) damage[s] += 4;
    effects.push("Unstable tunnels: every room takes 4 extra damage.");
  }
  const choices = base.choices.map((choice) => {
    const salvage = Math.min(
      choice.salvage,
      CAPACITY - run.power + choice.cost,
    );
    if (salvage === choice.salvage) return choice;
    return {
      ...choice,
      salvage,
      description:
        salvage === 0
          ? "Take the damage. Your power bank is already full."
          : `Take the damage. Save ${salvage} power for later.`,
    };
  });
  return { ...base, damage, effects, choices };
}
export function canChoose(run: Run, id: string): boolean {
  const choice = forecast(run).choices.find((c) => c.id === id);
  return (
    run.status === "playing" &&
    run.ready &&
    !!choice &&
    choice.cost <= run.power
  );
}
export function preview(run: Run, id: string): Values {
  const event = forecast(run),
    choice = event.choices.find((c) => c.id === id);
  if (!choice) throw new Error("Unknown response.");
  return Object.fromEntries(
    SYSTEMS.map((s) => [
      s,
      Math.max(
        0,
        Math.min(100, run.systems[s] + choice.care[s] - event.damage[s]),
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
export function playTurn(run: Run, id: string): Run {
  if (!canChoose(run, id))
    throw new Error(
      "This response is unavailable or the encounter is not ready.",
    );
  const event = forecast(run),
    choice = event.choices.find((c) => c.id === id)!,
    systems = preview(run, id);
  const viable = SYSTEMS.every((s) => systems[s] > 0),
    won = viable && run.turn === 6;
  return {
    ...run,
    systems,
    power: Math.min(CAPACITY, run.power - choice.cost + choice.salvage),
    completed: run.turn,
    turn: viable && !won ? run.turn + 1 : run.turn,
    ready: false,
    status: !viable ? "lost" : won ? "won" : "playing",
    history: [
      ...run.history,
      {
        turn: run.turn,
        choice: choice.name,
        result: choice.result,
        before: { ...run.systems },
        after: systems,
        gained: run.turnGain,
        spent: choice.cost,
        salvaged: choice.salvage,
        event: event.name,
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
    blueprints:
      profile.blueprints +
      (run.mode === "practice" && run.status === "won" ? 1 : 0),
    level:
      run.status === "won"
        ? (Math.max(profile.level, Math.min(3, run.level + 1)) as Levels)
        : profile.level,
  };
}
export const condition = (value: number) =>
  value === 0
    ? "Lost"
    : value < 25
      ? "In danger"
      : value < 50
        ? "Needs care"
        : "Safe";
