export type IconName =
  | "bolt"
  | "heat"
  | "water"
  | "repair"
  | "arrow"
  | "check"
  | "leaf"
  | "book"
  | "refresh"
  | "lock"
  | "chevron"
  | "home"
  | "close";
const paths: Record<IconName, React.ReactNode> = {
  bolt: <path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z" />,
  heat: (
    <>
      <path d="M12 3c1 5-5 6-5 11a5 5 0 0 0 10 0c0-2-1-4-2-5 0 3-3 3-3 5-2-4 3-5 0-11Z" />
    </>
  ),
  water: <path d="M12 3c-3 4-7 8-7 12a7 7 0 0 0 14 0c0-4-4-8-7-12Z" />,
  repair: (
    <>
      <path d="m4 20 9-9M14 4l6 6-3 3-6-6 3-3ZM2 20l2 2 3-3-2-2-3 3Z" />
      <path d="m13 5 4-2 5 5-2 4" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  leaf: (
    <>
      <path d="M20 3C8 2 3 7 5 15c8 4 15-2 15-12Z" />
      <path d="M4 21 16 8" />
    </>
  ),
  book: (
    <>
      <path d="M12 5v16M3 4c3-1 6-1 9 1 3-2 6-2 9-1v15c-3-1-6-1-9 1-3-2-6-2-9-1V4Z" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  home: (
    <>
      <path d="m3 10 9-7 9 7v10H3V10Z" />
      <path d="M9 20v-7h6v7" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function HamsterMark() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden="true"
    >
      {[
        "  ooo     ooo  ",
        " ooooo   ooooo ",
        " ooooooooooooo ",
        "  ooooooooooo  ",
        " ooo ooooo ooo ",
        " ooooooooooooo ",
        " ooooo o ooooo ",
        "  ooooooooooo  ",
        "   ooooooooo   ",
        "     ooooo     ",
      ].flatMap((row, y) =>
        [...row].map((v, x) =>
          v === "o" ? (
            <circle key={`${x}-${y}`} cx={2 + x * 2} cy={5 + y * 2} r=".78" />
          ) : null,
        ),
      )}
    </svg>
  );
}
