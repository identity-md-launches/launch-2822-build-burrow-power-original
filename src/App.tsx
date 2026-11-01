import { useCallback, useEffect, useRef, useState } from "react";
import {
  API,
  DOCS,
  assertFresh,
  consumeEvents,
  DataError,
  fetchLive,
  wheelPower,
  type LiveSnapshot,
} from "./api";
import {
  blankAllocation,
  canAllocate,
  creditTurn,
  finishProfile,
  forecast,
  GAINS,
  LEVEL_NAMES,
  newRun,
  playTurn,
  preview,
  score,
  SYSTEM_NAMES,
  SYSTEMS,
  totalAllocation,
  TURN_LIMIT,
  UPGRADES,
  type Levels,
  type Mode,
  type System,
  type Values,
} from "./game";
import {
  openStorage,
  parseSave,
  persist,
  SAVE_KEY,
  type Save,
} from "./storage";
import practice from "./data/practice.json";
import { HamsterMark, Icon } from "./components/Icon";
import { BurrowScene } from "./components/BurrowScene";
type Page = "burrow" | "play" | "how-to-play";
const pageFromHash = (): Page =>
  ["#play", "#workshop"].includes(location.hash)
    ? "play"
    : location.hash === "#how-to-play" || location.hash.startsWith("#rules-")
      ? "how-to-play"
      : "burrow";
const time = (s: string) =>
  new Date(s).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
function condition(value: number) {
  return value <= 0
    ? "Failed"
    : value < 30
      ? "At risk"
      : value < 55
        ? "Needs care"
        : "Healthy";
}
export function App() {
  const [initial] = useState(openStorage);
  const [save, setSave] = useState(initial.save),
    saveRef = useRef(save);
  const [storage, setStorage] = useState(initial.available);
  const [page, setPage] = useState<Page>(pageFromHash);
  const [mode, setMode] = useState<Mode>(initial.save.activeMode);
  const [level, setLevel] = useState<Levels>(1);
  const [allocation, setAllocation] = useState<Values>(blankAllocation);
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [error, setError] = useState<DataError | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const busy = useRef(false),
    mounted = useRef(true),
    heading = useRef<HTMLHeadingElement>(null);
  const run = save.runs[mode],
    profile = save.profiles[mode];
  const commit = useCallback((next: Save) => {
    const value = { ...next, revision: saveRef.current.revision + 1 };
    const stored = persist(value);
    if (!stored) setStorage(false);
    saveRef.current = value;
    setSave(value);
    return stored;
  }, []);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const snapshot = await fetchLive(saveRef.current.watermarks);
      if (!mounted.current) return;
      if (storage) {
        const current = saveRef.current,
          claimed = consumeEvents(snapshot.page, current.watermarks);
        if (claimed.added) {
          const next = {
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
          };
          if (commit(next))
            setNotice(
              `Live progress: ${claimed.added === 1 ? "a confirmed round unlocked 1 blueprint" : `${claimed.added} confirmed rounds unlocked ${claimed.added} blueprints`}. Install upgrades between live shifts.`,
            );
        }
      }
      setLive(snapshot);
      setError(null);
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof DataError
            ? e
            : new DataError(
                "outage",
                "Unable to load wheel data. Retry or play practice.",
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
    return () => {
      mounted.current = false;
      clearInterval(poll);
    };
  }, [refresh]);
  useEffect(() => {
    const onHash = () => {
      if (location.hash === "#main") return;
      setPage(pageFromHash());
      setAllocation(blankAllocation());
      setConfirmAbandon(false);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === SAVE_KEY) {
        const value = parseSave(event.newValue);
        if (value) {
          saveRef.current = value;
          setSave(value);
          setAllocation(blankAllocation());
          setNotice("Progress updated from another tab.");
        }
      }
    };
    addEventListener("hashchange", onHash);
    addEventListener("storage", onStorage);
    return () => {
      removeEventListener("hashchange", onHash);
      removeEventListener("storage", onStorage);
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [page]);
  useEffect(() => {
    if (saveRef.current.activeMode !== mode)
      commit({ ...saveRef.current, activeMode: mode });
    setLevel((selected) => Math.min(selected, saveRef.current.profiles[mode].level) as Levels);
  }, [mode, commit]);
  // Time passing can invalidate a visible reading even when the next poll has not completed.
  useEffect(() => {
    const tick = setInterval(() => {
      if (live && !error) {
        try {
          assertFresh(live.status.measurement);
          if (Date.now() - Date.parse(live.page.safeBlockTimestamp) > 600000)
            throw new DataError(
              "stale",
              "The confirmed round feed is more than 10 minutes behind. Retry or play practice.",
            );
        } catch (e) {
          setError(e as DataError);
        }
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [live, error]);
  const liveReady = !!live && !error && storage;
  const prepare = useCallback(
    (snapshot: LiveSnapshot | null) => {
      const current = saveRef.current,
        currentRun = current.runs[mode];
      if (!currentRun || currentRun.status !== "playing" || currentRun.ready)
        return;
      let gain = 0,
        observed = "",
        rpm = 0;
      if (mode === "practice") {
        const fixture = practice.turns[currentRun.turn - 1];
        gain = wheelPower({
          coreStatus: fixture.coreStatus as "ACTIVE" | "IDLE",
          rpmMilli: fixture.rpmMilli,
        });
        observed = `Practice fixture · turn ${currentRun.turn}`;
        rpm = fixture.rpmMilli;
      } else {
        if (!snapshot || error || !storage) return;
        try {
          assertFresh(snapshot.status.measurement);
        } catch (e) {
          setError(e as DataError);
          return;
        }
        gain = wheelPower(snapshot.status.measurement);
        observed = snapshot.status.measurement.observedAt;
        rpm = snapshot.status.measurement.rpmMilli;
      }
      commit({
        ...current,
        runs: {
          ...current.runs,
          [mode]: creditTurn(currentRun, gain, observed, rpm),
        },
      });
    },
    [mode, commit, error, storage],
  );
  useEffect(() => {
    if (page === "play" && run?.status === "playing" && !run.ready)
      prepare(live);
  }, [page, run, live, prepare]);
  function navigate(next: Page) {
    if (page === next) {
      heading.current?.focus();
      return;
    }
    location.hash = next === "burrow" ? "burrow" : next;
  }
  function start(nextMode: Mode, replace = false) {
    if (nextMode === "live" && !liveReady) return;
    setMode(nextMode);
    setAllocation(blankAllocation());
    setConfirmAbandon(false);
    const current = saveRef.current,
      existing = current.runs[nextMode];
    if (!existing || existing.status !== "playing" || replace) {
      const selected = Math.min(
        level,
        current.profiles[nextMode].level,
      ) as Levels;
      commit({
        ...current,
        activeMode: nextMode,
        runs: {
          ...current.runs,
          [nextMode]: newRun(
            nextMode,
            selected,
            current.profiles[nextMode].installed,
          ),
        },
      });
    }
    navigate("play");
  }
  function change(system: System, amount: number) {
    const next = { ...allocation, [system]: allocation[system] + amount };
    if (run && canAllocate(run, next)) setAllocation(next);
  }
  function endTurn() {
    if (!run || !run.ready || (mode === "live" && !liveReady)) return;
    if (mode === "live" && live) {
      try {
        assertFresh(live.status.measurement);
      } catch (e) {
        setError(e as DataError);
        return;
      }
    }
    const current = saveRef.current,
      currentRun = current.runs[mode];
    if (
      !currentRun ||
      currentRun.turn !== run.turn ||
      currentRun.completed !== run.completed
    )
      return;
    const next = playTurn(currentRun, allocation);
    const profiles =
      next.status === "playing"
        ? current.profiles
        : {
            ...current.profiles,
            [mode]: finishProfile(current.profiles[mode], next),
          };
    commit({ ...current, profiles, runs: { ...current.runs, [mode]: next } });
    setAllocation(blankAllocation());
    if (next.status !== "playing")
      setTimeout(() => document.getElementById("result-heading")?.focus(), 0);
  }
  function install(system: System) {
    const current = saveRef.current,
      p = current.profiles[mode],
      upgrade = UPGRADES.find((u) => u.id === system)!;
    if (
      p.installed.includes(system) ||
      p.blueprints < 1 ||
      p.level < upgrade.level ||
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
    setNotice(`${upgrade.name} installed for future ${mode} shifts.`);
  }
  const selectedForecast = run?.status === "playing" ? forecast(run) : null;
  const predicted = run?.status === "playing" ? preview(run, allocation) : null;
  const paused = mode === "live" && !liveReady;
  const startLabel =
    save.runs.live?.status === "playing" ? "Resume shift" : "Start shift";
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link" onClick={(event) => {
        event.preventDefault();
        document.getElementById("main")?.focus();
      }}>
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="#burrow" aria-label="Burrow Power home">
          <HamsterMark />
          <span>
            Burrow Power<span className="brand-period">.</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {(
            [
              ["burrow", "Burrow"],
              ["play", "Play"],
              ["how-to-play", "How to play"],
            ] as const
          ).map(([key, label]) => (
            <a
              key={key}
              href={"#" + key}
              aria-current={page === key ? "page" : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
        <span className="save-status">
          <span className={`status-dot ${storage ? "" : "warning"}`} />
          {storage ? "Locally saved" : "Session only"}
        </span>
      </header>
      <main id="main" tabIndex={-1}>
        {initial.recovered && (
          <div className="storage-warning recovery-notice" role="status">
            An unreadable local save was reset. A fresh burrow is ready.
          </div>
        )}
        {!storage && (
          <div className="storage-warning" role="status">
            Browser storage is unavailable. Practice works for this session.
            Live shifts need storage to keep confirmed events from being
            credited again.
          </div>
        )}
        {page === "burrow" && (
          <>
            <section className="home-hero">
              <div className="hero-copy">
                <h1 ref={heading} tabIndex={-1}>
                  Small paws.
                  <br />
                  <span>Big responsibility.</span>
                </h1>
                <p className="hero-description">
                  Keep a hamster’s underground home alive for six turns.
                </p>
                <div className="home-live">
                  <div className="live-title">
                    <span className={`status-dot ${error ? "warning" : ""}`} />
                    <strong>
                      {loading && !live
                        ? "Checking the wheel…"
                        : error
                          ? "Live shifts paused"
                          : live
                            ? live.status.measurement.coreStatus === "ACTIVE"
                              ? "The wheel is turning"
                              : "The wheel is resting"
                            : "Waiting for wheel data"}
                    </strong>
                    {live && !error && (
                      <span className="power-indicator">
                        +{wheelPower(live.status.measurement)} power / turn
                      </span>
                    )}
                  </div>
                  <p>
                    {error
                      ? error.message
                      : live
                        ? "Real Squeekchain activity powers your next move."
                        : "Connecting to Squeekchain’s public API."}
                  </p>
                  {live && (
                    <p className="observation-line">
                      <a
                        href={API + "/v1/status"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Squeekchain API
                      </a>{" "}
                      · observed{" "}
                      <time dateTime={live.status.measurement.observedAt}>
                        {time(live.status.measurement.observedAt)}
                      </time>
                    </p>
                  )}
                  {error && (
                    <button
                      className="text-button"
                      onClick={() => void refresh()}
                      disabled={loading}
                    >
                      <Icon name="refresh" size={16} />
                      {loading ? "Checking…" : "Retry live data"}
                    </button>
                  )}
                </div>
                <div className="hero-actions">
                  <button
                    className="button primary"
                    onClick={() => start("live")}
                    disabled={!liveReady}
                  >
                    {startLabel}
                    <Icon name="arrow" />
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => start("practice")}
                  >
                    {save.runs.practice?.status === "playing"
                      ? "Resume practice"
                      : "Play practice"}
                    <Icon name="chevron" size={16} />
                  </button>
                </div>
                <div className="hero-footnote">
                  <span>6 turns</span>
                  <span>3 systems</span>
                  <span>One little home</span>
                </div>
              </div>
              <BurrowScene />
            </section>
            <div className="home-strip">
              <span>
                <Icon name="bolt" size={18} /> Real wheel. Real decisions.
              </span>
              <span>
                Single player<span className="strip-divider">/</span>No wallet
                needed<span className="strip-divider">/</span>Points are not SQK
              </span>
            </div>
            <section
              className="systems-intro"
              aria-labelledby="balance-heading"
            >
              <div className="section-heading">
                <h2 id="balance-heading">A home is a balancing act.</h2>
                <a href="#how-to-play">
                  Learn the rules
                  <Icon name="arrow" size={18} />
                </a>
              </div>
              <div className="intro-grid">
                {SYSTEMS.map((s, i) => (
                  <article className={`intro-system ${s}`} key={s}>
                    <div className="intro-system-top">
                      <span className="system-icon">
                        <Icon name={s} size={23} />
                      </span>
                      <span className="number">0{i + 1}</span>
                    </div>
                    <h3>{SYSTEM_NAMES[s]}</h3>
                    <p>
                      {s === "heat"
                        ? "Keep the nest cozy. A cold nest puts extra strain on the tunnels."
                        : s === "water"
                          ? "Help the garden grow. Dry roots leave the nest without good bedding."
                          : "Hold the burrow together. Weak tunnels keep water from the garden."}
                    </p>
                    <span className="system-rule">
                      1 power = +{GAINS[s]}{" "}
                      {s === "heat"
                        ? "warmth"
                        : s === "water"
                          ? "health"
                          : "stability"}
                    </span>
                  </article>
                ))}
              </div>
            </section>
            <section className="home-bottom">
              <div>
                <h2>The next layer is yours.</h2>
                <p>
                  Survive a shift to dig deeper. Confirmed rounds unlock
                  blueprints for a stronger home.
                </p>
              </div>
              <div className="progress-summary">
                <span>
                  Live burrow level
                  <strong>
                    {save.profiles.live.level} <small>/ 3</small>
                  </strong>
                </span>
                <span>
                  Best live score
                  <strong>{save.profiles.live.best.toLocaleString()}</strong>
                </span>
                <span>
                  Blueprints<strong>{save.profiles.live.blueprints}</strong>
                </span>
              </div>
            </section>
            <SourceDetails
              live={live}
              error={error}
              loading={loading}
              refresh={refresh}
            />
          </>
        )}
        {page === "play" && (
          <>
            <div className="play-heading">
              <div>
                <h1 ref={heading} tabIndex={-1}>
                  {run ? "Keep the lights on." : "A burrow needs a keeper."}
                </h1>
                <p>
                  {run
                    ? `Level ${run.level} · ${LEVEL_NAMES[run.level - 1]}`
                    : "Choose a mode and take your first shift."}
                </p>
              </div>
              <div className="mode-toggle" aria-label="Game mode">
                <button
                  aria-pressed={mode === "live"}
                  onClick={() => {
                    setMode("live");
                    setAllocation(blankAllocation());
                    setConfirmAbandon(false);
                  }}
                >
                  Live
                </button>
                <button
                  aria-pressed={mode === "practice"}
                  onClick={() => {
                    setMode("practice");
                    setAllocation(blankAllocation());
                    setConfirmAbandon(false);
                  }}
                >
                  Practice
                </button>
              </div>
            </div>
            {mode === "practice" && (
              <div className="practice-banner">
                <Icon name="leaf" size={18} />
                <span>
                  Practice mode · bundled fixture. Separate progress; no live
                  data or real round rewards.
                </span>
              </div>
            )}
            {!run && (
              <div className="empty-play">
                <BurrowScene compact />
                <div className="empty-play-copy">
                  <h2>Ready for the underground?</h2>
                  <p>
                    You start with 9 reserve power. Keep all three systems above
                    zero through turn six.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => start(mode)}
                    disabled={mode === "live" && !liveReady}
                  >
                    Start {mode === "practice" ? "practice" : "shift"}
                    <Icon name="arrow" />
                  </button>
                  {mode === "live" && !liveReady && (
                    <p>
                      {error?.message ??
                        (!storage
                          ? "Live shifts need browser storage. Switch to practice."
                          : "Checking live data…")}
                    </p>
                  )}
                </div>
              </div>
            )}
            {run && run.status === "playing" && (
              <>
                <div className="turn-bar">
                  <div className="turn-label">
                    Turn{" "}
                    <strong>
                      {run.turn}
                      <span> / 6</span>
                    </strong>
                  </div>
                  <ol
                    className="turn-track"
                    aria-label={`Turn ${run.turn} of 6`}
                  >
                    {Array.from({ length: 6 }, (_, i) => (
                      <li
                        key={i}
                        className={
                          i < run.completed
                            ? "complete"
                            : i === run.turn - 1
                              ? "current"
                              : ""
                        }
                      >
                        <span>
                          {i < run.completed ? (
                            <Icon name="check" size={14} />
                          ) : (
                            i + 1
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <div className="score-label">
                    Score <strong>{score(run).toLocaleString()}</strong>
                  </div>
                </div>
                {paused && (
                  <div className="error-panel" role="alert">
                    <div>
                      <strong>Live shift paused</strong>
                      <p>
                        {error?.message ??
                          (!storage
                            ? "Storage is unavailable. This shift is kept in memory; use practice for now."
                            : "Checking fresh wheel data before play continues.")}
                      </p>
                    </div>
                    <button
                      className="button secondary"
                      disabled={loading}
                      onClick={() => void refresh()}
                    >
                      <Icon name="refresh" size={16} />
                      {loading ? "Checking…" : "Retry"}
                    </button>
                  </div>
                )}
                <div className="game-layout">
                  <section
                    className="habitat-panel"
                    aria-label="Burrow conditions"
                  >
                    <BurrowScene systems={run.systems} selected={allocation} />
                    <div className="meters">
                      {SYSTEMS.map((s) => (
                        <SystemMeter
                          key={s}
                          system={s}
                          value={run.systems[s]}
                          next={predicted?.[s]}
                        />
                      ))}
                    </div>
                    <div
                      className="turn-feedback"
                      role="status"
                      aria-live="polite"
                    >
                      {run.history.length ? (
                        <>
                          <Icon name="check" size={18} />
                          <div>
                            <strong>
                              Turn {run.history.at(-1)!.turn} complete. The
                              burrow holds.
                            </strong>
                            <p>
                              {run.history.at(-1)!.spent} power spent ·{" "}
                              {run.history.at(-1)!.gained} wheel power received.
                              Check the next forecast before allocating.
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <Icon name="book" size={18} />
                          <div>
                            <strong>A little care goes a long way.</strong>
                            <p>
                              Allocate power, then end the turn. Systems gain
                              your care before the forecast’s losses apply.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </section>
                  <section
                    className="controls-panel"
                    aria-label="Allocate power"
                  >
                    <div className="power-header">
                      <div>
                        <span>Available power</span>
                        <strong>
                          <Icon name="bolt" size={27} />
                          {run.power}
                          <small>/ 12</small>
                        </strong>
                      </div>
                      <span className="gain-tag">
                        +{run.turnGain} this turn
                      </span>
                    </div>
                    <div className="power-cells" aria-hidden="true">
                      {Array.from({ length: 12 }, (_, i) => (
                        <span
                          key={i}
                          className={
                            i < run.power - totalAllocation(allocation)
                              ? "filled"
                              : i < run.power
                                ? "allocated"
                                : ""
                          }
                        />
                      ))}
                    </div>
                    <p className="power-caption">
                      9 starting reserve ·{" "}
                      {mode === "practice"
                        ? "fixture"
                        : run.rpmMilli === 0
                          ? "idle wheel"
                          : `${(run.rpmMilli / 1000).toFixed(1)} RPM`}{" "}
                      · {run.ready ? "turn power credited" : "preparing turn…"}
                    </p>
                    {mode === "live" && run.observation && (
                      <p className="power-caption">
                        Turn reading:{" "}
                        <time dateTime={run.observation}>
                          {time(run.observation)}
                        </time>{" "}
                        · Squeekchain API
                      </p>
                    )}
                    <div className="forecast">
                      <div>
                        <Icon
                          name={selectedForecast?.target ?? "heat"}
                          size={18}
                        />
                        <strong>{selectedForecast?.name}</strong>
                      </div>
                      <p>{selectedForecast?.description}</p>
                      <div className="forecast-loss">
                        {SYSTEMS.map((s) => (
                          <span key={s} className={s}>
                            −{selectedForecast?.loss[s]}{" "}
                            {s === "heat"
                              ? "warmth"
                              : s === "water"
                                ? "health"
                                : "stability"}
                          </span>
                        ))}
                      </div>
                      {selectedForecast?.effects.map((effect) => (
                        <p className="risk-copy" key={effect}>
                          {effect}
                        </p>
                      ))}
                    </div>
                    <div className="allocation-heading">
                      <h2>Send power to…</h2>
                      <span>
                        {totalAllocation(allocation)} / {TURN_LIMIT} allocated
                      </span>
                    </div>
                    <div className="allocation-list">
                      {SYSTEMS.map((s) => (
                        <div className={`allocation-row ${s}`} key={s}>
                          <div className="allocation-label">
                            <Icon name={s} />
                            <div>
                              <strong>
                                {s === "heat"
                                  ? "Heat the nest"
                                  : s === "water"
                                    ? "Water the garden"
                                    : "Repair tunnels"}
                              </strong>
                              <span>
                                1 power → +{GAINS[s]}{" "}
                                {s === "heat"
                                  ? "warmth"
                                  : s === "water"
                                    ? "health"
                                    : "stability"}
                              </span>
                            </div>
                          </div>
                          <div className="stepper">
                            <button
                              aria-label={`Decrease ${s}`}
                              disabled={
                                allocation[s] === 0 || paused || !run.ready
                              }
                              onClick={() => change(s, -1)}
                            >
                              −
                            </button>
                            <output aria-label={`${s} allocation`}>
                              {allocation[s]}
                            </output>
                            <button
                              aria-label={`Increase ${s}`}
                              disabled={
                                paused ||
                                !run.ready ||
                                !canAllocate(run, {
                                  ...allocation,
                                  [s]: allocation[s] + 1,
                                })
                              }
                              onClick={() => change(s, 1)}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="outcome-preview" aria-live="polite">
                      {predicted && SYSTEMS.some((s) => predicted[s] <= 0) ? (
                        <span className="risk-copy">
                          This choice will fail:{" "}
                          {SYSTEMS.filter((s) => predicted[s] <= 0)
                            .map((s) => SYSTEM_NAMES[s])
                            .join(", ")}{" "}
                          reaches zero.
                        </span>
                      ) : (
                        <span>
                          {totalAllocation(allocation)
                            ? `${run.power - totalAllocation(allocation)} power stays in reserve.`
                            : "Spend nothing to conserve power, or add care above."}
                        </span>
                      )}
                    </div>
                    <button
                      className="button primary end-turn"
                      onClick={endTurn}
                      disabled={paused || !run.ready}
                    >
                      End turn {run.turn}
                      <Icon name="arrow" />
                    </button>
                    <p className="control-hint">
                      Each + costs 1 power. Max 2 per system.
                    </p>
                  </section>
                </div>
                <details className="shift-log">
                  <summary>
                    Read shift log{" "}
                    <span>{run.history.length} completed turns</span>
                  </summary>
                  {run.history.length ? (
                    <div className="log-table-wrap">
                      <table>
                        <caption className="sr-only">
                          Power allocations and resulting conditions for this
                          shift
                        </caption>
                        <thead>
                          <tr>
                            <th>Turn</th>
                            <th>Wheel</th>
                            <th>Care H / W / R</th>
                            <th>Conditions H / W / R</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.history.map((h) => (
                            <tr key={h.turn}>
                              <td>
                                {h.turn} · {h.event}
                              </td>
                              <td>+{h.gained}</td>
                              <td>
                                {h.allocation.heat} / {h.allocation.water} /{" "}
                                {h.allocation.repair}
                              </td>
                              <td>
                                {h.after.heat} / {h.after.water} /{" "}
                                {h.after.repair}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>Your choices will appear here after the first turn.</p>
                  )}
                </details>
                <div className="restart-row">
                  {confirmAbandon ? (
                    <>
                      <span>
                        Restart this {mode} shift? Current shift progress will
                        be lost.
                      </span>
                      <button
                        className="button secondary"
                        onClick={() => start(mode, true)}
                        disabled={mode === "live" && !liveReady}
                      >
                        Restart shift
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setConfirmAbandon(false)}
                      >
                        Keep playing
                      </button>
                    </>
                  ) : (
                    <button
                      className="text-button"
                      onClick={() => setConfirmAbandon(true)}
                    >
                      Restart shift
                    </button>
                  )}
                </div>
              </>
            )}
            {run && run.status !== "playing" && (
              <section className={`result ${run.status}`}>
                <div className="result-copy">
                  <div className="result-symbol">
                    <Icon
                      name={run.status === "won" ? "leaf" : "repair"}
                      size={34}
                    />
                  </div>
                  <h2 id="result-heading" tabIndex={-1}>
                    {run.status === "won"
                      ? "A little home, still standing."
                      : "The burrow needs another chance."}
                  </h2>
                  <p>
                    {run.status === "won"
                      ? `You kept every system alive through all six turns. ${run.level < 3 ? "The next burrow level is unlocked." : "You mastered the deepest burrow."}`
                      : `${SYSTEMS.filter((s) => run.systems[s] <= 0)
                          .map((s) => SYSTEM_NAMES[s])
                          .join(
                            " and ",
                          )} reached zero on turn ${run.turn}. Try spreading care across all three rooms.`}
                  </p>
                  <div className="result-score">
                    <strong>{score(run).toLocaleString()}</strong>
                    <span>
                      {mode === "practice" ? "Practice" : "Live"} points · not
                      SQK
                    </span>
                  </div>
                  <div className="result-breakdown">
                    <span>
                      Turns survived{" "}
                      <strong>
                        {run.status === "won" ? 6 : run.completed - 1} / 6
                      </strong>
                    </span>
                    <span>
                      Remaining power <strong>{run.power}</strong>
                    </span>
                    <span>
                      Best {mode} score{" "}
                      <strong>{profile.best.toLocaleString()}</strong>
                    </span>
                  </div>
                  <div className="result-actions">
                    <button
                      className="button primary"
                      disabled={mode === "live" && !liveReady}
                      onClick={() => start(mode, true)}
                    >
                      Play another shift
                      <Icon name="arrow" />
                    </button>
                    <a className="button secondary" href="#workshop">
                      Open workshop
                    </a>
                  </div>
                </div>
                <BurrowScene systems={run.systems} />
              </section>
            )}
            <section className="workshop" id="workshop">
              <div className="section-heading">
                <div>
                  <h2>Make this burrow stronger.</h2>
                  <p>
                    {mode === "practice"
                      ? "Practice blueprints are separate from live progress."
                      : "Each newly confirmed settlement unlocks one blueprint."}
                  </p>
                </div>
                <span className="blueprint-count">
                  <Icon name="book" size={20} />
                  {profile.blueprints}{" "}
                  {profile.blueprints === 1 ? "blueprint" : "blueprints"}
                </span>
              </div>
              <div className="workshop-controls">
                <label htmlFor="level">Burrow level</label>
                <select
                  id="level"
                  value={level}
                  onChange={(e) => setLevel(Number(e.target.value) as Levels)}
                >
                  {([1, 2, 3] as const).map((l) => (
                    <option value={l} key={l} disabled={l > profile.level}>
                      Level {l} · {LEVEL_NAMES[l - 1]}
                      {l > profile.level ? " (locked)" : ""}
                    </option>
                  ))}
                </select>
                <span>
                  Used for the next shift. Level {profile.level} unlocked.
                </span>
              </div>
              <div className="upgrade-grid">
                {UPGRADES.map((u) => {
                  const installed = profile.installed.includes(u.id),
                    locked = profile.level < u.level;
                  return (
                    <article key={u.id} className={`upgrade ${u.id}`}>
                      <Icon name={u.id} size={24} />
                      <h3>{u.name}</h3>
                      <p>{u.description}</p>
                      <button
                        className="button secondary"
                        onClick={() => install(u.id)}
                        disabled={
                          installed ||
                          locked ||
                          profile.blueprints < 1 ||
                          run?.status === "playing"
                        }
                      >
                        {installed ? (
                          <>
                            <Icon name="check" size={16} />
                            Installed
                          </>
                        ) : locked ? (
                          <>
                            <Icon name="lock" size={16} />
                            Reach level {u.level}
                          </>
                        ) : (
                          "Install · 1 blueprint"
                        )}
                      </button>
                    </article>
                  );
                })}
              </div>
              {run?.status === "playing" && (
                <p className="workshop-hint">
                  Finish your shift before installing upgrades.
                </p>
              )}
            </section>
            {notice && (
              <p className="notice" role="status">
                <Icon name="book" size={18} />
                {notice}
              </p>
            )}
            {mode === "live" ? (
              <SourceDetails
                live={live}
                error={error}
                loading={loading}
                refresh={refresh}
              />
            ) : (
              <div className="practice-source">
                <strong>Fixture source</strong>
                <p>{practice.source}</p>
                <span>
                  Bundled with the game. Observation: practice turn{" "}
                  {run?.turn ?? 1}. No API requests are used as practice power
                  inputs.
                </span>
              </div>
            )}
          </>
        )}
        {page === "how-to-play" && (
          <section className="rules-page">
            <div className="rules-header">
              <h1 ref={heading} tabIndex={-1}>
                A keeper’s field guide.
              </h1>
              <p>Three rooms. Six turns. Think one step below the surface.</p>
              <button
                className="button primary"
                onClick={() => start("practice")}
              >
                Try a practice shift
                <Icon name="arrow" />
              </button>
            </div>
            <div className="rules-layout">
              <aside>
                <a href="#rules-goal">The goal</a>
                <a href="#rules-turn">Your turn</a>
                <a href="#rules-power">Wheel power</a>
                <a href="#rules-upgrades">Digging deeper</a>
                <a href="#rules-score">Scoring & saves</a>
              </aside>
              <div className="rules-content">
                <section id="rules-goal">
                  <h2>Keep every room alive.</h2>
                  <p>
                    You manage nest warmth, garden health, and tunnel stability.
                    Each condition ranges from 0 to 100. All three must stay
                    above 0 through turn six to complete a shift. Any system
                    reaching 0 ends the shift immediately.
                  </p>
                  <p>
                    Your first burrow starts at 58 warmth, 56 garden health, and
                    62 tunnel stability.
                  </p>
                </section>
                <section id="rules-turn">
                  <h2>Every turn is a tradeoff.</h2>
                  <ol>
                    <li>
                      <strong>Collect power.</strong> Start with a visible
                      reserve of 9. The latest fresh wheel reading adds 0–4
                      power at the start of each turn, up to a capacity of 12.
                    </li>
                    <li>
                      <strong>Read the forecast.</strong> Every turn loses
                      warmth, garden health, and stability. Cold fronts, thirsty
                      roots, and loose soil make one room need extra care.
                    </li>
                    <li>
                      <strong>Allocate care.</strong> Spend up to 3 power per
                      turn, at most 2 in each room. Each + costs 1 power. You
                      may spend nothing.
                    </li>
                    <li>
                      <strong>End the turn.</strong> Care raises conditions
                      first, capped at 100. Forecast losses apply next. Unspent
                      power carries over.
                    </li>
                  </ol>
                  <div className="rules-table">
                    <table>
                      <caption>Care from each power unit</caption>
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th>Cost</th>
                          <th>Gain</th>
                        </tr>
                      </thead>
                      <tbody>
                        {SYSTEMS.map((s) => (
                          <tr key={s}>
                            <td>
                              {s === "heat"
                                ? "Heat the nest"
                                : s === "water"
                                  ? "Water the garden"
                                  : "Repair tunnels"}
                            </td>
                            <td>1 power</td>
                            <td>
                              +{GAINS[s]}{" "}
                              {s === "heat"
                                ? "warmth"
                                : s === "water"
                                  ? "health"
                                  : "stability"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p>
                    Below 30, systems affect their neighbors: a dry garden adds
                    3 warmth loss, a cold nest adds 3 stability loss, and weak
                    tunnels add 3 garden health loss. These penalties are based
                    on conditions at the start of the turn and are included in
                    the forecast.
                  </p>
                </section>
                <section id="rules-power">
                  <h2>A real wheel powers the game.</h2>
                  <p>
                    Live mode reads Squeekchain’s official public API on
                    Sepolia. A fresh, hardware-provenance measurement marked
                    ACTIVE gives <code>min(4, ceil(rpmMilli / 25000))</code>{" "}
                    power per game turn. RPM is measured in thousandths: 50,000
                    rpmMilli is 50 RPM and gives 2 power. IDLE or zero RPM gives
                    exactly 0, even if a previous nonzero speed remains in the
                    reading.
                  </p>
                  <p>
                    The wheel reading is a rate sampled once per turn, not a
                    claim on physical energy or tokens. A credited turn is
                    saved, so refresh does not refill it. Live mode checks both
                    observation and receipt age against the API’s 120-second
                    limit. Stale, unavailable, non-hardware, or unsupported data
                    pauses play. Retry when the source recovers, or switch to
                    separately saved practice.
                  </p>
                  <p>
                    Practice uses a bundled, deliberately arranged fixture
                    calibrated to captured wheel measurements. Its turns, power,
                    points, and blueprints are always labelled practice.
                  </p>
                  <a href={DOCS} target="_blank" rel="noreferrer">
                    Read the official API documentation
                    <Icon name="arrow" size={16} />
                  </a>
                </section>
                <section id="rules-upgrades">
                  <h2>Dig deeper. Build better.</h2>
                  <p>
                    Winning level 1 unlocks level 2; winning level 2 unlocks
                    level 3. Each deeper level adds 2 to every system’s base
                    loss per turn. Level 1 base losses are 10 warmth, 9 garden
                    health, and 8 stability, before weather and linked
                    penalties.
                  </p>
                  <p>
                    A real <code>system.settlement_completed</code> event
                    unlocks one blueprint after 12 confirmations. Zero-work
                    settlements count too: a confirmed round is different from
                    an active wheel. Your first sync claims only the latest
                    settlement; later syncs catch up newer ones. The event’s
                    safe chain position is saved so it is credited once,
                    including after refresh or restart.
                  </p>
                  <p>
                    Spend a blueprint between shifts to install moss lining
                    (level 1), a rain cistern (level 2), or root braces (level
                    3). Each reduces its room’s loss by 2 every turn. Your
                    installed upgrades are fixed for that shift. Practice starts
                    with one separate blueprint.
                  </p>
                </section>
                <section id="rules-score">
                  <h2>Small wins, local points.</h2>
                  <p>
                    Score = 100 × completed turns + 2 × the sum of remaining
                    conditions + 25 × remaining power + 100 × burrow level. A
                    successful shift adds 500 points. The completed-turn term
                    includes a final failed turn.
                  </p>
                  <p>
                    <strong>Game points and blueprints are not SQK.</strong>{" "}
                    There are no tokens, entry fees, wallets, bets, or financial
                    rewards in Burrow Power.
                  </p>
                  <p>
                    Progress stays in this browser. Live and practice have
                    separate levels, best scores, upgrades, and resumable
                    shifts. Clearing browser data clears progress. If storage is
                    blocked, practice stays playable in memory and live play
                    pauses to protect event deduplication. Use one active tab
                    for the most predictable save behavior.
                  </p>
                  <p>
                    Use a mouse, touch, or Tab and Enter/Space to allocate power
                    and end turns. No timed input is required.
                  </p>
                </section>
              </div>
            </div>
          </section>
        )}
      </main>
      <footer className="site-footer">
        <a className="brand footer-brand" href="#burrow">
          <HamsterMark />
          <span>A little power goes underground.</span>
        </a>
        <div>
          <span>Made for the Squeekchain community</span>
          <a href={DOCS} target="_blank" rel="noreferrer">
            Data source
            <Icon name="arrow" size={14} />
          </a>
        </div>
      </footer>
    </div>
  );
}
function SystemMeter({
  system,
  value,
  next,
}: {
  system: System;
  value: number;
  next?: number;
}) {
  return (
    <div className={`system-meter ${system}`}>
      <div className="meter-label">
        <Icon name={system} size={18} />
        <span>{SYSTEM_NAMES[system]}</span>
      </div>
      <div className="meter-value">
        <strong>
          {value}
          <small>/100</small>
        </strong>
        <span className={value < 30 ? "risk-copy" : ""}>
          {condition(value)}
        </span>
      </div>
      <meter
        min={0}
        max={100}
        low={30}
        high={55}
        optimum={100}
        value={value}
        aria-label={SYSTEM_NAMES[system]}
      />
      <div className="next-value">
        After turn{" "}
        <strong className={next !== undefined && next <= 0 ? "risk-copy" : ""}>
          {next ?? value}
        </strong>
      </div>
    </div>
  );
}
function SourceDetails({
  live,
  error,
  loading,
  refresh,
}: {
  live: LiveSnapshot | null;
  error: DataError | null;
  loading: boolean;
  refresh: () => Promise<void>;
}) {
  return (
    <details className="source-details">
      <summary>
        <span>
          <span className={`status-dot ${error ? "warning" : ""}`} />
          {error ? "Live data needs attention" : "Squeekchain data connection"}
        </span>
        <Icon name="chevron" size={16} />
      </summary>
      <div className="source-content">
        <div>
          <strong>
            {error
              ? "Live shifts paused"
              : live
                ? "Official public API · hardware measurement"
                : "Checking public API"}
          </strong>
          <p>
            {error?.message ??
              "Wheel measurements determine turn power. Safe round settlements unlock blueprints."}
          </p>
          <a href={API + "/v1/status"} target="_blank" rel="noreferrer">
            api.squeekchain.com/v1/status
          </a>
          <a
            href={API + "/v1/events?category=protocol&limit=100"}
            target="_blank"
            rel="noreferrer"
          >
            api.squeekchain.com/v1/events · protocol
          </a>
        </div>
        <dl>
          <div>
            <dt>Wheel observed</dt>
            <dd>
              {live ? (
                <time dateTime={live.status.measurement.observedAt}>
                  {time(live.status.measurement.observedAt)} ·{" "}
                  {new Date(
                    live.status.measurement.observedAt,
                  ).toLocaleDateString()}
                </time>
              ) : (
                "Not yet observed"
              )}
            </dd>
          </div>
          <div>
            <dt>Last successful check</dt>
            <dd>
              {live ? (
                <time dateTime={live.checkedAt}>{time(live.checkedAt)}</time>
              ) : (
                "Not yet connected"
              )}
            </dd>
          </div>
          <div>
            <dt>Wheel state</dt>
            <dd>
              {live
                ? `${live.status.measurement.coreStatus} · ${(live.status.measurement.rpmMilli / 1000).toFixed(3)} RPM`
                : "Unknown"}
            </dd>
          </div>
          <div>
            <dt>Confirmed through</dt>
            <dd>
              {live ? `Sepolia block ${live.page.safeThroughBlock}` : "Unknown"}
            </dd>
          </div>
          <div>
            <dt>Safe block time</dt>
            <dd>
              {live ? (
                <time dateTime={live.page.safeBlockTimestamp}>
                  {time(live.page.safeBlockTimestamp)}
                </time>
              ) : (
                "Unknown"
              )}
            </dd>
          </div>
        </dl>
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <Icon name="refresh" size={16} />
          {loading ? "Checking…" : "Refresh source"}
        </button>
      </div>
    </details>
  );
}
