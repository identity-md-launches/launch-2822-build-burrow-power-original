export const API = "https://api.squeekchain.com";
export const STATUS_PATH = "/v1/status";
export const EVENTS_PATH = "/v1/events?category=protocol&limit=100";
export const DOCS = "https://docs.squeekchain.com/developers/api/";
export interface Measurement {
  freshness: "online" | "stale";
  observedAt: string;
  receivedAt: string;
  staleAfterSeconds: 120;
  counterEpoch: string;
  cumulativeWorkUnits: string;
  provenance: string;
  coreStatus: "IDLE" | "ACTIVE" | "COUNTER_FAULT";
  rpmMilli: number;
  speedMmPerSecond: number;
  distanceMm: number;
}
export interface WheelStatus {
  schemaVersion: 1;
  installationId: string;
  revision: string;
  generatedAt: string;
  measurement: Measurement;
}
export interface Settlement {
  id: string;
  eventVersion: 2;
  type: "system.settlement_completed";
  occurredAt: string;
  source: {
    kind: "chain";
    chainId: string;
    releaseId: string;
    contractAddress: string;
    blockNumber: string;
    logIndex: string;
    transactionHash: string;
    confirmationStatus: "safe";
  };
  payload: { previousSettledThroughRound: string; settledThroughRound: string };
}
export interface EventPage {
  installationId: string;
  scope: string;
  events: Settlement[];
  nextCursor: string | null;
  safeThroughBlock: string;
  safeBlockTimestamp: string;
}
export interface WheelSnapshot {
  status: WheelStatus;
  settledRound: string | null;
  roundError: string | null;
  checkedAt: string;
}
export type Watermarks = Record<
  string,
  { block: string; log: string; eventId: string; round: string }
>;
export class DataError extends Error {
  constructor(
    public kind: "stale" | "schema" | "unavailable" | "outage" | "rate",
    message: string,
    public retryAfter = 0,
  ) {
    super(message);
    this.name = "DataError";
  }
}
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown): x is string => typeof x === "string" && x.length > 0;
const uint = (x: unknown): x is string => str(x) && /^(0|[1-9][0-9]*)$/.test(x);
const timestamp = (x: unknown): x is string =>
  str(x) && /^\d{4}-\d\d-\d\dT/.test(x) && Number.isFinite(Date.parse(x));
const integer = (x: unknown): x is number =>
  Number.isSafeInteger(x) && Number(x) >= 0;
const hash = (x: unknown): x is string =>
  str(x) && /^0x[0-9a-fA-F]{64}$/.test(x);
const address = (x: unknown): x is string =>
  str(x) && /^0x[0-9a-fA-F]{40}$/.test(x);
function bad(message: string): never {
  throw new DataError(
    "schema",
    `Unsupported API data: ${message}.`,
  );
}
export function validateStatus(raw: unknown, now = Date.now()): WheelStatus {
  if (!object(raw) || raw.schemaVersion !== 1)
    bad("expected status schema version 1");
  if (raw.status === "unavailable")
    throw new DataError(
      "unavailable",
      "The wheel API reports unavailable. Try again or play practice.",
    );
  if (
    !str(raw.installationId) ||
    !str(raw.revision) ||
    !timestamp(raw.generatedAt)
  )
    bad("missing status identity or timestamp");
  const m = raw.measurement;
  if (m === null)
    throw new DataError(
      "unavailable",
      "The wheel has not reported a measurement yet. Try again or play practice.",
    );
  if (
    !object(m) ||
    !["online", "stale"].includes(String(m.freshness)) ||
    !timestamp(m.observedAt) ||
    !timestamp(m.receivedAt) ||
    m.staleAfterSeconds !== 120 ||
    !str(m.counterEpoch) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      m.counterEpoch,
    ) ||
    !uint(m.cumulativeWorkUnits) ||
    BigInt(m.cumulativeWorkUnits) > 18446744073709551615n ||
    !["hardware", "simulated", "replay", "derived"].includes(
      String(m.provenance),
    ) ||
    !["IDLE", "ACTIVE", "COUNTER_FAULT"].includes(String(m.coreStatus)) ||
    !integer(m.rpmMilli) ||
    !integer(m.speedMmPerSecond) ||
    !integer(m.distanceMm)
  )
    bad("invalid wheel measurement fields");
  assertFresh(m as unknown as Measurement, now);
  if (m.provenance !== "hardware")
    throw new DataError(
      "unavailable",
      `The API labels this reading ${m.provenance}, not hardware. Use practice while real wheel data returns.`,
    );
  if (m.coreStatus === "COUNTER_FAULT")
    throw new DataError(
      "unavailable",
      "The wheel reports a counter fault. Live shifts are paused until it recovers.",
    );
  if (!object(raw.oracle) || raw.oracle.state !== "accepted")
    throw new DataError(
      "unavailable",
      "The wheel oracle is not accepting measurements. Try again or play practice.",
    );
  return raw as unknown as WheelStatus;
}
export function assertFresh(m: Measurement, now = Date.now()) {
  if (
    m.freshness !== "online" ||
    now - Date.parse(m.receivedAt) > 120000 ||
    now - Date.parse(m.observedAt) > 120000
  )
    throw new DataError(
      "stale",
      "Wheel data is older than 120 seconds. Your shift is paused; no turn or power has been spent.",
    );
  if (
    Date.parse(m.receivedAt) - now > 15000 ||
    Date.parse(m.observedAt) - now > 15000
  )
    throw new DataError(
      "stale",
      "The wheel timestamp is ahead of this device. Check your clock, then retry.",
    );
}
export function wheelPower(
  m: Pick<Measurement, "coreStatus" | "rpmMilli">,
): number {
  return m.coreStatus === "ACTIVE" && m.rpmMilli > 0
    ? Math.min(4, Math.ceil(m.rpmMilli / 25000))
    : 0;
}
// The builder's settled frontier is display data, never an unlock or a watermark.
// Validate it separately so unavailable builder data cannot hide a valid wheel.
export function validateStatusRound(raw: unknown): string | null {
  if (!object(raw) || raw.schemaVersion !== 1)
    bad("expected status schema version 1");
  if (!object(raw.builder)) bad("missing status builder");
  if (raw.builder.status === "unavailable") return null;
  const anchor = raw.builder.anchor;
  if (
    raw.builder.status !== "available" ||
    !object(anchor) ||
    !uint(anchor.settledThroughRound) ||
    BigInt(anchor.settledThroughRound) > 18446744073709551615n ||
    (anchor.confirmedAt !== null && !timestamp(anchor.confirmedAt)) ||
    (anchor.transactionHash !== null && !hash(anchor.transactionHash))
  ) bad("invalid settled round in status builder");
  return anchor.settledThroughRound;
}
export function validateEvents(raw: unknown, now = Date.now()): EventPage {
  if (!object(raw) || raw.schemaVersion !== 3)
    bad(`event schema version ${object(raw) && integer(raw.schemaVersion) ? raw.schemaVersion : "unknown"}; expected 3 (the published schema)`);
  if (raw.status === "unavailable")
    throw new DataError(
      "unavailable",
      `Round feed unavailable (${str(raw.reason) ? raw.reason : "unknown reason"}).`,
    );
  if (
    raw.status !== "available" ||
    raw.catalogVersion !== "public-activity-v4" ||
    !str(raw.installationId) ||
    !timestamp(raw.generatedAt) ||
    !Array.isArray(raw.events) ||
    (raw.nextCursor !== null && !str(raw.nextCursor)) ||
    !object(raw.chain) ||
    !object(raw.identities) ||
    !object(raw.release) ||
    !str(raw.release.id)
  )
    bad("invalid round feed envelope");
  const c = raw.chain;
  if (
    c.chainId !== "11155111" ||
    c.target !== "sepolia" ||
    c.confirmations !== "12" ||
    !uint(c.safeThroughBlock) ||
    !timestamp(c.safeBlockTimestamp) ||
    !address(raw.identities.core)
  )
    bad("unrecognized chain identity or safe block");
  if (
    now - Date.parse(c.safeBlockTimestamp) > 600000 ||
    Date.parse(c.safeBlockTimestamp) - now > 15000
  )
    throw new DataError(
      "stale",
      "The settlement feed safe block is older than 10 minutes or ahead of this device’s clock.",
    );
  const events: Settlement[] = [];
  for (const event of raw.events) {
    if (!object(event) || !str(event.type)) bad("invalid event entry");
    // Other catalog events (such as mining checkpoints) do not unlock a blueprint.
    if (event.type !== "system.settlement_completed") continue;
    const s = event.source,
      p = event.payload;
    if (
      event.eventVersion !== 2 ||
      !str(event.id) ||
      event.id.length > 512 ||
      !timestamp(event.occurredAt) ||
      !object(s) ||
      !object(p) ||
      s.kind !== "chain" ||
      s.chainId !== c.chainId ||
      s.releaseId !== raw.release.id ||
      s.confirmationStatus !== "safe" ||
      !address(s.contractAddress) ||
      s.contractAddress.toLowerCase() !==
        (raw.identities.core as string).toLowerCase() ||
      !uint(s.blockNumber) ||
      BigInt(s.blockNumber) > BigInt(c.safeThroughBlock) ||
      !uint(s.logIndex) ||
      !hash(s.transactionHash) ||
      !uint(p.previousSettledThroughRound) ||
      !uint(p.settledThroughRound) ||
      BigInt(p.settledThroughRound) <= BigInt(p.previousSettledThroughRound)
    )
      bad("invalid or unconfirmed round event");
    events.push(event as unknown as Settlement);
  }
  return {
    installationId: raw.installationId,
    scope: `${raw.installationId}:${c.chainId}:${(raw.identities.core as string).toLowerCase()}`,
    events,
    nextCursor: raw.nextCursor as string | null,
    safeThroughBlock: c.safeThroughBlock,
    safeBlockTimestamp: c.safeBlockTimestamp,
  };
}
export const compareEvent = (
  a: { block: string; log: string },
  b: { block: string; log: string },
) =>
  BigInt(a.block) < BigInt(b.block)
    ? -1
    : BigInt(a.block) > BigInt(b.block)
      ? 1
      : BigInt(a.log) < BigInt(b.log)
        ? -1
        : BigInt(a.log) > BigInt(b.log)
          ? 1
          : 0;
export const position = (event: Settlement) => ({
  block: event.source.blockNumber,
  log: event.source.logIndex,
});
function assertWatermarkCovered(page: EventPage, watermarks: Watermarks) {
  const previous = watermarks[page.scope];
  if (!previous) return;
  if (BigInt(page.safeThroughBlock) < BigInt(previous.block))
    throw new DataError("stale", "Settlement feed is behind the saved watermark. Waiting for it to catch up.");
  if (!page.events.some((e) => compareEvent(position(e), previous) === 0 &&
    e.id === previous.eventId && e.payload.settledThroughRound === previous.round))
    throw new DataError("unavailable", "The feed does not include the saved settlement watermark. Unlocks will resume when complete history can be verified.");
}
export function consumeEvents(page: EventPage, watermarks: Watermarks) {
  // Recheck the current save too: another tab may update it during pagination.
  assertWatermarkCovered(page, watermarks);
  const sorted = [...page.events].sort((a, b) =>
    compareEvent(position(a), position(b)),
  );
  const previous = watermarks[page.scope];
  // First visit starts with the latest safe event; older history predates this save.
  const candidates = previous
    ? sorted.filter((e) => compareEvent(position(e), previous) > 0)
    : sorted.slice(-1);
  let watermark = previous;
  let added = 0;
  let last: Settlement | undefined;
  for (const e of candidates) {
    if (watermark && compareEvent(position(e), watermark) <= 0) continue;
    if (watermark && BigInt(e.payload.previousSettledThroughRound) !== BigInt(watermark.round))
      throw new DataError("unavailable", "Settlement history has a gap or an inconsistent round range after the saved watermark. New unlocks remain paused; retry for complete history.");
    watermark = {
      ...position(e),
      eventId: e.id,
      round: e.payload.settledThroughRound,
    };
    added++;
    last = e;
  }
  return {
    added,
    last,
    watermarks: watermark
      ? { ...watermarks, [page.scope]: watermark }
      : watermarks,
  };
}
// A busy event indexer must not prevent the independent wheel request.
const retries = new Map<string, number>();
async function request(path: string, signal?: AbortSignal): Promise<unknown> {
  const channel = path.startsWith(STATUS_PATH) ? STATUS_PATH : EVENTS_PATH;
  const retryAt = retries.get(channel) ?? 0;
  if (Date.now() < retryAt)
    throw new DataError(
      "rate",
      `The API asked to wait. Retry after ${new Date(retryAt).toLocaleTimeString()}.`,
      retryAt - Date.now(),
    );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(API + path, {
      signal: controller.signal,
      credentials: "omit",
      cache: "no-cache",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      if (response.status === 429 || response.status === 503) {
        const header = response.headers.get("Retry-After");
        const seconds =
          header && /^\d+$/.test(header)
            ? Number(header)
            : header
              ? Math.max(1, (Date.parse(header) - Date.now()) / 1000)
              : 10;
        const nextRetry =
          Date.now() +
          Math.max(
            1000,
            Math.min(
              86400000,
              Number.isFinite(seconds) ? seconds * 1000 : 10000,
            ),
          );
        retries.set(channel, nextRetry);
        throw new DataError(
          "rate",
          `The API is busy (HTTP ${response.status}). Retry after ${new Date(nextRetry).toLocaleTimeString()}.`,
          nextRetry - Date.now(),
        );
      }
      throw new DataError(
        "outage",
        `The Squeekchain API returned HTTP ${response.status}. Your shift is safe. Retry or play practice.`,
      );
    }
    try {
      return await response.json();
    } catch {
      bad("response is not JSON");
    }
  } catch (error) {
    if (error instanceof DataError) throw error;
    throw new DataError(
      "outage",
      "Unable to reach Squeekchain. Check your connection, then retry, or play practice.",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
export async function fetchWheel(signal?: AbortSignal): Promise<WheelSnapshot> {
  const raw = await request(STATUS_PATH, signal);
  const status = validateStatus(raw);
  let settledRound: string | null = null;
  let roundError: string | null = null;
  try {
    settledRound = validateStatusRound(raw);
  } catch (error) {
    roundError = error instanceof Error ? error.message : "Settled round unavailable.";
  }
  return { status, settledRound, roundError, checkedAt: new Date().toISOString() };
}
export async function fetchSettlements(
  watermarks: Watermarks,
  installationId: string,
  signal?: AbortSignal,
): Promise<EventPage> {
  const page = validateEvents(await request(EVENTS_PATH, signal));
  if (page.installationId !== installationId)
    bad("wheel and event feed installations differ");
  const watermark = watermarks[page.scope];
  if (watermark && BigInt(page.safeThroughBlock) < BigInt(watermark.block))
    throw new DataError("stale", "Settlement feed is behind the saved watermark. Waiting for it to catch up.");
  let cursor = page.nextCursor;
  let count = 0;
  const cursors = new Set<string>();
  // Catch up new events while retaining the safe frontier of the first page.
  while (
    watermark &&
    cursor &&
    (!page.events.length ||
      page.events.every((e) => compareEvent(position(e), watermark) > 0))
  ) {
    if (++count > 10)
      throw new DataError(
        "unavailable",
        "Too much round history to catch up safely in one request. Practice remains available.",
      );
    if (cursors.has(cursor)) bad("settlement pagination repeated a cursor");
    cursors.add(cursor);
    const next = validateEvents(
      await request(
        EVENTS_PATH + "&cursor=" + encodeURIComponent(cursor),
        signal,
      ),
    );
    if (next.scope !== page.scope || next.safeThroughBlock !== page.safeThroughBlock || next.safeBlockTimestamp !== page.safeBlockTimestamp)
      bad("deployment or safe frontier changed while reading round history; retry from the saved watermark");
    page.events.push(
      ...next.events.filter(
        (e) => BigInt(e.source.blockNumber) <= BigInt(page.safeThroughBlock),
      ),
    );
    cursor = next.nextCursor;
  }
  // Do not advance past a gap, even when the server says there are no more pages.
  assertWatermarkCovered(page, watermarks);
  return page;
}
