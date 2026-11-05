# Burrow Power

**Small paws. Big night.** Protect Pip’s underground home through six encounters. Read each threat, choose a response, and keep the nest, garden and tunnels above zero until sunrise.

This continues the existing React/TypeScript game and LED habitat. Progress, points, power and blueprints stay **in this browser**. There is no wallet connection, shared leaderboard, SQK reward, contract change or deployment.

## Install, preview and rebuild

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
```

Reproduce the static export and checks:

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`dist/index.html` and its complete assets are included alongside the source and existing lockfile. The existing Vite toolchain sets `base: './'`. JavaScript, CSS, local Manrope font, favicon and share image use relative URLs. Serve `dist/` over HTTP, including at a gateway subpath; do not open it with `file:`. Navigation uses `#burrow` and `#play`, without server rewrites.

The dependency manifests, lockfile, build configuration and dependencies were preserved. This worker used the existing `BURROW_TOOLCHAIN` option with dependencies installed outside the repository. No dependency tree, package cache, browser binary or registry archive is delivered.

## Play and save

Choose **Practice** or **Real wheel**, then **Protect the burrow**. An unfinished shift resumes. Start with 9 power and 64/100 in each room. Each encounter credits its power once, with a bank capacity of 16.

- Protection costs 2 power and cares for the threatened room.
- Improvisation costs 1 power and trades another room’s condition for care.
- Salvaging accepts the damage and adds up to 2 power.

Each response shows the exact net condition changes. Focus or hover previews the result. Choose **Next encounter** after reviewing the outcome. Keep every room above 0 through encounter 6 to win and unlock the next hollow. Restart asks for confirmation and preserves long-term progress. Installed upgrades reduce damage to their own room by 3.

| Hollow | Challenge |
| --- | --- |
| The first burrow | Cold, thirst, stones, moths, flooding and a tremor |
| The flooded hollow | Flood encounters; a garden below 40 adds tunnel damage |
| The faultline | Aftershocks; tunnels below 40 add damage to every room |

All three hollows remain winnable with an idle wheel and no upgrades. Score remains `100 × completed encounters + 2 × remaining room conditions + 25 × remaining power + 100 × level + 500 for a win`. Practice and real-wheel best scores, wins, unlocks, upgrades and active shifts remain separate.

Saves use `burrow-power:save:v2`. Existing v2 saves and v1 profile/watermark migration remain supported. Old allocation-era active turns stay in their original key. Save/resume never credits encounter power twice. Browser-storage denial permits session-only practice and disables real-wheel play and unlock tracking.

## Squeekchain integration fix

Official sources inspected on **2026-11-05**:

- [Status endpoint](https://api.squeekchain.com/v1/status) and [published status schema](https://docs.squeekchain.com/assets/api/status.json).
- [Protocol events endpoint](https://api.squeekchain.com/v1/events?category=protocol&limit=100), [published event schema](https://docs.squeekchain.com/assets/api/events.json) and [API reference](https://docs.squeekchain.com/developers/api/).

The real status response is supported **schemaVersion 1**. Fresh, accepted hardware with `coreStatus: IDLE` and `rpmMilli: 0` is a valid stopped wheel. It generates exactly 0 additional power; starting reserves still allow a complete game.

The real event response is **schemaVersion 4**, with catalog `public-activity-v4` and settlement **eventVersion 2**. The current official reference and linked JSON Schema still specify envelope **schemaVersion 3**. The live envelope also omits the documented `identities` object, instead providing `deployment` and `capabilities`. Therefore the old validator fails its version check first; simply accepting version 4 would then fail its identity/envelope check. The catalog’s “v4” is a separate version and was already supported. Schema-4 settlement identity semantics cannot be established from the currently published schema, so validation is retained and these events do not grant blueprints.

Previously `fetchLive` combined both requests and validations into one result; any event error discarded otherwise valid wheel status. The app now has independent wheel and settlement request/error/loading state. Wheel status appears as soon as its request validates. A slow, unavailable, unsupported, stale or rate-limited event feed pauses **only new settlement unlocks**. A visible note explains the pause, opens the detailed feed error without leaving the game, and offers a separate feed retry. Existing blueprints can still be installed between shifts. Event-request cooldowns cannot block status refreshes.

The displayed settled round now comes from the validated **status `builder.anchor.settledThroughRound`**, never `save.lastRound` or a numeric maximum across installations. Invalid/unavailable builder data affects only this display. The supplied 219 is covered by a regression fixture; live observations during this run advanced from 235 to 237. These are observations, not constants in the UI. Retained save data such as 1300 is explicitly **“Local last-seen settlement round”**, with a warning that it may belong to an earlier installation. Stale or failed status never presents a saved round as current. The status round never grants blueprints or advances settlement watermarks.

### Freshness and power

Both observation and receipt must be within **120 seconds**, with the existing 15-second future-clock tolerance. Polling remains every 15 seconds while visible. A one-second clock update and another freshness check immediately before every live action prevent stale turns from spending power or advancing. No fixture substitutes for unavailable hardware.

Fresh `ACTIVE` hardware generates `min(4, ceil(rpmMilli / 25000))` local power per encounter. `rpmMilli` is thousandths of RPM. IDLE and zero-rate readings generate zero. Faults, non-hardware provenance and an unaccepted oracle cannot enter live play. The same still-fresh reading may inform several quick encounters; this is local game balancing, not physical-work metering or protocol issuance.

Practice uses the explicitly labelled designed sequence in `src/data/practice.json`, with separate progress and a still wheel. The wheel animates only for fresh active hardware in Real wheel mode. The motion control and reduced-motion preference remain in place.

### Settlement recovery

Supported schema-3 feeds still require the existing catalog, Sepolia chain, 12-confirmation safe frontier, matching installation/release/core identity, settlement event version 2 and valid consumed fields. Safe-block freshness remains 10 minutes; it affects settlement unlocks independently of wheel freshness. At observation time the live event safe block was also over 10 minutes old, an additional reason unlocks could not be trusted even if version support existed.

First sync into a new installation scope retains the existing policy: credit only its newest eligible event. Returning saves resume from their installation/chain/core-scoped block/log/event-ID/round watermarks. Pages must retain one safe frontier and include the exact saved anchor. Events are ordered with `BigInt`; each next settlement range must start at the saved or preceding round. Missing history, inconsistent ranges, repeated cursors, failed pages or a changing frontier leave all watermarks and credits unchanged. Credits and the new watermark persist in one save. A final anchor check also protects against a save updated during a fetch. Duplicate pages, retries and reloads do not award twice.

Catch-up remains bounded to ten additional pages. A larger backlog or a feed that no longer retains the saved anchor stays paused instead of skipping events. Current schema-4 unlocks cannot resume until a supported, verifiable event feed is available. No undocumented schema adapter or independent RPC verification is claimed.

## Validation in this run

Production build and TypeScript check **passed**. **42 unit/API/game/storage tests passed**. The sandbox rejected the existing `tsx` CLI’s IPC socket; the same tests ran successfully through Node’s `--import` loader, without changing the build scripts:

```sh
node --import tsx --test tests/*.test.ts
```

The production JavaScript was also executed in a **JSDOM emulator** under `/preview/`. Its interaction suite uses the real public API for one game and explicitly labelled fixtures for failure/recovery cases. It covers six-encounter play with actual fresh IDLE/0 hardware, independent pending/error event state, stale and non-hardware rejection, practice, 219 versus saved 1300, separate rate limits, expiry before an action, unchanged saves on failure, and two-page unlock recovery across retry/reload. DOM emulation does **not** establish rendered browser behavior.

To reproduce the optional DOM suite without adding dependencies to the project:

```sh
npm install --prefix /tmp/burrow-dom-tools jsdom@26.1.0
BURROW_JSDOM=/tmp/burrow-dom-tools/node_modules/jsdom/lib/api.js node scripts/integration-check.mjs
```

Additional checks:

```sh
node scripts/research-api.mjs
node scripts/check-export.mjs
npx playwright install chromium webkit
npm run test:browser
node scripts/live-check.mjs
node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

**Rendered verification is incomplete.** The supplied browser preview could not launch; local Chromium also exited before opening a page, and WebKit’s runtime was unavailable. Both browser suites record **unperformed**, and the pinned taste probe exited 2 without measuring the page. No new screenshot, 390px first-screen measurement, rendered contrast result, native keyboard/dialog check, browser CORS result, or browser accessibility pass is claimed. The existing responsive design and first-action ordering are preserved and reviewed in source. The new settlement note is explicitly ordered after the primary controls on mobile.

The six Better Interface domains were reviewed, applicable source/interaction findings fixed, and coverage limits recorded. See [DESIGN.md](DESIGN.md) and the generated reports: [validation](artifacts/validation.md), [API research](artifacts/api-research.md), [DOM interactions](artifacts/interaction-validation.json), [unit results](artifacts/unit-validation.json), [browser status](artifacts/browser-validation.json), [live-browser status](artifacts/live-validation.json), and [export audit](artifacts/bundle-audit.json). Public regression captures and the documented v3 fixtures are included under `tests/fixtures/`; runtime code never imports them as live data.

Build/source/static assets are delivered for the existing publishing workflow. This job did not publish a site, create a remote PR, or deploy/change contracts. Worker checks are observations, not independent certification. Design-guidance attribution remains in `licenses/Design-guidance.txt`; font and React notices remain with the public assets.
