# Burrow Power design system

## Overview

Burrow Power is a single-player survival game for Squeekchain players. Its visual idea is a small underground home drawn in LED dots: amber nest, lime garden, violet tunnels and a teal hamster wheel. The habitat carries the atmosphere; a separate encounter panel carries the decision. The player sees a threat, picks a response and gets a deliberate result beat before the next encounter.

Source of truth: `src/styles.css`, `src/components/BurrowScene.tsx`, `src/components/Icon.tsx`, `src/App.tsx` and `src/game.ts`. The existing React/TypeScript stack, locally bundled Manrope font and static Vite build are retained. This describes the implemented redesign, not a proposal.

## Colors

Semantic tokens are defined in `src/styles.css:8`, using the existing project’s hex notation and a single dark theme.

| Token            | Value     | Job                                                 |
| ---------------- | --------- | --------------------------------------------------- |
| `--bg`           | `#0c1515` | Page background                                     |
| `--surface`      | `#121f20` | Encounter panel and dialogs                         |
| `--raised`       | `#1b2c2b` | Quiet elevated controls                             |
| `--hover`        | `#233a35` | Response and secondary-control hover                |
| `--line`         | `#304743` | Structural separators and habitat edge              |
| `--text`         | `#f1f2e9` | Primary text                                        |
| `--muted`        | `#a8bbb3` | Supporting text and labels                          |
| `--accent`       | `#cff58b` | Primary action, positive deltas, completed progress |
| `--accent-hover` | `#e0ffac` | Primary action hover                                |
| `--accent-ink`   | `#172017` | Text/icons on the primary fill                      |
| `--warm`         | `#ffc576` | Nest identity                                       |
| `--garden`       | `#b6ef6a` | Garden identity                                     |
| `--tunnel`       | `#b9a0ff` | Tunnel identity                                     |
| `--danger`       | `#ffb08c` | Damage, dangerous responses and data interruptions  |
| `--fresh`        | `#83e4c9` | Available real wheel source                         |
| `--focus`        | `#e6ffb9` | Keyboard perimeter                                  |

`.system-heat`, `.system-water` and `.system-repair` set `--room-color` for reusable room components. Every condition also has words, numbers or an icon. The artwork owns additional soil/sky/plant colors inside its SVG; they are illustration values, not additional status meanings.

The pinned rendered probe found all measured interface text above WCAG’s 4.5:1 threshold, or 3:1 for large text. Identified computed pairs and their ratios are in `artifacts/rendered-measurements.json`. That does not establish contrast for every decorative LED dot or SVG label. Essential room information is repeated in interface text outside the artwork.

## Typography

The UI uses `Manrope, Arial, sans-serif`. `src/assets/manrope-latin.woff2` is served locally through `@font-face` with `font-display: swap`, declaring weights 400–700. The interface uses **400, 600 and 700**. The browser measurement checks that the Manrope face loaded. The retained font license is `public/licenses/Manrope-OFL.txt`.

| Token       | Size | Role                                                |
| ----------- | ---- | --------------------------------------------------- |
| `--small`   | 12px | Supporting labels, data provenance, compact effects |
| `--label`   | 14px | Controls, response names, supporting game copy      |
| `--body`    | 16px | Desktop prose and body copy                         |
| `--section` | 24px | Section headings and mobile encounter titles        |
| `--title`   | 32px | Encounter titles, mobile opening headline           |
| `--display` | 64px | Wide-screen opening headline and local score        |

Heading line height is 1.15, default body 1.5, story text 1.6 and expanded reference copy 1.7. Large headings use negative tracking (`-.055em` opening headline, `-.035em` encounter title); body tracking stays natural. Changing power, room values and score use tabular numbers. Labels wrap rather than truncate. Room values move to a consistent second line on phones. The LED scene uses 24-unit SVG labels which scale with the artwork; those are not extra UI font-size steps.

## Layout

`.app-shell` caps at 1408px with 48px inline padding. Main spacing steps are 8, 12, 16, 20, 24, 32 and 48px, with smaller optical adjustments in icons and LED art. `.game-layout` is a two-column grid: `minmax(0,1.75fr)` habitat and `minmax(350px,1fr)` encounter panel with a 24px gap. Below 1150px the ratio becomes 1.45:1 with a 330px panel minimum and 20px gap. At 860px the game becomes one column.

At 540px and below, page gutters are 16px, panels use 16px padding and 12px radii, and the initial start action moves directly below the mode switch and mission heading. The three hollow controls become rows. During mobile play the duplicate habitat title is hidden, SVG height becomes 172px, and the scene/panel gap is 12px. This preserves the room conditions and first response within the 390×844 initial play viewport. At 360px, gutters become 12px and secondary text wraps further.

The header keeps the product at the leading edge and How to play at the trailing edge. It is not sticky. Supporting workshop/source information uses explicit native disclosures below the main game. No essential action is hidden in those disclosures. The habitat scales with its SVG viewBox rather than using a raster background.

The production interaction suite checked home, encounter and result at 320, 390, 768 and 1440px with no horizontal overflow. Native browser zoom, alternate language expansion and RTL were not verified; these remain review limits rather than claims of support.

## Elevation & Depth

The interface is flat: tonal panels, deliberate space and structural borders, with no persistent card shadows. The habitat has a 1px outline; choices use borders to communicate their response surface and focus. Native modal dialogs create the only raised overlay, using a dark backdrop and 5px backdrop blur.

LED paths and room fills establish depth inside the scene. A helped room receives a finite brightness flash; power received gets a short highlight. These are state feedback, not perpetual decoration. The HUD and result text carry the same information when motion is reduced.

## Shapes

World and encounter panels use 16px radii, reduced to 12px on phones. Primary/secondary controls use 9px; response and level controls use 10px. The mode switch has a 9px container with 6px inner segments. Dialogs use 18px. Encounter progress is circular. Decorative dots, segmented condition lights and the pixel hamster are intentionally rounded LED shapes.

Controls use a 2px `--focus` outline with 4px offset. Primary buttons are at least 48px tall; the mode buttons and text actions are at least 44px. The final probe found no first-screen controls below the 44px comfort target at 390px.

## Components

| Component/pattern           | Source                                                   | Behavior and reuse                                                                                                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Habitat                     | `src/components/BurrowScene.tsx:71`                      | `systems`, `mode`, `active`, `event`, `selected`, `deltas`, `resolved`, `won`, `lost`, `motion`, `wheelLabel`. Renders original dot art, threat shapes, condition damage, previews and results. `active` must come from accepted fresh real hardware data. |
| Room conditions             | Same component; `.room-statuses` in `src/styles.css:326` | Room name/icon, exact condition or preview, LED segments and a text condition. Color variables follow the room. Below 25 is dangerous; 0 is lost; 25–49 needs care.                                                                                        |
| Encounter choices           | `src/App.tsx:729`; `.response-choice`                    | Native buttons showing action, power cost/gain, description and exact net room changes. Hover and keyboard focus preview the habitat. Unaffordable or paused actions are disabled; dangerous responses explicitly name rooms that will reach 0.            |
| Outcome and result          | `src/App.tsx`; `.outcome-list`, `.score-display`         | Before/after room values, response feedback, remaining power and a separate next action. Final screens distinguish win/loss and label local points. State changes focus the encounter/result heading and update a stable polite status region.             |
| Night progress              | `src/App.tsx:462`; `.night-progress`                     | Labelled group describes completed encounters out of six. Decorative markers are hidden from assistive technology; checkmarks distinguish completed stops.                                                                                                 |
| Modes and saves             | `src/App.tsx`, `src/storage.ts`                          | Native pressed-state buttons. Practice and real progress remain separate. v1 profiles/watermarks migrate, while old incompatible active turns remain in the old key. Storage loss explains session-only practice.                                          |
| Workshop and source details | `src/App.tsx`; `.workshop`, `.source-details`            | Native `details/summary`; available blueprints, install restrictions, API observations, data error and retry are disclosed on demand. Upgrades cannot install during an active shift.                                                                      |
| Help/restart dialogs        | `src/App.tsx`; `dialog`                                  | Native `showModal()` gives modal focus containment and an inert background. Escape closes; close restores the trigger. Restart names what resets and what stays saved.                                                                                     |
| Buttons and icons           | `src/styles.css:524`, `src/components/Icon.tsx`          | One primary action per phase, quiet secondary controls, shared current-color outline icons and original hamster mark. Preserve hover, disabled, keyboard and press states.                                                                                 |

Motion is defined in `src/styles.css:1671` and only enabled under `prefers-reduced-motion: no-preference`. The real wheel rotates over 2s; Pip’s running motion alternates over .3s. Both require the real-activity class. Hover/press transitions are 120ms with `cubic-bezier(.2,0,0,1)`; press scale is .96. Feedback uses finite .25–.7s sequences. Reduced motion disables all animations/transitions. The footer’s motion control also pauses wheel/hamster motion. A source becoming stale stops movement immediately on the freshness tick.

## Do’s and Don’ts

- Extend a hollow in `src/game.ts` with a named encounter, explicit damage and three concrete responses. Compute preview and result through the same rule; never hand-copy an expected outcome into the UI.
- Reuse the encounter panel, room variables, six text sizes and original LED habitat. Keep the action beside the threat and the exact effects beside the action.
- Keep fresh hardware, idle, unavailable/stale, and practice states visibly distinct. Do not animate a practice or unknown wheel, generate random “live” power, or imply blueprints are tokens.
- Preserve the deliberate next-encounter beat and explicit loss warning. Do not restore the old allocation steppers or make the habitat secondary to a resource form.
- Keep local progress labelled local. Use the existing public read-only API; adding wallets, transactions or a shared leaderboard would be new scope.
- For another page, start inside `.app-shell`, reuse the header and native disclosures, add a deliberate hash destination if necessary, and repeat the phone-first action/overflow check. Use `DESIGN.md` as implementation documentation, not as evidence that a new feature has been tested.

Guidance: Jakub Krehel’s Better Interface (MIT); documentation method adapted from Paul Bakaus’s Impeccable (Apache-2.0). Retained attribution and licenses: `licenses/Design-guidance.txt`.
