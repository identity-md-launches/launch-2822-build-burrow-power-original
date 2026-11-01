import { useCallback, useEffect, useRef, useState } from "react";
import {
  API,
  DOCS,
  DataError,
  assertFresh,
  consumeEvents,
  fetchLive,
  wheelPower,
  type LiveSnapshot,
} from "./api";
import {
  CAPACITY,
  LEVEL_DESCRIPTIONS,
  LEVEL_NAMES,
  SYSTEM_NAMES,
  SYSTEMS,
  UPGRADES,
  canChoose,
  creditTurn,
  finishProfile,
  forecast,
  newRun,
  playTurn,
  preview,
  score,
  type Levels,
  type Mode,
  type Run,
  type System,
  type Values,
} from "./game";
import {
  SAVE_KEY,
  openStorage,
  parseSave,
  persist,
  type Save,
} from "./storage";
import practice from "./data/practice.json";
import { HamsterMark, Icon } from "./components/Icon";
import { BurrowScene } from "./components/BurrowScene";
const time = (value: string) =>
  new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const deltasFor = (before: Values, after: Values): Values =>
  Object.fromEntries(SYSTEMS.map((s) => [s, after[s] - before[s]])) as Values;
export function App() {
  const [initial] = useState(openStorage);
  const [save, setSave] = useState(initial.save),
    saveRef = useRef(save);
  const [storage, setStorage] = useState(initial.available);
  const [mode, setMode] = useState<Mode>(initial.save.activeMode);
  const [level, setLevel] = useState<Levels>(
    initial.save.runs[initial.save.activeMode]?.status === "playing"
      ? initial.save.runs[initial.save.activeMode]!.level
      : initial.save.profiles[initial.save.activeMode].level,
  );
  const [playing, setPlaying] = useState(
    location.hash === "#play" && !!initial.save.runs[initial.save.activeMode],
  );
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [error, setError] = useState<DataError | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [motion, setMotion] = useState(true);
  const [tick, setTick] = useState(Date.now());
  const help = useRef<HTMLDialogElement>(null),
    restart = useRef<HTMLDialogElement>(null);
  const focusTarget = useRef<HTMLHeadingElement>(null),
    lastFocus = useRef<HTMLElement | null>(null);
  const busy = useRef(false),
    mounted = useRef(true);
  const run = save.runs[mode],
    profile = save.profiles[mode];
  const currentLevel = playing && run ? run.level : level;
  const event = playing && run ? forecast(run) : undefined;
  const resolved = playing && !!run && !run.ready && run.completed > 0;
  const last = run?.history.at(-1);
  const finished = playing && run && run.status !== "playing";
  let fresh = false;
  if (live && !error) {
    try {
      assertFresh(live.status.measurement, tick);
      fresh = tick - Date.parse(live.page.safeBlockTimestamp) <= 600000;
    } catch {
      /* The idle UI does not reuse stale observations. */
    }
  }
  const liveReady = fresh && storage;
  const actualActive =
    mode === "live" &&
    fresh &&
    !!live &&
    wheelPower(live.status.measurement) > 0;
  const commit = useCallback((next: Save) => {
    const value = { ...next, revision: saveRef.current.revision + 1 };
    if (!persist(value)) setStorage(false);
    saveRef.current = value;
    setSave(value);
  }, []);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const snapshot = await fetchLive(saveRef.current.watermarks);
      if (!mounted.current) return;
      const current = saveRef.current;
      if (storage) {
        const claimed = consumeEvents(snapshot.page, current.watermarks);
        if (claimed.added) {
          commit({
            ...current,
            watermarks: claimed.watermarks,
            lastRound:
              claimed.last?.payload.settledThroughRound ?? current.lastRound,
            profiles: {
              ...current.profiles,
              live: {
                ...current.profiles.live,
                blueprints: current.profiles.live.blueprints + claimed.added,
              },
            },
          });
          setNotice(
            `${claimed.added} confirmed settlement${claimed.added === 1 ? "" : "s"} unlocked ${claimed.added} local blueprint${claimed.added === 1 ? "" : "s"}.`,
          );
        }
      }
      setLive(snapshot);
      setError(null);
      setTick(Date.now());
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof DataError
            ? e
            : new DataError(
                "outage",
                "Unable to reach Squeekchain. Retry or play practice.",
              ),
        );
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [commit, storage]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    const clock = setInterval(() => setTick(Date.now()), 1000);
    return () => {
      mounted.current = false;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [refresh]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SAVE_KEY) return;
      const value = parseSave(e.newValue);
      if (value) {
        saveRef.current = value;
        setSave(value);
        setMode(value.activeMode);
        setHover(null);
        setNotice("Local progress updated from another tab.");
      }
    };
    const onHash = () => {
      setPlaying(
        location.hash === "#play" &&
          !!saveRef.current.runs[saveRef.current.activeMode],
      );
      setHover(null);
    };
    addEventListener("storage", onStorage);
    addEventListener("hashchange", onHash);
    return () => {
      removeEventListener("storage", onStorage);
      removeEventListener("hashchange", onHash);
    };
  }, []);
  useEffect(() => {
    if (playing) focusTarget.current?.focus({ preventScroll: true });
  }, [playing, run?.turn, run?.ready, run?.status]);
  function setPage(play: boolean) {
    setPlaying(play);
    location.hash = play ? "play" : "burrow";
    setHover(null);
  }
  function switchMode(next: Mode) {
    setMode(next);
    const previous = saveRef.current.runs[next];
    setLevel(
      previous?.status === "playing"
        ? previous.level
        : saveRef.current.profiles[next].level,
    );
    setPage(false);
    commit({ ...saveRef.current, activeMode: next });
  }
  function checkLive(): boolean {
    if (mode === "practice") return true;
    if (!live || error || !storage) return false;
    try {
      assertFresh(live.status.measurement);
      if (Date.now() - Date.parse(live.page.safeBlockTimestamp) > 600000)
        throw new DataError(
          "stale",
          "Confirmed settlement data is stale. Retry to continue. No turn was spent.",
        );
      return true;
    } catch (e) {
      setError(e as DataError);
      return false;
    }
  }
  function prepare(next: Run): Run {
    if (mode === "practice") {
      const fixture = practice.turns[next.turn - 1];
      return creditTurn(
        next,
        wheelPower({
          coreStatus: fixture.coreStatus as "ACTIVE" | "IDLE",
          rpmMilli: fixture.rpmMilli,
        }),
        `Practice fixture · encounter ${next.turn}`,
        fixture.rpmMilli,
      );
    }
    return creditTurn(
      next,
      wheelPower(live!.status.measurement),
      live!.status.measurement.observedAt,
      live!.status.measurement.rpmMilli,
    );
  }
  function start(force = false, selected: Levels = level) {
    if (!checkLive()) return;
    const current = saveRef.current,
      existing = current.runs[mode];
    if (!force && existing?.status === "playing") {
      setLevel(existing.level);
      setPage(true);
      return;
    }
    const next = prepare(
      newRun(
        mode,
        Math.min(selected, current.profiles[mode].level) as Levels,
        current.profiles[mode].installed,
      ),
    );
    commit({
      ...current,
      activeMode: mode,
      runs: { ...current.runs, [mode]: next },
    });
    setPage(true);
  }
  function respond(id: string) {
    // Read the synchronous save to make rapid clicks and keyboard repeats idempotent.
    const current = saveRef.current,
      currentRun = current.runs[mode];
    if (!currentRun || !canChoose(currentRun, id) || !checkLive()) return;
    const next = playTurn(currentRun, id);
    setHover(null);
    commit({
      ...current,
      runs: { ...current.runs, [mode]: next },
      profiles: {
        ...current.profiles,
        [mode]:
          next.status === "playing"
            ? current.profiles[mode]
            : finishProfile(current.profiles[mode], next),
      },
    });
    setNotice(
      `${next.history.at(-1)!.result} ${SYSTEMS.map((s) => `${SYSTEM_NAMES[s]} ${next.systems[s]}`).join(", ")}.`,
    );
  }
  function nextEncounter() {
    const current = saveRef.current,
      r = current.runs[mode];
    if (!r || r.status !== "playing" || r.ready || !checkLive()) return;
    commit({ ...current, runs: { ...current.runs, [mode]: prepare(r) } });
    setHover(null);
  }
  function install(system: System) {
    const current = saveRef.current,
      p = current.profiles[mode],
      u = UPGRADES.find((u) => u.id === system)!;
    if (
      p.blueprints < 1 ||
      p.installed.includes(system) ||
      p.level < u.level ||
      current.runs[mode]?.status === "playing"
    )
      return;
    commit({
      ...current,
      profiles: {
        ...current.profiles,
        [mode]: {
          ...p,
          blueprints: p.blueprints - 1,
          installed: [...p.installed, system],
        },
      },
    });
    setNotice(
      `${u.name} installed for future ${mode === "practice" ? "practice" : "real wheel"} shifts.`,
    );
  }
  function openDialog(dialog: HTMLDialogElement | null) {
    lastFocus.current = document.activeElement as HTMLElement;
    dialog?.showModal();
  }
  function closeDialog(dialog: HTMLDialogElement | null) {
    dialog?.close();
    lastFocus.current?.focus();
  }
  const systems =
    playing && run ? run.systems : { heat: 64, water: 64, repair: 64 };
  const selected =
    playing && run?.ready && hover ? preview(run, hover) : undefined;
  const deltas =
    resolved && last ? deltasFor(last.before, last.after) : undefined;
  const sourceLabel = error
    ? error.kind === "stale"
      ? "Data is stale"
      : error.kind === "schema"
        ? "Unsupported data"
        : "Live unavailable"
    : !fresh
      ? loading
        ? "Checking the wheel"
        : "Data is stale"
      : live?.status.measurement.coreStatus === "ACTIVE"
        ? "Wheel is active"
        : "Wheel is resting";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to game
      </a>
      <header className="site-header">
        <a
          className="brand"
          href="#burrow"
          onClick={() => setPage(false)}
          aria-label="Burrow Power home"
        >
          <HamsterMark />
          <span>
            Burrow<span className="brand-power">Power</span>
          </span>
        </a>
        <nav aria-label="Game navigation">
          <button
            type="button"
            className="nav-link"
            onClick={() => openDialog(help.current)}
          >
            <Icon name="book" size={18} />
            <span>How to play</span>
          </button>
          <a
            href="https://squeekchain.com"
            target="_blank"
            rel="noreferrer"
            className="squeek-link"
          >
            <span className="led" /> Squeekchain{" "}
            <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        <div className={`game-heading ${playing ? "heading-playing" : ""}`}>
          <div>
            <h1>
              {playing ? (
                LEVEL_NAMES[currentLevel - 1]
              ) : (
                <>
                  Small paws. <span>Big night.</span>
                </>
              )}
            </h1>
            <p>
              {playing
                ? "Keep every room above 0 through encounter 6."
                : "Protect a hamster home through six encounters."}
            </p>
          </div>
          <div className="heading-meta">
            <span className={`source-status ${fresh ? "source-fresh" : ""}`}>
              <i className="led" />
              {sourceLabel}
            </span>
            {playing ? (
              <button
                type="button"
                className="text-button"
                onClick={() => setPage(false)}
              >
                Back to burrow
              </button>
            ) : (
              <span className="local-caption">A Squeekchain survival game</span>
            )}
          </div>
        </div>
        {!storage && (
          <p className="warning-banner" role="status">
            Browser storage is unavailable. Practice works for this visit. Real
            wheel play needs storage to remember settlement unlocks.
          </p>
        )}
        {initial.recovered && (
          <p className="warning-banner">
            An unreadable local save was reset. Start a new shift to continue.
          </p>
        )}
        <div className="game-layout">
          <section className="world" aria-label="Burrow habitat">
            <div className="world-top">
              <span>
                <Icon name="home" size={18} />
                {LEVEL_NAMES[currentLevel - 1]}
              </span>
              <span>
                {currentLevel === 1 ? "2" : currentLevel === 2 ? "6" : "12"} m
                underground
              </span>
            </div>
            <BurrowScene
              systems={systems}
              mode={mode}
              active={actualActive}
              event={event}
              selected={selected}
              deltas={deltas}
              resolved={resolved}
              won={!!finished && run?.status === "won"}
              lost={!!finished && run?.status === "lost"}
              motion={motion}
              wheelLabel={sourceLabel}
            />
            <div
              className="night-progress"
              role="group"
              aria-label={`${playing && run ? run.completed : 0} of 6 encounters completed`}
            >
              <span className="night-label">Nightfall</span>
              <div className="progress-stops" aria-hidden="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <span
                    key={i}
                    className={`${playing && run && i < run.completed ? "complete" : ""} ${playing && run && i === run.completed && run.status === "playing" ? "current" : ""}`}
                  >
                    {playing && run && i < run.completed ? (
                      <Icon name="check" size={14} />
                    ) : (
                      i + 1
                    )}
                  </span>
                ))}
              </div>
              <span className="dawn-label">
                Sunrise <span aria-hidden="true">☀</span>
              </span>
            </div>
          </section>
          <section
            className={`encounter-console ${resolved ? "console-resolved" : ""} ${finished ? "console-finished" : ""}`}
            aria-label={playing ? "Current encounter" : "Start a game"}
          >
            {!playing ? (
              <>
                <div className="mode-switch" aria-label="Game data mode">
                  <button
                    type="button"
                    aria-pressed={mode === "practice"}
                    onClick={() => switchMode("practice")}
                  >
                    Practice
                  </button>
                  <button
                    type="button"
                    aria-pressed={mode === "live"}
                    onClick={() => switchMode("live")}
                  >
                    <i className="led" /> Real wheel
                  </button>
                </div>
                <div className="mission-icon">
                  <Icon name="home" size={30} />
                </div>
                <h2>Get Pip to sunrise.</h2>
                <p className="mission-copy">
                  Face a threat. Choose a response. Keep the nest, garden and
                  tunnels alive.
                </p>
                <div className="mission-facts">
                  <span>
                    <Icon name="bolt" />9 starting power
                  </span>
                  <span>
                    <Icon name="check" />6 encounters to survive
                  </span>
                </div>
                <button
                  type="button"
                  className="primary start-button"
                  disabled={mode === "live" && !liveReady}
                  onClick={() => start()}
                >
                  {run?.status === "playing" && run.level === level
                    ? "Resume the shift"
                    : "Protect the burrow"}
                  <Icon name="arrow" />
                </button>
                <p className="mode-note">
                  {mode === "practice"
                    ? "Practice uses a designed power sequence. No live data."
                    : liveReady
                      ? "Fresh hardware activity adds power each encounter."
                      : loading
                        ? "Checking official Squeekchain data…"
                        : (error?.message ??
                          "Live play is paused until fresh data returns.")}
                </p>
                {mode === "live" && !liveReady && !loading && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void refresh()}
                  >
                    Retry live connection <Icon name="refresh" size={16} />
                  </button>
                )}
                <div className="mission-foot">
                  <span className="led" />
                  Free to play · Local game progress
                </div>
              </>
            ) : (
              run && (
                <>
                  <div className="encounter-topline">
                    <span>
                      {mode === "practice" ? "Practice" : "Real wheel"} ·{" "}
                      {finished
                        ? "Shift complete"
                        : `Encounter ${resolved ? run.completed : run.turn} of 6`}
                    </span>
                    <span className="power-bank">
                      <Icon name="bolt" size={18} />
                      <strong>{run.power}</strong>
                      <span>power</span>
                    </span>
                  </div>
                  {finished ? (
                    <>
                      <div className={`result-symbol ${run.status}`}>
                        <Icon
                          name={run.status === "won" ? "check" : "home"}
                          size={40}
                        />
                      </div>
                      <h2 ref={focusTarget} tabIndex={-1}>
                        {run.status === "won"
                          ? "Hello, little sunrise."
                          : "A rough night for Pip."}
                      </h2>
                      <p className="result-copy">
                        {run.status === "won"
                          ? "Six encounters, one home still standing. Pip can sleep easy."
                          : `${SYSTEMS.filter((s) => run.systems[s] === 0)
                              .map((s) => SYSTEM_NAMES[s])
                              .join(
                                " and ",
                              )} reached 0. Try a cheaper fix early to save power for the last threats.`}
                      </p>
                      <div className="score-display">
                        <strong>{score(run).toLocaleString()}</strong>
                        <span>local game points</span>
                      </div>
                      {run.status === "won" && (
                        <p className="unlock-note">
                          <Icon name="lock" size={17} />
                          {run.level < 3
                            ? `${LEVEL_NAMES[run.level]} unlocked.`
                            : "Every hollow protected. Beautiful work."}
                          {mode === "practice" ? " +1 practice blueprint." : ""}
                        </p>
                      )}
                      <button
                        type="button"
                        className="primary"
                        onClick={() => {
                          setLevel(
                            run.status === "won" && run.level < 3
                              ? ((run.level + 1) as Levels)
                              : run.level,
                          );
                          start(
                            true,
                            run.status === "won" && run.level < 3
                              ? ((run.level + 1) as Levels)
                              : run.level,
                          );
                        }}
                        disabled={mode === "live" && !liveReady}
                      >
                        {run.status === "won" && run.level < 3
                          ? "Explore the next hollow"
                          : "Play this hollow again"}
                        <Icon name="arrow" />
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setLevel(profile.level);
                          setPage(false);
                        }}
                      >
                        Return to burrow
                      </button>
                    </>
                  ) : resolved && last ? (
                    <>
                      <span className="response-confirmed">
                        <Icon name="check" size={20} />
                        Encounter survived
                      </span>
                      <h2 ref={focusTarget} tabIndex={-1}>
                        {last.result}
                      </h2>
                      <p className="result-copy">
                        You chose: {last.choice.toLowerCase()}.
                      </p>
                      <div className="outcome-list">
                        {SYSTEMS.map((s) => (
                          <div key={s} className={`system-${s}`}>
                            <span>
                              <Icon name={s} />
                              {SYSTEM_NAMES[s]}
                            </span>
                            <strong>
                              {last.before[s]}
                              <span className="outcome-arrow">→</span>
                              {last.after[s]}
                              <small
                                className={
                                  deltas![s] > 0 ? "positive" : "negative"
                                }
                              >
                                {deltas![s] > 0 ? "+" : ""}
                                {deltas![s]}
                              </small>
                            </strong>
                          </div>
                        ))}
                      </div>
                      <p className="power-explanation">
                        {last.spent
                          ? `${last.spent} power used.`
                          : "No power spent."}
                        {last.salvaged
                          ? ` ${last.salvaged} power saved for later.`
                          : ""}{" "}
                        {run.power} remains.
                      </p>
                      <button
                        type="button"
                        className="primary next-button"
                        onClick={nextEncounter}
                        disabled={mode === "live" && !liveReady}
                      >
                        Next encounter
                        <Icon name="arrow" />
                      </button>
                      <p className="next-hint">
                        Up next: {forecast(run).name.toLowerCase()}.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className={`threat-icon system-${event!.target}`}>
                        <Icon name={event!.target} size={28} />
                        <span>
                          Threat to the{" "}
                          {SYSTEM_NAMES[event!.target].toLowerCase()}
                        </span>
                      </div>
                      <h2 ref={focusTarget} tabIndex={-1}>
                        {event!.name}
                      </h2>
                      <p className="encounter-story">{event!.description}</p>
                      <div
                        className={`power-credit ${run.turnGain > 0 ? "power-received" : ""}`}
                        key={run.turn}
                      >
                        <Icon name="bolt" size={16} />
                        {mode === "practice"
                          ? `Practice sequence: +${run.turnGain} power`
                          : `Real wheel: +${run.turnGain} power`}
                      </div>
                      {!!event!.effects.length && (
                        <p className="chain-warning">
                          {event!.effects.join(" ")}
                        </p>
                      )}
                      <div
                        className="response-choices"
                        aria-label="Choose a response"
                      >
                        {event!.choices.map((choice, i) => {
                          const after = preview(run, choice.id),
                            change = deltasFor(run.systems, after),
                            loses = SYSTEMS.some((s) => after[s] === 0);
                          return (
                            <button
                              type="button"
                              key={choice.id}
                              data-choice={choice.id}
                              className={`response-choice ${i === 0 ? "choice-protect" : ""} ${loses ? "choice-danger" : ""}`}
                              disabled={
                                !canChoose(run, choice.id) ||
                                (mode === "live" && !liveReady)
                              }
                              onClick={() => respond(choice.id)}
                              onMouseEnter={() => setHover(choice.id)}
                              onMouseLeave={() => setHover(null)}
                              onFocus={() => setHover(choice.id)}
                              onBlur={() => setHover(null)}
                            >
                              <span className="choice-heading">
                                <span
                                  className="choice-index"
                                  aria-hidden="true"
                                >
                                  {i + 1}
                                </span>
                                <strong>{choice.name}</strong>
                                <span className="choice-cost">
                                  <Icon name="bolt" size={14} />
                                  {choice.cost === 0
                                    ? `+${choice.salvage}`
                                    : choice.cost}
                                </span>
                              </span>
                              <span className="choice-description">
                                {choice.description}
                              </span>
                              <span className="choice-effects">
                                {SYSTEMS.map((s) => (
                                  <span
                                    key={s}
                                    className={change[s] > 0 ? "positive" : ""}
                                  >
                                    {SYSTEM_NAMES[s]} {change[s] > 0 ? "+" : ""}
                                    {change[s]}
                                  </span>
                                ))}
                              </span>
                              {loses && (
                                <span className="choice-warning">
                                  Ends the shift:{" "}
                                  {SYSTEMS.filter((s) => after[s] === 0)
                                    .map((s) => SYSTEM_NAMES[s])
                                    .join(", ")}{" "}
                                  reaches 0.
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <p className="choice-hint">
                        Choose one response. Effects include the threat’s
                        damage.
                      </p>
                    </>
                  )}
                  {mode === "live" && !liveReady && (
                    <div className="live-pause" role="status">
                      <strong>Shift paused. Nothing spent.</strong>
                      <p>
                        {error?.message ?? "Waiting for fresh official data."}
                      </p>
                      <button
                        type="button"
                        className="secondary"
                        disabled={loading}
                        onClick={() => void refresh()}
                      >
                        {loading ? "Checking…" : "Retry connection"}
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => switchMode("practice")}
                      >
                        Switch to practice
                      </button>
                    </div>
                  )}
                  <div className="console-footer">
                    <span>
                      {mode === "practice"
                        ? "Designed practice data"
                        : "Fresh hardware data only"}
                    </span>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => openDialog(restart.current)}
                    >
                      Restart shift
                    </button>
                  </div>
                </>
              )
            )}
          </section>
        </div>
        <section className="hollows" aria-labelledby="hollows-title">
          <div className="section-heading">
            <h2 id="hollows-title">A little deeper, a little braver.</h2>
            <span>
              {profile.wins} {mode === "practice" ? "practice" : "real wheel"}{" "}
              {profile.wins === 1 ? "shift" : "shifts"} saved
            </span>
          </div>
          <div className="level-path">
            {([1, 2, 3] as Levels[]).map((l) => (
              <button
                type="button"
                key={l}
                className={`level-choice ${currentLevel === l ? "level-selected" : ""}`}
                disabled={l > profile.level || run?.status === "playing"}
                aria-pressed={currentLevel === l}
                onClick={() => {
                  setLevel(l);
                  setPage(false);
                }}
              >
                <span className="level-number">
                  {l > profile.level ? (
                    <Icon name="lock" size={20} />
                  ) : (
                    String(l).padStart(2, "0")
                  )}
                </span>
                <span>
                  <strong>{LEVEL_NAMES[l - 1]}</strong>
                  <small>
                    {l === 1
                      ? "Learn the night"
                      : l === 2
                        ? "Outsmart the flood"
                        : "Hold through the aftershocks"}
                  </small>
                </span>
                <Icon name={l > profile.level ? "lock" : "arrow"} size={18} />
              </button>
            ))}
          </div>
          <p className="level-description">
            {LEVEL_DESCRIPTIONS[currentLevel - 1]}
            {run?.status === "playing"
              ? " Finish or restart the current shift before changing hollows."
              : profile.level < 3
                ? " Survive to unlock the next hollow."
                : ""}
          </p>
        </section>
        <div className="below-game">
          <details className="workshop">
            <summary>
              <Icon name="repair" />
              <span>Make it feel like home</span>
              <span>
                {profile.blueprints} local blueprint
                {profile.blueprints === 1 ? "" : "s"}
              </span>
              <Icon name="chevron" size={16} />
            </summary>
            <div className="details-body">
              <p>
                {mode === "practice"
                  ? "Practice starts with one blueprint and earns one per win."
                  : "Confirmed safe Sepolia settlement events unlock blueprints here."}{" "}
                Install between shifts. Each costs 1 local blueprint.
              </p>
              <div className="upgrades">
                {UPGRADES.map((u) => (
                  <div key={u.id} className={`upgrade system-${u.id}`}>
                    <Icon name={u.id} size={26} />
                    <strong>{u.name}</strong>
                    <p>{u.description}</p>
                    <button
                      type="button"
                      className="secondary"
                      disabled={
                        profile.installed.includes(u.id) ||
                        profile.blueprints < 1 ||
                        profile.level < u.level ||
                        run?.status === "playing"
                      }
                      onClick={() => install(u.id)}
                    >
                      {profile.installed.includes(u.id)
                        ? "Installed"
                        : profile.level < u.level
                          ? `Unlock in hollow ${u.level}`
                          : run?.status === "playing"
                            ? "Finish the shift first"
                            : profile.blueprints < 1
                              ? "Needs 1 blueprint"
                              : "Install · 1 blueprint"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </details>
          <details className="source-details">
            <summary>
              <Icon name="bolt" />
              <span>Behind the wheel</span>
              <span className={fresh ? "fresh-label" : ""}>{sourceLabel}</span>
              <Icon name="chevron" size={16} />
            </summary>
            <div className="details-body">
              <p>
                Official, public Squeekchain data.{" "}
                {mode === "practice"
                  ? "This shift uses a separate practice sequence."
                  : "Hardware activity adds 0–4 local power each encounter."}{" "}
                The same still-fresh reading may inform several quick turns.
                Readings older than 120 seconds pause real wheel play.
              </p>
              <dl>
                <div>
                  <dt>Source</dt>
                  <dd>
                    <a
                      href={API + "/v1/status"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Official wheel status ↗
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Wheel reading</dt>
                  <dd>
                    {live
                      ? `${time(live.status.measurement.observedAt)} · ${live.status.measurement.rpmMilli / 1000} RPM · hardware`
                      : "Not available"}
                  </dd>
                </div>
                <div>
                  <dt>Last checked</dt>
                  <dd>{live ? time(live.checkedAt) : "Not available"}</dd>
                </div>
                <div>
                  <dt>Confirmed round</dt>
                  <dd>{save.lastRound ?? "Not observed yet"} · Sepolia</dd>
                </div>
                <div>
                  <dt>Settlements</dt>
                  <dd>
                    API-verified, 12 confirmations. No wallet or score
                    transactions.
                  </dd>
                </div>
              </dl>
              {error && <p className="source-error">{error.message}</p>}
              <div className="source-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void refresh()}
                  disabled={loading}
                >
                  {loading ? "Checking…" : "Refresh official data"}
                  <Icon name="refresh" size={16} />
                </button>
                <a href={DOCS} target="_blank" rel="noreferrer">
                  Read the API reference ↗
                </a>
              </div>
            </div>
          </details>
        </div>
        {playing && last && (
          <details className="journal">
            <summary>
              <Icon name="book" />
              <span>The night’s story</span>
              <span>{run!.completed} encounters</span>
              <Icon name="chevron" size={16} />
            </summary>
            <ol>
              {run!.history.map((h) => (
                <li key={h.turn}>
                  <span className="journal-turn">{h.turn}</span>
                  <div>
                    <strong>{h.event}</strong>
                    <p>
                      {h.choice}. {h.result}
                    </p>
                    <small>
                      {SYSTEMS.map(
                        (s) => `${SYSTEM_NAMES[s]} ${h.after[s]}`,
                      ).join(" · ")}{" "}
                      · {h.spent} power spent · {h.gained}{" "}
                      {mode === "practice" ? "practice" : "wheel"} power
                      received
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </details>
        )}
        <div className="sr-only" role="status" aria-live="polite">
          {notice}
        </div>
      </main>
      <footer>
        <span>
          <HamsterMark /> A small home worth protecting.
        </span>
        <span>
          Points, power & upgrades stay in this browser. No SQK or financial
          rewards.
        </span>
        <button
          type="button"
          className="motion-button"
          aria-pressed={motion}
          onClick={() => setMotion(!motion)}
        >
          {motion ? "Pause" : "Enable"} wheel motion
        </button>
      </footer>
      <dialog
        ref={help}
        className="help-dialog"
        onClose={() => lastFocus.current?.focus()}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeDialog(help.current);
        }}
      >
        <div className="dialog-heading">
          <h2>One home. Six encounters.</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close how to play"
            onClick={() => closeDialog(help.current)}
          >
            <Icon name="close" />
          </button>
        </div>
        <p>
          You’re looking after Pip’s underground home until sunrise. Keep the
          nest, garden and tunnels above 0.
        </p>
        <ol className="rules-list">
          <li>
            <strong>Read the threat.</strong>
            <span>Each encounter puts a different room in danger.</span>
          </li>
          <li>
            <strong>Choose a response.</strong>
            <span>
              Spend 2 power on protection, spend 1 on a fix with a tradeoff, or
              take the damage to gain 2 power. The numbers on each response are
              the exact net changes.
            </span>
          </li>
          <li>
            <strong>See what happened.</strong>
            <span>
              Room changes appear immediately. Unspent power carries over, up to{" "}
              {CAPACITY}. Survive encounter 6 to win and unlock the next hollow.
            </span>
          </li>
        </ol>
        <h3>The real wheel changes the night.</h3>
        <p>
          In real wheel mode, fresh hardware activity adds one local power per
          started 25 RPM band, up to 4 per encounter. An idle wheel adds 0. You
          start with 9 power, so careful decisions can win even while Pip rests.
        </p>
        <p>
          Practice uses a labelled designed sequence and separate progress. Its
          wheel stays still. Confirmed Sepolia settlements unlock local
          blueprints in real wheel mode. There is no wallet connection or
          onchain score.
        </p>
        <button
          type="button"
          className="primary"
          onClick={() => closeDialog(help.current)}
        >
          Let’s protect the burrow
          <Icon name="arrow" />
        </button>
      </dialog>
      <dialog
        ref={restart}
        className="restart-dialog"
        onClose={() => lastFocus.current?.focus()}
      >
        <div className="dialog-heading">
          <h2>Restart this shift?</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Cancel restart"
            onClick={() => closeDialog(restart.current)}
          >
            <Icon name="close" />
          </button>
        </div>
        <p>
          This shift’s encounters reset. Your unlocked hollows, best score and
          installed upgrades stay saved.
        </p>
        <button
          type="button"
          className="primary"
          disabled={mode === "live" && !liveReady}
          onClick={() => {
            closeDialog(restart.current);
            start(true, currentLevel);
          }}
        >
          Restart shift
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => closeDialog(restart.current)}
        >
          Keep playing
        </button>
      </dialog>
    </div>
  );
}
