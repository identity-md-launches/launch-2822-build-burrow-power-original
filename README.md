# Burrow Power

A single-player strategy game for the Squeekchain community. Keep a hamster’s nest, garden, and tunnels alive through six turns. Fresh hardware wheel activity changes the power you can spend. Confirmed round settlements unlock upgrades.

**Points and blueprints are local game items, not SQK.** No wallet, contract, token, backend, entry fee, or financial reward is involved. The game and dot artwork are original to this project.

## Run, preview, and rebuild

Use Node.js 24 and npm. The checked-in `dist/` is a complete production export; it does not need rebuilding to be hosted.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

Vite prints the preview address. Serve `dist/` using any static HTTP host. The build sets `base: './'`; scripts, CSS, fonts, favicon, and share image use relative paths. Navigation uses hashes (`#burrow`, `#play`, `#how-to-play`), so gateway subpaths need no server rewrites. Use HTTP rather than opening `index.html` as a `file:` URL.

For browser validation:

```sh
npx playwright install chromium webkit
npm run test:browser
node scripts/live-check.mjs
node scripts/keyboard-check.mjs
```

On Linux, Playwright may also need its documented native browser dependencies. `test:browser` reports a missing browser as unperformed, not passed. The live check is separate: it uses the actual public API without interception and requires fresh, healthy data. It will fail when the service is stale or unavailable; the game's practice mode remains usable.

The worker used the optional `BURROW_TOOLCHAIN` path supported by `scripts/toolchain.mjs` to install dependencies outside the repository. Normal `npm ci` needs no special variable. No dependency tree, package cache, browser binary, or registry archive is part of this delivery.

## Play a shift

1. **Start shift** uses live wheel data. **Play practice** uses a labelled bundled fixture and separate progress. If a shift is unfinished, its start action resumes it.
2. Start with **9 reserve power**, **58 warmth**, **56 garden health**, and **62 tunnel stability**. Maximum power is 12; conditions range from 0 to 100.
3. Each turn credits 0–4 wheel power once. Read the forecast, then allocate up to **3 power**, at most **2 per room**. Unspent power carries over. Spending nothing is allowed.
4. Each power unit gives **+18 warmth**, **+16 garden health**, or **+17 tunnel stability**. Care applies first, capped at 100; forecast losses apply next. The meters preview the exact result before committing.
5. Keep every condition **above zero** through turn six. Any zero ends the shift immediately. Outcomes, score, and the turn log explain what happened.

Level 1 loses 10 warmth, 9 health, and 8 stability per turn before weather. Level 2 adds 2 to each loss; level 3 adds 4. Weather adds 5 to warmth, garden, and tunnels on turns 1–3 respectively, then 6 to those same rooms on turns 4–6.

Starting a turn below 30 condition causes linked penalties: a dry garden adds 3 warmth loss; a cold nest adds 3 stability loss; weak tunnels add 3 garden health loss. These appear in the forecast. The same choices can have different consequences when the burrow is already struggling.

Winning unlocks the next level, up to level 3. Between shifts, spend one blueprint on each upgrade: **Moss lining** at level 1 reduces warmth loss by 2; **Rain cistern** at level 2 reduces garden loss by 2; **Root braces** at level 3 reduces tunnel loss by 2. Installed upgrades are fixed for a shift. Choose the next level in the workshop.

Score is `100 × completed turns + 2 × sum of final conditions + 25 × remaining power + 100 × level`, plus **500** for a win. The completed-turn term includes the final failed turn. Best scores and progression are separate for live and practice.

## Real Squeekchain connection

Verified against the [official API reference](https://docs.squeekchain.com/developers/api/) and its [status schema](https://docs.squeekchain.com/assets/api/status.json) and [events schema](https://docs.squeekchain.com/assets/api/events.json) on **2026-11-01**. Captured public measurements and provenance are preserved in [artifacts/api-observations.json](artifacts/api-observations.json). See [artifacts/api-research.md](artifacts/api-research.md) for the deployment-table discrepancy and calibration details.

| Public endpoint | Fields used | Purpose |
| --- | --- | --- |
| `https://api.squeekchain.com/v1/status` | `schemaVersion: 1`, `installationId`, `revision`, `generatedAt`, `oracle.state`; `measurement.freshness`, `observedAt`, `receivedAt`, `staleAfterSeconds`, `counterEpoch`, `cumulativeWorkUnits`, `provenance`, `coreStatus`, `rpmMilli`, `speedMmPerSecond`, `distanceMm` | Validate the wheel source; derive each turn’s power from its activity state and RPM. |
| `https://api.squeekchain.com/v1/events?category=protocol&limit=100` | `schemaVersion: 3`, `catalogVersion: public-activity-v4`, `status`, `reason`, `installationId`, `release.id`, `identities.core`, `chain.chainId`, `target`, `confirmations`, `safeThroughBlock`, `safeBlockTimestamp`, `events`, `nextCursor` | Obtain confirmed round events and catch up newer events after absence. |
| Settlement entries | `type: system.settlement_completed`, `eventVersion: 2`, stable `id`, `occurredAt`; `source.kind`, `chainId`, `releaseId`, `contractAddress`, `blockNumber`, `logIndex`, `transactionHash`, `confirmationStatus: safe`; `payload.previousSettledThroughRound`, `settledThroughRound` | Credit one blueprint per newly observed confirmed settlement. |

These are public, credential-free browser GET requests. Live mode currently observes **Sepolia, chain 11155111**, as served by the official API; it makes no transaction or RPC call. It validates the supported fields used by the game, ignores unused extra fields, and rejects unsupported versions or malformed consumed fields. It is not a general-purpose implementation of every field in the published schemas.

### Exact wheel conversion

For a fresh, accepted **hardware** measurement:

```text
if coreStatus != ACTIVE or rpmMilli == 0:
    newPower = 0
else:
    newPower = min(4, ceil(rpmMilli / 25000))

creditedPower = min(12, previousPower + newPower) - previousPower
```

`rpmMilli` is thousandths of RPM. The game awards one power per started 25 RPM band, capped at four. This is a game balancing rule, not Squeekchain’s work, SQK, or protocol power calculation. It samples the latest rate once per **game turn**; turns are not 600-second chain rounds. The same still-fresh observation can legitimately inform several fast game turns. This does not claim to conserve or issue physical work.

| Reading | Result |
| --- | --- |
| IDLE, even with a retained nonzero speed | 0 new power |
| ACTIVE at 25 RPM | 1 |
| ACTIVE at 50 RPM | 2 |
| ACTIVE at 77.005 RPM | 4 |
| Recorded hardware peak 111.256 RPM | 4 |

The API’s actual idle reading was 0 RPM. Its actual seven-day peak was 111,256 `rpmMilli`; captured hardware passage gaps were about 0.54–0.64 seconds in the first recorded segment. These observations informed the 25-RPM bands, four-power cap, 12-power capacity, and nine-power starting reserve. The test solver verified all three levels at the recorded active magnitude and level 1 with entirely idle input. A real unmodified-API six-turn idle game also won using only the reserve. No live active session was observed during validation; active and outage interaction scenarios used explicitly controlled test responses.

### Freshness and recovery

- The API declares measurement stale after 120 seconds since receipt. The game also checks observation age against 120 seconds, requires `freshness: online`, `provenance: hardware`, an accepted oracle, and a healthy counter. Dates over 15 seconds in the future pause live play to avoid a misleading clock.
- The game adds a **10-minute safe-block-time guard** for the confirmed event feed. This is a game policy, not an API-published expiry. It uses `chain.safeBlockTimestamp`, not `generatedAt`, to detect a frozen confirmation frontier.
- A 15-second poll refreshes visible pages; a one-second age guard and a pre-action check stop an expired reading from being used. Crediting a turn is idempotent and persisted: reload, source refresh, or reopening a shift does not refill it.
- HTTP errors, invalid JSON, HTTP-200 `unavailable` responses, unsupported schemas, stale data, or loss of persistent storage pause live runs. The reason and **Retry** control are visible. No turn is spent by a failed fetch. Requests time out after 8 seconds and honor `Retry-After`; there is no automatic fixture substitution.
- Practice has its own explicit mode banner and bundled scenario in `src/data/practice.json`. Its timing/order/activity states are designed fixtures; real measured magnitudes calibrate them. It starts with one practice blueprint. It never presents those values or credits as live.

### Confirmed rounds, exactly once

A safe `system.settlement_completed` event is a settled round range, including ranges with zero work. A mining checkpoint, optimistic block projection, measurement milestone, or oracle closure is not this event and earns no blueprint.

The first successful sync bootstraps from **only the latest safe settlement**, rather than awarding the deployment’s entire historical archive. Afterwards, new safe settlements each earn one blueprint. The app sorts them by BigInt `(blockNumber, logIndex)`, checks source chain/release/core identity against the envelope, and requires their block to be at or below `safeThroughBlock` with 12 confirmations. It saves the last position, stable event ID, and round in the same local-storage value as blueprint inventory. Duplicate entries, polls, refreshes, and game restarts cannot replay older positions.

Catch-up follows up to 10 additional cursor pages of 100 protocol events to reach the saved position; an excessive gap pauses rather than silently dropping events. The frontier is scoped by installation, chain, and core address. Clearing or corrupting browser storage starts a new local profile and therefore a new bootstrap; this is not a global account or an anti-cheat system.

## Saves and controls

Mouse, keyboard (Tab, Enter, Space), and mobile touch all work. Native buttons, labelled steppers, condition meters, visible focus, and persistent turn feedback support the main flow. No timed gestures are required. Motion is limited to optional short press feedback and honors reduced motion.

One versioned local-storage record (`burrow-power:save:v1`) stores both profiles, resumable turns, installed upgrades, event positions, scores, and last-used mode. Validation rejects corrupt or unsupported saves and explains recovery. Unavailable storage keeps practice playable in memory and pauses live mode, because durable event deduplication would otherwise be impossible. In-memory progress is lost on refresh. Storage changes from other tabs are observed; use one active tab to avoid simultaneous-write conflicts.

## Validation actually run

All results are worker observations, not independent certification. The final report and evidence are in [artifacts/validation.md](artifacts/validation.md).

| Check | Actual result |
| --- | --- |
| Production `npm run build` | Passed; complete relative-URL export in `dist/`. |
| `npm run typecheck` | Passed. |
| `npm test` | 29 tests passed. |
| `npm run test:browser` | 29 scenarios passed; recorded in `artifacts/browser-results.json`. Includes desktop six-turn active scenarios, mobile six-turn idle game, six-turn practice, and WebKit practice. |
| `node scripts/live-check.mjs` | Passed against the real API without interception: six idle turns, zero wheel power, real confirmed round 860, one blueprint. |
| `node scripts/keyboard-check.mjs` | Passed: all six practice turns with Tab/Enter only while API requests were aborted. |
| Pinned `taste.mjs --out test/scratch/taste` | 16 of 16 checks passed at 320, 390, and 1440. |

The browser scenarios include fresh active input, idle input, stale observations, outages, HTTP 503, malformed/unsupported status and event data, non-hardware provenance, unavailable event feeds, duplicate/new safe events, reload, restart, corruption, blocked storage, controls, failure/success, upgrades, routing, reduced motion, local font loading, and overflow. Axe checks on rules and Play found no serious/critical violations. Reflow was checked at 320, 390, 720, 940, and 1440 CSS pixels. Browser mobile emulation is not a physical-device test; neither native screen-reader sessions nor browser-native 200% zoom were run.

## Delivery and limitations

- Full source, lockfile, runtime assets, tests, design documentation, and production `dist/` are included. `DESIGN.md` describes the implemented design system.
- The game needs the public API for live runs, but no backend of its own. It does not keep a service-worker offline cache; after loading, practice does not depend on live measurements. An offline static server can serve the bundled practice game.
- The official API is under active development. A new schema/catalog version, non-hardware deployment, or changed freshness rules can require a client update. The live endpoint’s self-described current deployment differs from the older published deployment table; the game validates internally consistent API event identities and never prepares transactions. Details are in the research record.
- Browser-local progress is not portable across devices, profiles, origins, or cleared storage. No global leaderboard or shared persistence is implied.
- **Public GitHub publication was not performed by this worker.** No GitHub publishing connector or `gh` executable was available, and no repository URL is invented. The static export and source are ready for the assignment’s submission/publishing plane. No Git metadata, GitHub configuration, or account credentials were accessed or modified.

Manrope is bundled under its [SIL Open Font License](public/licenses/Manrope-OFL.txt). React’s [MIT notice](public/licenses/React-MIT.txt) is retained with the export. The pinned Better Interface guidance is by Jakub Krehel (MIT); its documentation method is adapted from Paul Bakaus’s Impeccable (Apache-2.0). Their notices are retained in `licenses/Design-guidance.txt`.
