// Read-only public research. No credentials, worker configuration or chain writes.
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const reads = [
  ["status", "https://api.squeekchain.com/v1/status"],
  ["events", "https://api.squeekchain.com/v1/events?category=protocol&limit=100"],
  ["status-schema", "https://docs.squeekchain.com/assets/api/status.json"],
  ["events-schema", "https://docs.squeekchain.com/assets/api/events.json"],
];
await mkdir("artifacts/api", { recursive: true });
const evidence = {};
for (const [name, url] of reads) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json", "User-Agent": "BurrowPower-Public-API-Review/1.0" }, credentials: "omit", cache: "no-cache" });
  if (!response.ok) throw new Error(`Public ${name} read failed: HTTP ${response.status}`);
  const raw = await response.text(), body = JSON.parse(raw);
  const request = {
    url, checkedAt: new Date().toISOString(), status: response.status,
    headers: Object.fromEntries(["date", "etag", "cache-control", "content-type", "x-request-id", "access-control-allow-origin"].map((key) => [key, response.headers.get(key)]).filter(([, value]) => value !== null)),
    sha256: createHash("sha256").update(raw).digest("hex"),
  };
  await writeFile(`artifacts/api/${name}.json`, raw);
  await writeFile(`artifacts/api/${name}-request.json`, JSON.stringify(request, null, 2) + "\n");
  evidence[name] = { ...request, body };
}
const status = evidence.status.body, events = evidence.events.body, eventSchema = evidence["events-schema"].body;
const schemaVersions = [...new Set(Object.values(eventSchema.$defs).map((d) => d?.properties?.schemaVersion?.const).filter((v) => v !== undefined))];
const available = Object.values(eventSchema.$defs).find((d) => d?.properties?.status?.const === "available");
const report = {
  checkedAt: new Date().toISOString(),
  sources: reads.map(([name, url]) => ({ name, url, checkedAt: evidence[name].checkedAt })),
  status: { actualSchemaVersion: status.schemaVersion, publishedSchemaVersion: evidence["status-schema"].body.properties.schemaVersion.const, measurement: status.measurement, settledRound: status.builder?.anchor?.settledThroughRound ?? null },
  events: { actualSchemaVersion: events.schemaVersion, publishedSchemaVersions: schemaVersions, catalogVersion: events.catalogVersion, hasIdentities: "identities" in events, hasDeployment: "deployment" in events, hasCapabilities: "capabilities" in events, requiredByPublishedAvailableSchema: available.required, eventCount: events.events?.length, settlementEventVersions: [...new Set(events.events?.filter((e) => e.type === "system.settlement_completed").map((e) => e.eventVersion))], safeBlockTimestamp: events.chain?.safeBlockTimestamp ?? null },
  note: "Observed fields describe the public responses; they do not establish undocumented schema-4 semantics or independent chain verification.",
};
await writeFile("artifacts/api-research.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ statusVersion: report.status.actualSchemaVersion, wheel: status.measurement.coreStatus, rpmMilli: status.measurement.rpmMilli, settledRound: report.status.settledRound, eventsVersion: events.schemaVersion, publishedEventVersions: schemaVersions, hasIdentities: report.events.hasIdentities, eventCount: events.events?.length }));
