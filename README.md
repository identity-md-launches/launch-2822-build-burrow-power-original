# Burrow Power

**Small paws. Big night.** Protect Pip’s underground home through six illustrated encounters. Each threat gives you three responses: spend power on protection, improvise at another room’s expense, or accept damage to bank power. See the room changes immediately, then decide when to face the next encounter.

The redesigned game, original LED habitat artwork, source, existing dependency lockfile, and complete static export are included. Points, power and blueprints are **local game progress**, not SQK, tokens, or financial rewards. No wallet, onchain score, signing, contract change or deployment is implemented.

## Install, preview and rebuild

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
```

To check and reproduce the production export:

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

Serve `dist/` over HTTP; do not open it with `file:`. The existing Vite toolchain sets `base: './'`. The export includes relative JavaScript, CSS, font, favicon and social-card URLs. `#burrow` and `#play` need no server rewrites. The interaction suite serves it under `/preview/` to test a gateway subpath.

This assignment retained `package.json`, `package-lock.json`, `tsconfig.json` and the existing build toolchain configuration. To respect the restriction on repository dependency directories, the worker installed the declared tools outside the repository and used the existing `BURROW_TOOLCHAIN` option. No dependency tree, package cache, browser binary or vendored registry is included.

## Play the night

1. Choose **Practice** or **Real wheel**, then **Protect the burrow**. Practice is the default so a first game does not depend on a network request. An unfinished shift resumes.
2. Start with **9 power** and **64/100 in each room**. Each encounter credits its wheel/practice power once. Capacity is 16; unspent power carries over.
3. Read the threat and choose one response. Protection costs 2 power. An improvised response costs 1 and harms another room. Salvaging costs 0, accepts the threat’s damage and adds up to 2 power, subject to bank space. The numbers shown are the **exact net condition changes**, including damage, care and the 0–100 cap. Hover or focus previews the resulting room conditions.
4. The outcome shows the chosen response, before/after conditions and remaining power. **Next encounter** advances only when you choose it.
5. Keep every room above **0** through encounter **6** to win. Any room at 0 ends the shift. Winning unlocks the next hollow. Restart asks for confirmation and preserves long-term progress.

| Hollow             | Challenge                                                               |
| ------------------ | ----------------------------------------------------------------------- |
| The first burrow   | Cold, thirst, falling stones, moths, flooding and one last tremor.      |
| The flooded hollow | Six different flood encounters; a garden below 40 adds 5 tunnel damage. |
| The faultline      | Six aftershock encounters; tunnels below 40 add 4 damage to every room. |

Each level has six authored encounters. Baseline encounter damage is 27 to the threatened room and 6 to the others, plus 2 per deeper level. Protection supplies 38 care to the target. Improvisation supplies 29 care to the target and costs 8 condition in the next room in the nest → garden → tunnels cycle. Salvaging supplies no care. Installed upgrades reduce their own room’s damage by 3.

All three hollows can be completed with an entirely idle wheel and no upgrades. Continual neglect loses the first hollow on encounter 4. Practice’s designed gains are `[0, 1, 0, 0, 1, 0]`; a simple “take the first affordable response” strategy wins all three levels. First-level reserve-only playthroughs and harder-level solutions are verified by the game tests.

Score: `100 × completed encounters + 2 × remaining room conditions + 25 × remaining power + 100 × level + 500 for a win`. Best score, wins, unlocks and upgrades are separate for practice and real wheel play.

## How Squeekchain changes play

The app retains the official public, credential-free API integration in `src/api.ts`, checked against the [official API reference](https://docs.squeekchain.com/developers/api/).

| Read                                                                | What the game uses                                                                                             |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `https://api.squeekchain.com/v1/status`                             | Status schema 1, accepted oracle, hardware provenance, observation/receipt freshness and activity/RPM.         |
| `https://api.squeekchain.com/v1/events?category=protocol&limit=100` | Event schema 3 and catalog `public-activity-v4`; safe Sepolia `system.settlement_completed` events, version 2. |

A fresh hardware reading with `coreStatus: ACTIVE` generates `min(4, ceil(rpmMilli / 25000))` local power at the start of an encounter. `rpmMilli` is thousandths of RPM. Idle, zero-rate and faulted data never generate active power. This is a game balancing rule, not the protocol’s work or SQK issuance calculation. The same still-fresh reading may inform several quick turns; the game does not claim to meter cumulative physical work.

Both wheel timestamps must be no more than 120 seconds old. The confirmed feed’s safe block timestamp must be no more than 10 minutes old. Unsupported versions, malformed consumed fields, simulated/replay/derived provenance, unavailable feeds and failed requests pause real wheel play without spending an encounter or power. Polling is every 15 seconds while visible, with a one-second freshness check and another check immediately before an action. HTTP 429/503 `Retry-After` is respected. No practice fallback is substituted into real wheel play.

The hamster and wheel animate only for fresh, accepted **real hardware activity in Real wheel mode**. They rest for idle readings. Stale/unavailable/unsupported data have explicit labels. Practice uses the labelled fixture in `src/data/practice.json`, keeps separate saves and always leaves the wheel still. Reduced-motion preferences and the visible motion control stop wheel animation.

New safe settlements unlock local blueprints. The first sync credits only the most recent eligible event; persisted deployment-scoped block/log watermarks deduplicate refreshes and subsequent pages. Each upgrade costs 1 blueprint and installs between shifts. Practice starts with 1 blueprint and awards 1 per win; practice never creates real-wheel blueprints. Storage denial permits session-only practice and disables real-wheel unlock tracking.

The official endpoint currently serves a different core identity from the documentation’s published deployment record. The game preserves its existing API-scoped identity checks and does not claim independent RPC verification. See [API research and limitations](artifacts/api-research.md). No contract identity or transaction flow was guessed.

## Saving and controls

Progress saves locally under `burrow-power:save:v2`. Valid allocation-era v1 profiles and settlement watermarks migrate; old active allocation turns are left in their original key because their rules differ. New encounter runs, including the outcome phase, resume without crediting power twice. Clear browser storage to clear local progress. Another tab’s save updates are observed.

All actions work with **Tab, Enter and Space**. Help and restart use native modal dialogs; Escape closes them and focus returns to the trigger. Response focus provides the same preview as hover. Results announce through a polite live region. Color is supported by names, numbers, condition text and hazard shapes. There are no timers requiring fast reactions.

## Validation

Run browser checks after a production build:

```sh
npx playwright install chromium webkit
npm run test:browser
node scripts/live-check.mjs
node scripts/check-export.mjs
```

Browser binaries/native dependencies must be available. `scripts/keyboard-check.mjs` is a historical entry point into the interaction suite. To regenerate the included social card from the production artwork, run `node scripts/create-share.mjs`, then rebuild.

Actual worker results:

- Production build and TypeScript check passed; **30 unit/API/storage tests passed**.
- Chromium at 1440px and 390px completed all **18 encounters across three hollows**. Keyboard-only play completed a six-encounter game.
- Unmodified official API games at both widths won all six encounters using actual idle readings: **0 new wheel power**; safe settlement unlocks were observed. Active-animation/power cases were tested with explicitly intercepted fixtures, not claimed as observed live activity.
- Primary flows include save/resume, an earlier-hollow resume after later unlocks, loss/retry, confirmation, upgrades, mode separation, blocked storage, stale time passage, non-hardware rejection and rate limiting.
- Automated accessibility checks found **0 violations** on home, encounter and result. Responsive/reduced-motion checks cover 320, 390, 768 and 1440px. The pinned design probe passed **16/16**; the start action and first response fit the 390×844 screen.
- **WebKit/Safari could not be run** because the native browser runtime was unavailable. Physical devices, manual screen-reader use, real browser zoom, alternate locales and prolonged soak testing were not performed.

Detailed results, source findings and six-domain review coverage are in [artifacts/validation.md](artifacts/validation.md), [browser-validation.json](artifacts/browser-validation.json), [live-validation.json](artifacts/live-validation.json) and [DESIGN.md](DESIGN.md). Screenshots are included under `artifacts/screenshots/`. These are worker observations, not an independent certification.

## Repository and publication status

Repository: https://github.com/identity-md-launches/launch-2822-build-burrow-power-original/

Requested hosting name: `burrow-power-a-hamster-powered-s.identitymd.eth`.

**New PR URL: unavailable. New deployed-site URL: unavailable.** No authenticated GitHub or IMD publishing connector was provided, and the GitHub browser displayed Sign in. The assignment also prohibits touching `.git/` and using IMD CLI commands. Source and `dist/` are delivered in the workspace; no new remote commit, PR or hosted version is claimed. [artifacts/PULL_REQUEST.md](artifacts/PULL_REQUEST.md) contains the prepared review description; [artifacts/publication.json](artifacts/publication.json) records `null` for the missing remote results.

An authenticated repository/publishing runner can submit these source files and the complete `dist/` to the existing repository, open a PR against `main`, and publish that export under the existing hosting name. No rebuilding service or private backend is required by the export. Nothing was fabricated to fill the publication or browser-verification gaps.

Design guidance attribution and licenses remain in `licenses/Design-guidance.txt`; font and React notices are included with the public assets.
