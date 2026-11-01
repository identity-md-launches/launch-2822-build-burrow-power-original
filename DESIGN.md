# Burrow Power design system

## Overview

Burrow Power is a quiet, dark strategy game for the Squeekchain community. Its visual idea is an underground habitat drawn as an LED dot cutaway: amber nest, green garden, and pale teal tunnels. The same three systems appear in the illustration, resource meters, forecast, and allocation controls. The scene is original SVG artwork built from circles and explicit sprite rows; it is not a screenshot of another game.

The interface is deliberately flat. One lime action advances the current task. Spacing, alignment, and restrained separators group information; illustration carries the atmosphere. The Burrow introduction places the product name, concise premise, live eligibility, and both start actions before the scene on mobile. Play puts decisions next to the habitat on desktop and below it in a single reading order on mobile.

Source of truth: `src/styles.css`, `src/components/BurrowScene.tsx`, `src/components/Icon.tsx`, and `src/App.tsx`. Build configuration is in `scripts/toolchain.mjs`. This document describes the final implementation, not proposed variants.

## Colors

The canonical system uses hex semantic properties in `src/styles.css:8`.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#10130f` | Page ground. |
| `--surface` | `#171c15` | Control panel, quiet icon backgrounds, practice banner. |
| `--raised` | `#1e251b` | Stepper controls and disabled main action. |
| `--hover` | `#293321` | Hovered stepper. |
| `--line` | `#30392b` | Structural separators, boundaries, unfilled meters. |
| `--text` | `#edf0e5` | Primary text. |
| `--muted` | `#a3ae99` | Descriptions and secondary labels. |
| `--subtle` | `#89957f` | Captions, future values, footer. |
| `--accent` | `#c7ee88` | Primary action fill, active progress, signature hero line. |
| `--accent-hover` | `#d7f7a4` | Primary hover. |
| `--accent-ink` | `#17200e` | Text/icons on the lime primary button. |
| `--warm` | `#e2b875` | Nest identity and pause/forecast emphasis. |
| `--garden` | `#b1d186` | Garden identity and positive feedback. |
| `--tunnel` | `#94bdb1` | Tunnel identity. |
| `--danger` | `#f5ad91` | At-risk and predicted-failure copy. |
| `--focus` | `#e0f6b8` | Keyboard focus perimeter. |

There is one dark theme with `color-scheme: dark`; no light-theme switch is implemented. System identity always has a name and icon in addition to hue. Warnings say why play paused and how to recover. Native meter values also remain available as numbers.

Special warning grounds are `#30271d` for storage recovery and `#2b241b` for live pause. The SVG owns its illustrative soil/room palette; those values are artwork, not additional UI status tokens.

Actual browser-computed pairs were measured in `artifacts/rendered-measurements.json`: body text/page **16.22:1**, muted description/page **8.08:1**, caption/page **5.94:1**, enabled primary ink/fill **12.82:1**, and loading-disabled primary **6.79:1**. The pinned probe found every measured entry-page text pair above its 4.5:1 (3:1 large) threshold. Artwork text and every hypothetical background combination were not comprehensively audited.

## Typography

`Manrope, Arial, sans-serif` is the only UI family. The bundled Latin WOFF2 is `src/assets/manrope-latin.woff2`, declared at 400–700 with `font-display: swap`. The interface actually uses **400, 600, and 700**. The browser check confirmed that the local font loaded. Font licensing is in `public/licenses/Manrope-OFL.txt` and the export.

The six tokens are `--small: 12px`, `--label: 14px`, `--body: 16px`, `--section: 24px`, `--title: 40px`, and `--display: 64px`. Captions/source metadata use 12; controls/descriptions use 14; reading copy uses 16; section headings and condition values use 24; Play/How to Play titles use 40 on desktop; the wide introduction uses 64. At most five sizes occur on the entry page at each measured width; there are six available across the whole product.

Headings use weight 600, balanced wrapping, and tighter line height. The brand is 700. The hero is 1.1 line-height and −0.055em tracking at 64px, changing to −0.04em at 40px. Section headings use 1.3 and −0.025em; body copy uses 1.65, with the field guide at 1.75 (1.7 mobile). Numeric power, conditions, score, and logs use tabular digits to prevent shifting. Native selects stay at 16px to avoid iOS input zoom. Reading content is limited to a 700px column; short descriptions have character-based measures.

SVG scene labels use 13px sans-serif as illustration lettering. They are not a second interface type scale; equivalent condition names and values are real HTML outside the scene.

## Layout

The shared `.app-shell` is at most 1440px with 64px inline padding. Above 1440 it allows 1568px with 96px padding. Padding becomes 40px at 1200, 24px at 720, and 16px below 360. Header, sections, and footer reuse these edges.

Spacing uses 4/8px for tightly related details and 16/24/32/40/48px between groups. Larger hero spacing is intentional: 76px above and 60px below at wide widths, reduced to 36px/28px on mobile. Avoid adding bordered wrappers around every group.

- **Introduction:** `.home-hero` has two flexible columns, copy and art, with 48px gap. At 720 it becomes one column, with the actions above the illustration. Both start actions are visible in the first 390×844 screen. Intro system descriptions are three columns on desktop and aligned icon/text rows on mobile.
- **Play:** `.game-layout` uses a flexible habitat column and a minimum-350px controls column. Meters share three columns on wide desktop, temporarily stack beside the narrow habitat at intermediate widths, then return to three compact columns in the mobile reading order. At 720 the scene is at most 210px high, followed by meters, controls, and feedback. The end-turn action stays in normal flow and is reachable by scrolling.
- **Workshop:** three upgrade columns become stacked rows at 720. The labelled level select wraps rather than overflowing.
- **Rules:** a 200px contents column, 64px gap, and maximum-700px reading column collapse to a wrapping contents list and one reading column. Anchor headings have scroll margin.
- **Disclosure:** the data-source details and shift log use native `details/summary`. Log tables can scroll inside their own clearly disclosed container; the page itself does not scroll horizontally.

Implemented breakpoints are 1200, 940, 720, and 359px, plus the very-wide 1441px branch. Rendered reflow was checked at 320, 390, 720, 940, and 1440 on all three pages. Text-spacing stress was also checked on mobile Play without page overflow. Very-wide desktop, browser-native 200% zoom, and RTL mirroring were not visually checked.

## Elevation & Depth

No drop shadows or gradient text are used. The controls panel and entry illustration have a 1px structural boundary. Habitat art on Play removes that outer boundary so the meters and scene read as one game surface. Soil dots and room tones create illustrative depth without adding interface elevation.

The header/footer and turn/forecast groups use separators. Errors use an amber-tinted ground and leading rule. There are no modals or focus traps. Restart confirmation is an inline replacement with explicit restart/cancel actions, keeping the choice in the normal tab order.

## Shapes

`--radius: 12px` is used for major bounded surfaces. Primary/secondary buttons and the practice banner use 8px; steppers/selects use 6px; the icon background uses 10px. Tiny meter/power segments use 2–3px. Scene dots and LED sprite dots are circles, while the product mark is a small dot hamster.

Text is not clipped or ellipsized. Only native meter graphics and screen-reader-only utility text intentionally use clipping. Controls remain distinct from static text. CSS geometry belongs to the interface; physical left/right coordinates inside the burrow SVG describe the artwork.

## Components

| Component/pattern | Source | API and behavior |
| --- | --- | --- |
| Primary/secondary action | `src/styles.css:212`; usages in `src/App.tsx` | `.button.primary` advances the task; `.button.secondary` is a peer action. Hover, disabled, keyboard focus, and optional pressed feedback are explicit. Standard actions are at least 48px high. |
| `Icon`, `HamsterMark` | `src/components/Icon.tsx` | One original SVG icon set. `Icon` takes `name` and optional `size`, uses `currentColor`, and is decorative to assistive technology. Meaning stays in the adjacent label. |
| `BurrowScene` | `src/components/BurrowScene.tsx:59` | Optional `systems`, `compact`, and `selected` allocation props. Room brightness reflects condition; the chosen rooms have emphasized boundaries. Its labelled SVG is illustrative, with actual meters outside. |
| `SystemMeter` | `src/App.tsx:1363` | Local pattern with `system`, `value`, and optional `next`. Icon/name, numeric condition, text status, native meter, and explicit after-turn preview. Risk includes words, not color alone. |
| Allocation row | `src/App.tsx`; `.allocation-row` at `src/styles.css:1028` | Native decrease/increase buttons with unique accessible names, labelled numeric output, visible unit cost/gain, and disabled states for power/turn/room limits. Desktop steppers are 34×40; mobile 40×44, with a 34px width on the smallest layout. |
| Mode toggle | `src/App.tsx`; `.mode-toggle` | Two native buttons with `aria-pressed`. Live and practice saves are independent; last-used mode survives refresh. Practice has a persistent fixture banner. |
| Turn feedback/result | `src/App.tsx`; `.turn-feedback` at `src/styles.css:900` | Stable polite status region, persistent numeric turn history, explicit success/failure and score. Result heading receives focus. Failure can be played again. |
| `SourceDetails` | `src/App.tsx:1405` | Native disclosure with `live`, `error`, `loading`, and `refresh` props. Shows real endpoint links, observation/check times, safe block, wheel state, reason, and retry. The direct observation line also appears near the current home status and credited live turn. |
| Save recovery/pause | `src/App.tsx:378`; `src/storage.ts` | Storage checks and parse validation never prevent practice from opening. Persistent recovery explanation, session-only disclosure, and disabled live interactions avoid falsely promising durable event tracking. |

All interactive controls have a 2px focus outline with 4px offset. Actual keyboard navigation produced a visible `--focus` ring around the stepper. The first focusable link skips to the current page’s main content without changing modes/routes. Native links remain links; action controls remain buttons. Page changes focus their heading.

Motion is limited to a 120ms transition of named properties with `cubic-bezier(.2,0,0,1)` and press scale 0.96. It exists only inside `prefers-reduced-motion: no-preference`. There is no autoplay or endless animation.

## Do’s and Don’ts

- Start another page inside `.app-shell` and the existing header/main/footer. Add a recognized hash route rather than a server-dependent pathname.
- Use the existing six type tokens and role colors. Match a new room/status with words and an icon as well as color.
- Keep one primary action for the current flow. Preserve concrete costs, predicted consequences, source time, and failure recovery near the controls they explain.
- Keep fixture information visibly labelled practice. An unavailable live source must pause play; a fixture must never silently replace it.
- Reuse native controls and disclosures. Preserve Tab/Enter/Space behavior and the focus perimeter. Check 320 and 390px before adding fixed dimensions.
- Let the LED illustration carry the atmosphere. Additional glows, gradients, card stacks, fonts, or dashboard chrome would compete with this system.

Design/review guidance: Jakub Krehel’s Better Interface (MIT). Documentation structure adapted from Paul Bakaus’s Impeccable (Apache-2.0). Attribution and licenses are retained in `licenses/Design-guidance.txt`; this product’s code/art were implemented independently for this assignment.
