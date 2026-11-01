import { useId } from "react";
import type { Values } from "../game";
const hamster = [
  "     aa       aa     ",
  "    aaaa     aaaa    ",
  "   aabaaa   aaabaa   ",
  "   aaaaaaaaaaaaaaa   ",
  "  aaaaaaaaaaaaaaaaa  ",
  " aaaaacaaaaaaacaaaaa ",
  " aaaaaaaaaaaaaaaaaaa ",
  " aaaaaaaabbbbaaaaaaa ",
  "  aaaaaabbbbbaaaaaa  ",
  "  aaadaaaaabaaaadaa  ",
  "   aaddaaaaaaaddaa   ",
  "    aaaaaaaaaaaa    ",
  "     aaaa  aaaa     ",
];
const sleeping = [
  "     aaa             ",
  "   aabbaa   aaaaa    ",
  "   aaaaaaaaaaaaaaaa  ",
  "  aaaaaacaaaaaaaaaaa ",
  " aaaaaaaaaaaaaaaaaaa ",
  "  aaaaadddaaaaaaaaaa ",
  "   aaaaddaaaaaaaaaa  ",
  "     aaaaaaaaaaaa    ",
];
function Sprite({
  rows,
  x,
  y,
  step = 5,
  palette,
}: {
  rows: string[];
  x: number;
  y: number;
  step?: number;
  palette: Record<string, string>;
}) {
  return (
    <g>
      {rows.flatMap((row, j) =>
        [...row].map((v, i) =>
          palette[v] ? (
            <circle
              key={`${j}-${i}`}
              cx={x + i * step}
              cy={y + j * step}
              r={step * 0.35}
              fill={palette[v]}
            />
          ) : null,
        ),
      )}
    </g>
  );
}
export function BurrowScene({
  systems = { heat: 76, water: 83, repair: 88 },
  compact = false,
  selected,
}: {
  systems?: Values;
  compact?: boolean;
  selected?: Values;
}) {
  const id = useId().replace(/:/g, "");
  const dots = [];
  for (let y = 62; y < 442; y += 9)
    for (let x = 24; x < 700; x += 9) {
      const inNest = ((x - 173) / 134) ** 2 + ((y - 269) / 105) ** 2 < 1;
      const inGarden = ((x - 535) / 139) ** 2 + ((y - 179) / 98) ** 2 < 1;
      const inTunnel = ((x - 526) / 157) ** 2 + ((y - 363) / 64) ** 2 < 1;
      const seed = (x * 17 + y * 13) % 97;
      if (!inNest && !inGarden && !inTunnel && seed < 36)
        dots.push(
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r="1.1"
            fill={seed < 12 ? "#52603e" : "#2c3326"}
          />,
        );
    }
  const nestOpacity = systems.heat === 0 ? 0.2 : systems.heat < 30 ? 0.55 : 1;
  const gardenOpacity =
    systems.water === 0 ? 0.2 : systems.water < 30 ? 0.55 : 1;
  const tunnelOpacity =
    systems.repair === 0 ? 0.2 : systems.repair < 30 ? 0.55 : 1;
  return (
    <div className={`burrow-scene ${compact ? "compact" : ""}`}>
      <div className="scene-top">
        <span>
          <span className="small-dot" /> Burrow habitat
        </span>
        <span>Depth 02 m</span>
      </div>
      <svg
        className="scene-art"
        viewBox="0 0 720 465"
        role="img"
        aria-label="An LED dot cutaway of a hamster burrow: a warm nest, a green garden, and a braced tunnel connected to a hamster wheel."
      >
        <defs>
          <pattern
            id={id + "grid"}
            width="9"
            height="9"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="4" cy="4" r=".75" fill="#252c20" />
          </pattern>
          <pattern
            id={id + "soil"}
            width="12"
            height="12"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="6" cy="6" r="1" fill="#343c29" />
          </pattern>
        </defs>
        <rect width="720" height="465" fill={"url(#" + id + "grid)"} />
        <path
          d="M24 65H696"
          stroke="#6c8050"
          strokeWidth="2"
          strokeDasharray="1 8"
          strokeLinecap="round"
        />
        {[42, 87, 132, 617, 653, 680].map((x, i) => (
          <path
            key={x}
            d={`M${x} 62v-12m0 7-6-5m6 1 6-6`}
            stroke={i % 2 ? "#718951" : "#455c36"}
            strokeWidth="2"
            strokeDasharray="1 4"
            strokeLinecap="round"
          />
        ))}
        {dots}
        <path
          d="M345 40v91c0 35-40 34-40 70v46c0 40 43 47 43 81 0 35 28 36 40 36M306 221H276m64-78h66M340 297h84"
          fill="none"
          stroke="#283222"
          strokeWidth="40"
        />
        <path
          d="M345 40v91c0 35-40 34-40 70v46c0 40 43 47 43 81 0 35 28 36 40 36M306 221H276m64-78h66M340 297h84"
          fill="none"
          stroke="#65734b"
          strokeWidth="2"
          strokeDasharray="1 7"
          strokeLinecap="round"
        />
        <path
          d="M320 40h50v28h-50z"
          fill="#1b2217"
          stroke="#718951"
          strokeWidth="2"
          strokeDasharray="1 5"
          strokeLinecap="round"
        />
        <g opacity={nestOpacity}>
          <ellipse
            cx="174"
            cy="265"
            rx="133"
            ry="105"
            fill="#1e2015"
            stroke={selected?.heat ? "#f2c478" : "#6b5836"}
            strokeWidth="2"
            strokeDasharray="1 7"
            strokeLinecap="round"
          />
          <ellipse
            cx="174"
            cy="297"
            rx="87"
            ry="35"
            fill="none"
            stroke="#b78b48"
            strokeWidth="2"
            strokeDasharray="1 6"
            strokeLinecap="round"
          />
          <path
            d="m101 304 9 8m3-13 9 15m7-14 3 17m70-12-1 13m14-18-4 14m14-18-4 11"
            stroke="#d1aa65"
            strokeWidth="2"
            strokeDasharray="1 4"
            strokeLinecap="round"
          />
          <Sprite
            rows={sleeping}
            x={111}
            y={242}
            step={6}
            palette={{ a: "#e3b76b", b: "#b57b51", c: "#171b12", d: "#f4dba0" }}
          />
          <path
            d="m214 226 13-2-10 12 12-1m5-26 10-2-8 10 10-1"
            fill="none"
            stroke="#aa8b59"
            strokeWidth="2"
            strokeDasharray="1 4"
            strokeLinecap="round"
          />
          <text
            x="174"
            y="345"
            textAnchor="middle"
            fill="#e3c78f"
            fontFamily="sans-serif"
            fontSize="13"
          >
            The nest
          </text>
        </g>
        <g opacity={gardenOpacity}>
          <ellipse
            cx="539"
            cy="179"
            rx="139"
            ry="98"
            fill="#171f15"
            stroke={selected?.water ? "#b7db83" : "#48613a"}
            strokeWidth="2"
            strokeDasharray="1 7"
            strokeLinecap="round"
          />
          <path
            d="M438 208h199m-178 15h155m-165-3 7 7m25-10 6 10m18-9 4 11m35-12 4 12m19-10 5 8m19-10 4 8"
            stroke="#6a7647"
            strokeWidth="2"
            strokeDasharray="1 6"
            strokeLinecap="round"
          />
          {[470, 536, 601].map((x, i) => (
            <g key={x}>
              <path
                d={`M${x} 204v-${41 + (i % 2) * 21}`}
                stroke="#a3c571"
                strokeWidth="3"
                strokeDasharray="1 5"
                strokeLinecap="round"
              />
              <path
                d={`M${x} ${184 - (i % 2) * 10}c-21 0-30-12-30-20 22 0 30 10 30 20Zm0-10c20 0 29-12 29-21-22 0-29 11-29 21Z`}
                fill={"url(#" + id + "soil)"}
                stroke="#8fae64"
                strokeWidth="2"
                strokeDasharray="1 5"
                strokeLinecap="round"
              />
            </g>
          ))}
          <text
            x="539"
            y="250"
            textAnchor="middle"
            fill="#b8cc9b"
            fontFamily="sans-serif"
            fontSize="13"
          >
            The garden
          </text>
        </g>
        <g opacity={tunnelOpacity}>
          <path
            d="M396 364c0-75 263-75 263 0v27H396v-27Z"
            fill="#18201d"
            stroke={selected?.repair ? "#a1cec5" : "#476a60"}
            strokeWidth="2"
            strokeDasharray="1 7"
            strokeLinecap="round"
          />
          {[426, 489, 552, 615].map((x) => (
            <path
              key={x}
              d={`M${x} 378v-40h34v40m-37-37 10-9m19 0 11 9`}
              stroke="#80ab9d"
              strokeWidth="3"
              fill="none"
              strokeDasharray="1 5"
              strokeLinecap="round"
            />
          ))}
          <text
            x="528"
            y="416"
            textAnchor="middle"
            fill="#a4c5b8"
            fontFamily="sans-serif"
            fontSize="13"
          >
            The tunnels
          </text>
        </g>
        <g>
          <circle
            cx="345"
            cy="117"
            r="38"
            fill="#141a12"
            stroke="#a6bb71"
            strokeWidth="3"
            strokeDasharray="1 6"
            strokeLinecap="round"
          />
          <path
            d="m321 146-7 16h61l-8-16"
            stroke="#8b9f63"
            strokeWidth="2"
            fill="none"
            strokeDasharray="1 5"
            strokeLinecap="round"
          />
          <Sprite
            rows={hamster}
            x={324}
            y={102}
            step={2.2}
            palette={{ a: "#b9cf8c", b: "#d1a88e", c: "#10170e", d: "#e2ddb6" }}
          />
        </g>
        <path
          d="m75 140 10-6-1 11 10-5m542-81 10-6-1 11 10-5"
          fill="none"
          stroke="#8fa264"
          strokeWidth="2"
          strokeDasharray="1 4"
          strokeLinecap="round"
        />
      </svg>
      <div className="scene-bottom">
        <span>
          <i className="scene-key nest" /> Nest
        </span>
        <span>
          <i className="scene-key garden" /> Garden
        </span>
        <span>
          <i className="scene-key tunnels" /> Tunnels
        </span>
        <span className="scene-coordinate">52° below the ordinary</span>
      </div>
    </div>
  );
}
