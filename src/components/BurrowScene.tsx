import { useId } from "react";
import {
  condition,
  SYSTEMS,
  SYSTEM_NAMES,
  type Encounter,
  type System,
  type Values,
} from "../game";
import { Icon } from "./Icon";
const HAMSTER = [
  "    aaa         aaa    ",
  "   aabba       abbaa   ",
  "   aabbaaaaaaaaabbaa   ",
  "   aaaaaaaaaaaaaaaaa   ",
  "  aaaaacaaaaaaacaaaaa  ",
  " aaaaacccaaaaacccaaaaa ",
  " aaaaaacaaaaaaacaaaaaa ",
  " aaddaaaaaabaaaaaaddaa ",
  " addddaaaabbbaaaadddda ",
  " aaddaaaaaabaaaaaaddaa ",
  "  aaaaaadddddddaaaaaa  ",
  "   aaaadddddddddaaaa   ",
  "    aaadddddddddaaa    ",
  "     aaaaaaaaaaaa     ",
  "      aaa    aaa      ",
];
function Sprite({
  rows,
  x,
  y,
  step = 5,
}: {
  rows: string[];
  x: number;
  y: number;
  step?: number;
}) {
  const palette: Record<string, string> = {
    a: "#ffd17c",
    b: "#fa8d82",
    c: "#30212a",
    d: "#fff0cb",
  };
  return (
    <g>
      {rows.flatMap((row, j) =>
        [...row].map(
          (v, i) =>
            palette[v] && (
              <rect
                key={`${i}-${j}`}
                x={x + i * step}
                y={y + j * step}
                width={step * 0.78}
                height={step * 0.78}
                rx={step * 0.22}
                fill={palette[v]}
              />
            ),
        ),
      )}
    </g>
  );
}
const COLORS: Record<System, string> = {
  heat: "#ffc576",
  water: "#b6ef6a",
  repair: "#b9a0ff",
};
export function BurrowScene({
  systems,
  active = false,
  mode,
  event,
  selected,
  deltas,
  resolved = false,
  won = false,
  lost = false,
  motion = true,
  wheelLabel = "Wheel is resting",
}: {
  systems: Values;
  active?: boolean;
  mode: "live" | "practice";
  event?: Encounter;
  selected?: Values;
  deltas?: Values;
  resolved?: boolean;
  won?: boolean;
  lost?: boolean;
  motion?: boolean;
  wheelLabel?: string;
}) {
  const id = useId().replace(/:/g, "");
  const room = (s: System) =>
    `room room-${s} ${systems[s] < 25 ? "room-danger" : systems[s] < 50 ? "room-worn" : ""} ${event?.target === s && !resolved ? "room-threatened" : ""} ${resolved && deltas && deltas[s] > 0 ? "room-helped" : ""}`;
  const danger = event?.target;
  return (
    <div
      className={`habitat ${active && motion ? "wheel-active" : ""} ${resolved ? "habitat-resolved" : ""} ${won ? "habitat-won" : ""} ${lost ? "habitat-lost" : ""}`}
    >
      <div className="habitat-caption">
        <span>
          <i className="led" /> Pip’s little world
        </span>
        <span>
          {won
            ? "Morning, little one"
            : lost
              ? "A new night awaits"
              : "Somewhere below the surface"}
        </span>
      </div>
      <svg
        className="habitat-art"
        viewBox="0 0 1000 650"
        role="img"
        aria-label={`Pip the hamster ${active ? "running in a wheel powered by fresh real Squeekchain activity" : "resting beside a still wheel"}. Nest ${condition(systems.heat)}, garden ${condition(systems.water)}, tunnels ${condition(systems.repair)}.`}
      >
        <defs>
          <pattern
            id={id + "soil"}
            width="13"
            height="13"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="6" cy="6" r="1" fill="#24413b" />
          </pattern>
          <pattern
            id={id + "led"}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="3" cy="3" r="1.9" fill="white" />
          </pattern>
          <mask id={id + "dots"}>
            <rect width="1000" height="650" fill={"url(#" + id + "led)"} />
          </mask>
          <linearGradient id={id + "sky"} x2="0" y2="1">
            <stop stopColor={won ? "#122c2b" : "#0e171e"} />
            <stop offset="1" stopColor="#101b1b" />
          </linearGradient>
        </defs>
        <rect width="1000" height="650" fill={"url(#" + id + "soil)"} />
        <path
          d="M0 0H1000V108L950 100 880 110 810 96 730 108 650 98 550 108 430 99 330 109 220 99 110 107 0 100Z"
          fill={"url(#" + id + "sky)"}
        />
        <path
          d="m0 101 110 6 110-8 110 10 100-10 120 9 100-10 80 10 80-12 70 14 70-10 50 8"
          fill="none"
          stroke="#43785b"
          strokeWidth="4"
          strokeDasharray="1 7"
          strokeLinecap="round"
        />
        {[85, 172, 260, 350, 710, 810, 920].map((x, i) => (
          <g
            key={x}
            stroke={i % 2 ? "#b6ef6a" : "#507c5d"}
            strokeWidth="3"
            strokeDasharray="1 5"
            strokeLinecap="round"
          >
            <path d={`M${x} 103v-25m0 11-10-8m10 13 9-10`} />
          </g>
        ))}
        {[70, 145, 312, 681, 760, 892, 940].map((x, i) => (
          <path
            key={x}
            d={`M${x} ${25 + (i % 3) * 13}v7m-3-4h7`}
            stroke="#79a49c"
            strokeWidth="2"
          />
        ))}
        <path
          d="M850 20a19 19 0 1 0 22 23c-15 5-27-7-22-23Z"
          fill={won ? "#ffd17c" : "#bdcbe0"}
          mask={"url(#" + id + "dots)"}
        />
        <path
          d="M480 105v49m40-49v49"
          stroke="#477669"
          strokeWidth="4"
          strokeDasharray="1 7"
          strokeLinecap="round"
        />
        <path
          d="M468 105V82h64v23m-72-23 40-24 40 24"
          fill="#162b26"
          stroke="#9bcf9e"
          strokeWidth="3"
          strokeDasharray="1 5"
          strokeLinecap="round"
        />
        <path
          d="M340 337h70m182-22h67M500 405v55m-250-12v71h114m386-98v98H636"
          fill="none"
          stroke="#20352f"
          strokeWidth="39"
          strokeLinejoin="round"
        />
        <path
          d="M340 337h70m182-22h67M500 405v55m-250-12v71h114m386-98v98H636"
          fill="none"
          stroke={active ? "#70e6cb" : "#527766"}
          strokeWidth="3"
          strokeDasharray="1 8"
          strokeLinecap="round"
        />
        {active && (
          <g className="power-particles" fill="#a8f5d3">
            <circle cx="368" cy="337" r="4" />
            <circle cx="625" cy="315" r="4" />
            <circle cx="500" cy="440" r="4" />
          </g>
        )}
        <g className={room("heat")}>
          <path
            d="M58 346c0-99 56-146 155-146s155 47 155 146v55c-56 57-258 58-310 0Z"
            fill="#241e20"
            stroke={COLORS.heat}
            strokeWidth="3"
            strokeDasharray="1 7"
            strokeLinecap="round"
          />
          <path
            d="M76 354c0-80 47-130 136-130s135 50 135 130"
            fill="none"
            stroke="#634737"
            strokeWidth="5"
            strokeDasharray="2 11"
            strokeLinecap="round"
          />
          <path
            d="M115 383q98-53 198 0l-22 29H138Z"
            fill="#61422c"
            mask={"url(#" + id + "dots)"}
          />
          <path
            d="M126 388q87-32 175 0"
            fill="none"
            stroke="#ffc576"
            strokeWidth="8"
            strokeDasharray="2 6"
            strokeLinecap="round"
          />
          <path
            d="M148 367q0-33 62-33t62 33Z"
            fill="#e5ab67"
            mask={"url(#" + id + "dots)"}
          />
          <path
            d="M165 349h90m-95 8h100"
            stroke="#ffe2a1"
            strokeWidth="4"
            strokeDasharray="2 7"
          />
          <path
            d="M161 335v26m24-26v26m24-26v26m24-26v26m24-26v26"
            fill="none"
            stroke="#d19e6c"
            strokeWidth="3"
          />
          <path
            d="M108 280h22v28h-22zm11-41v41m-15 7h30"
            stroke="#e9af64"
            strokeWidth="3"
            fill="#513525"
            mask={"url(#" + id + "dots)"}
          />
          <text x="213" y="257" fill={COLORS.heat} textAnchor="middle">
            The nest
          </text>
          {systems.heat < 50 && (
            <path
              d="m90 338 28-10-15 28 25-7m186-20 20 4-17 26"
              fill="none"
              stroke="#7fbbdf"
              strokeWidth="4"
              strokeDasharray="2 7"
            />
          )}
        </g>
        <g className={room("water")}>
          <path
            d="M651 338c0-94 59-145 148-145s149 51 149 145v62c-62 54-237 54-297 0Z"
            fill="#182720"
            stroke={COLORS.water}
            strokeWidth="3"
            strokeDasharray="1 7"
            strokeLinecap="round"
          />
          <path
            d="M677 389h247m-229 15h211"
            fill="none"
            stroke="#648b45"
            strokeWidth="6"
            strokeDasharray="2 8"
            strokeLinecap="round"
          />
          {[718, 797, 875].map((x, i) => (
            <g
              key={x}
              className={systems.water < 35 ? "plant-drooping" : ""}
              style={{ transformOrigin: `${x}px 385px` }}
            >
              <path
                d={`M${x} 385v-${65 + (i % 2) * 30}`}
                stroke="#9fe568"
                strokeWidth="5"
                strokeDasharray="2 6"
                strokeLinecap="round"
              />
              <path
                d={`M${x} 348c-35 0-39-23-39-30 29 0 39 14 39 30zm0-7c34 0 38-24 38-31-29 0-38 15-38 31Z`}
                fill="#a2e36b"
                mask={"url(#" + id + "dots)"}
              />
              <path
                d={`M${x} ${317 - (i % 2) * 25}c-20-13-12-25 0-30 14 5 22 17 0 30Z`}
                fill={i === 1 ? "#ffd17c" : "#b6ef6a"}
                mask={"url(#" + id + "dots)"}
              />
            </g>
          ))}
          <text x="799" y="248" fill={COLORS.water} textAnchor="middle">
            The garden
          </text>
          {systems.water < 50 && (
            <path
              d="m695 410 18-11 14 9m96-3 17-6 14 10m-83-2-8 13"
              stroke="#ca9957"
              fill="none"
              strokeWidth="4"
            />
          )}
        </g>
        <g className={room("repair")}>
          <path
            d="M322 560v-28c0-97 356-97 356 0v28Z"
            fill="#201e30"
            stroke={COLORS.repair}
            strokeWidth="3"
            strokeDasharray="1 7"
            strokeLinecap="round"
          />
          {[356, 444, 532, 620].map((x, i) => (
            <g
              key={x}
              transform={
                systems.repair < 35 && i === 2
                  ? `rotate(12 ${x} 548)`
                  : undefined
              }
            >
              <path
                d={`M${x} 548v-51h47v51m-52-45 14-13m23 0 20 13`}
                fill="none"
                stroke={systems.repair < 25 ? "#db8992" : "#aa93d8"}
                strokeWidth="6"
                strokeDasharray="2 6"
                strokeLinecap="round"
              />
            </g>
          ))}
          <path
            d="M338 566h325"
            stroke="#b9a0ff"
            strokeWidth="3"
            strokeDasharray="1 8"
            strokeLinecap="round"
          />
          <text x="500" y="603" fill={COLORS.repair} textAnchor="middle">
            The tunnels
          </text>
          {systems.repair < 50 && (
            <path
              d="m478 473 12 14-14 11 15 9m-109 46 12-6m207 11 10-8 7 7"
              fill="none"
              stroke="#efb1a0"
              strokeWidth="4"
            />
          )}
        </g>
        <g className="wheel-assembly">
          <path
            d="m450 391-17 29h134l-17-29"
            fill="none"
            stroke="#669185"
            strokeWidth="5"
            strokeDasharray="1 7"
            strokeLinecap="round"
          />
          <circle
            cx="500"
            cy="300"
            r="107"
            fill="#102725"
            stroke="#65d6c1"
            strokeWidth="5"
            strokeDasharray="2 7"
            strokeLinecap="round"
          />
          <g className="wheel-spokes">
            <circle
              cx="500"
              cy="300"
              r="94"
              fill="none"
              stroke="#2c695d"
              strokeWidth="4"
              strokeDasharray="1 8"
              strokeLinecap="round"
            />
            {[0, 45, 90, 135].map((a) => (
              <path
                key={a}
                d="M407 300h186"
                transform={`rotate(${a} 500 300)`}
                stroke="#2d6257"
                strokeWidth="3"
                strokeDasharray="1 6"
                strokeLinecap="round"
              />
            ))}
          </g>
          <g className="wheel-hamster">
            <Sprite
              rows={
                active
                  ? HAMSTER
                  : HAMSTER.map((row, j) =>
                      j === 4 || j === 6 ? row.replaceAll("c", "a") : row,
                    )
              }
              x={432}
              y={259}
              step={6}
            />
          </g>
          <circle cx="500" cy="300" r="5" fill="#ddf7d6" />
        </g>
        {!active && (
          <g fill="#9cb7ad">
            <text x="586" y="213" className="sleep-z">
              z
            </text>
            <text x="604" y="195" className="sleep-z">
              z
            </text>
          </g>
        )}
        {event && !resolved && (
          <g
            className={`hazard hazard-${event.hazard}`}
            transform={`translate(${danger === "heat" ? 205 : danger === "water" ? 795 : 500} ${danger === "repair" ? 457 : 180})`}
          >
            <path
              d="m0-22 24 41h-48Z"
              fill="#442d29"
              stroke="#ffb08c"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <path d="M0-10v13m0 6v2" stroke="#ffba96" strokeWidth="4" />
            {event.hazard === "cold" &&
              [-65, 65].map((x) => (
                <path
                  key={x}
                  d={`M${x} -4v28m-12-21 24 14m-24 0 24-14`}
                  stroke="#9adfff"
                  strokeWidth="3"
                />
              ))}
            {(event.hazard === "quake" || event.hazard === "rocks") &&
              [-60, 60].map((x) => (
                <path
                  key={x}
                  d={`m${x} 0 16 12-8 12-20-6Z`}
                  fill="#af97da"
                  mask={"url(#" + id + "dots)"}
                />
              ))}
            {event.hazard === "flood" && (
              <path
                d="M-70 30q18-16 36 0t36 0t36 0t36 0"
                fill="none"
                stroke="#8acbfa"
                strokeWidth="5"
              />
            )}
            {event.hazard === "moths" && (
              <path
                d="M-55 7c-35-35-40 20 0 8 35 35 40-20 0-8M55 7c-35-35-40 20 0 8 35 35 40-20 0-8"
                fill="#d5b4ff"
                mask={"url(#" + id + "dots)"}
              />
            )}
          </g>
        )}
        {won && (
          <g fill="#ffd17c">
            {[110, 300, 700, 885].map((x, i) => (
              <path
                key={x}
                d={`M${x} ${160 + (i % 2) * 40}v22m-11-11h22m-17-6 12 12m-12 0 12-12`}
                stroke="#ffd17c"
                strokeWidth="3"
              />
            ))}
          </g>
        )}
      </svg>
      <div className={`wheel-state ${active ? "is-running" : ""}`}>
        <span className="led" />
        {mode === "practice"
          ? "Practice · wheel at rest"
          : active
            ? "Real wheel · Pip is running"
            : `Real wheel · ${wheelLabel === "Wheel is resting" ? "Pip is resting" : wheelLabel.toLowerCase()}`}
      </div>
      <div className="room-statuses">
        {SYSTEMS.map((s) => {
          const next = selected?.[s],
            delta = deltas?.[s];
          return (
            <div
              key={s}
              className={`room-status system-${s} ${systems[s] < 25 ? "status-danger" : ""}`}
            >
              <div className="room-name">
                <Icon name={s} size={18} />
                <strong>{SYSTEM_NAMES[s]}</strong>
                <span>
                  {next === undefined ? systems[s] : `${systems[s]} → ${next}`}
                  <small>/100</small>
                </span>
              </div>
              <div className="health-dots" aria-hidden="true">
                {Array.from({ length: 10 }, (_, i) => (
                  <i
                    key={i}
                    className={
                      i < Math.ceil((next ?? systems[s]) / 10) ? "lit" : ""
                    }
                  />
                ))}
              </div>
              <div className="room-condition">
                {condition(next ?? systems[s])}
                {resolved && delta !== undefined && (
                  <span className={delta > 0 ? "positive" : "negative"}>
                    {delta > 0 ? "+" : ""}
                    {delta}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
