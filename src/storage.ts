import { newProfile, SYSTEMS, type Mode, type Profile, type Run } from "./game";
import type { Watermarks } from "./api";
export const SAVE_KEY = "burrow-power:save:v1";
export interface Save {
  version: 1;
  activeMode: Mode;
  profiles: Record<Mode, Profile>;
  runs: Record<Mode, Run | null>;
  watermarks: Watermarks;
  lastRound: string | null;
  revision: number;
}
export const freshSave = (): Save => ({
  version: 1,
  activeMode: "live",
  profiles: {
    live: newProfile(),
    practice: { ...newProfile(), blueprints: 1 },
  },
  runs: { live: null, practice: null },
  watermarks: {},
  lastRound: null,
  revision: 0,
});
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const systems = (v: unknown, max = 100) =>
  obj(v) && SYSTEMS.every((k) => num(v[k], 0, max));
const installed = (v: unknown) =>
  Array.isArray(v) &&
  v.length <= 3 &&
  v.every((k) => SYSTEMS.includes(k)) &&
  new Set(v).size === v.length;
function validProfile(p: unknown): boolean {
  return (
    obj(p) &&
    num(p.level, 1, 3) &&
    num(p.best, 0, 1000000) &&
    num(p.wins, 0, 1000000000) &&
    num(p.blueprints, 0, 1000000000) &&
    installed(p.installed)
  );
}
function validRun(r: unknown, mode: Mode): boolean {
  if (r === null) return true;
  if (
    !obj(r) ||
    r.mode !== mode ||
    !num(r.level, 1, 3) ||
    !num(r.turn, 1, 6) ||
    !num(r.completed, 0, 6) ||
    !systems(r.systems) ||
    !num(r.power, 0, 12) ||
    !num(r.turnGain, 0, 4) ||
    typeof r.ready !== "boolean" ||
    typeof r.observation !== "string" ||
    !num(r.rpmMilli, 0, Number.MAX_SAFE_INTEGER) ||
    !installed(r.installed) ||
    !["playing", "won", "lost"].includes(String(r.status)) ||
    !Array.isArray(r.history) ||
    r.history.length !== r.completed
  )
    return false;
  if (
    r.status === "playing" &&
    (r.completed !== Number(r.turn) - 1 ||
      SYSTEMS.some((k) => (r.systems as Record<string, number>)[k] <= 0))
  )
    return false;
  if (r.status === "won" && (r.completed !== 6 || r.turn !== 6)) return false;
  return r.history.every(
    (h, i) =>
      obj(h) &&
      h.turn === i + 1 &&
      systems(h.allocation, 2) &&
      systems(h.before) &&
      systems(h.after) &&
      num(h.gained, 0, 4) &&
      num(h.spent, 0, 3) &&
      typeof h.event === "string" &&
      typeof h.observation === "string" &&
      num(h.rpmMilli, 0, Number.MAX_SAFE_INTEGER),
  );
}
export function parseSave(raw: string | null): Save | null {
  if (!raw || raw.length > 2000000) return null;
  try {
    const x: unknown = JSON.parse(raw);
    if (
      !obj(x) ||
      x.version !== 1 ||
      (x.activeMode !== undefined &&
        !["live", "practice"].includes(String(x.activeMode))) ||
      !obj(x.profiles) ||
      !validProfile(x.profiles.live) ||
      !validProfile(x.profiles.practice) ||
      !obj(x.runs) ||
      !validRun(x.runs.live, "live") ||
      !validRun(x.runs.practice, "practice") ||
      !obj(x.watermarks) ||
      !num(x.revision, 0, Number.MAX_SAFE_INTEGER) ||
      (x.lastRound !== null &&
        (typeof x.lastRound !== "string" || !/^\d+$/.test(x.lastRound)))
    )
      return null;
    for (const [key, w] of Object.entries(x.watermarks))
      if (
        key.length > 300 ||
        !obj(w) ||
        !["block", "log", "round"].every(
          (k) => typeof w[k] === "string" && /^\d+$/.test(w[k] as string),
        ) ||
        typeof w.eventId !== "string"
      )
        return null;
    return { ...x, activeMode: x.activeMode ?? "live" } as unknown as Save;
  } catch {
    return null;
  }
}
export function openStorage(): {
  save: Save;
  available: boolean;
  recovered: boolean;
} {
  try {
    const raw = localStorage.getItem(SAVE_KEY),
      parsed = parseSave(raw);
    localStorage.setItem(SAVE_KEY + ":probe", "1");
    localStorage.removeItem(SAVE_KEY + ":probe");
    return {
      save: parsed ?? freshSave(),
      available: true,
      recovered: !!raw && !parsed,
    };
  } catch {
    return { save: freshSave(), available: false, recovered: false };
  }
}
export function persist(save: Save): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
