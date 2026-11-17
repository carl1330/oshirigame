import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "react-toastify";
import {
  FaArrowLeft,
  FaCheckCircle,
  FaChevronDown,
  FaPlay,
  FaTimesCircle,
} from "react-icons/fa";
import TileLoader from "../components/TileLoader";
import Button from "../components/Button";
import LetterBoxInput from "../components/LetterBoxInput";
import LetterBoxFinished from "../components/LetterBoxFinished";
import DailyLeaderboard, {
  LeaderboardEntry,
} from "../components/DailyLeaderboard";
import { getHttpConfig } from "../misc/server.conf";
import "react-toastify/dist/ReactToastify.css";

interface Combo {
  atama: string;
  oshiri: string;
}

interface RunState {
  startedAt: number;
  now: number;
  /** First unplayed round */
  round: number;
  /** When that round's clock started; 0 = waiting on the verdict screen */
  roundStartedAt: number;
  results: (RoundResult | null)[];
}

interface Challenge {
  day: string;
  language: string;
  roundTime: number;
  combos: Combo[];
  played: boolean;
  entry?: { rank: number; username: string; avatar: string; score: number };
  /** The player's submitted words, when they already played today */
  results?: RoundResult[];
  run?: RunState;
}

interface RoundResult {
  atama: string;
  oshiri: string;
  word: string;
  accepted: boolean;
  score: number;
}

interface SubmitResponse {
  day: string;
  score: number;
  rank: number;
  results: RoundResult[];
}

type Phase =
  "loading" | "intro" | "playing" | "verdict" | "submitting" | "done";

const LANGUAGES = [
  { id: "english", label: "English" },
  { id: "swedish", label: "Svenska" },
];

// Network can resolve in a few ms, which makes the loader flash and look
// broken. Hold the loading phase long enough for one full keycap wave.
const MIN_LOADER_MS = 1000;
function minLoaderDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MIN_LOADER_MS));
}

function getDailyToken(): string {
  let token = localStorage.getItem("dailyToken");
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem("dailyToken", token);
  }
  return token;
}

export default function Daily() {
  const api = getHttpConfig();
  const [phase, setPhase] = useState<Phase>("loading");
  const [language, setLanguage] = useState(
    localStorage.getItem("dailyLanguage") ?? "english",
  );
  const [username, setUsername] = useState(
    localStorage.getItem("dailyUsername") ?? "",
  );
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  // The day's answers stay collapsed until asked for
  const [showAnswers, setShowAnswers] = useState(false);

  // Live round state
  const [round, setRound] = useState(0);
  const [input, setInput] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  // Per-round verdicts shown while playing; null = still checking
  const [liveResults, setLiveResults] = useState<(RoundResult | null)[]>([]);
  const wordsRef = useRef<string[]>([]);
  // Guards against the timer tick and the Enter key both advancing one round
  const advancingRef = useRef(false);

  const fetchLeaderboard = useCallback(
    async (lang: string) => {
      try {
        // The token lets the server include other players' words once this
        // player has finished their own run.
        const res = await fetch(
          `${api}/api/daily/leaderboard?language=${lang}&token=${getDailyToken()}`,
        );
        const data = await res.json();
        return {
          entries: (data.entries ?? []) as LeaderboardEntry[],
          total: (data.total ?? 0) as number,
        };
      } catch {
        // Leaderboard is decorative on the intro screen; ignore failures
        return null;
      }
    },
    [api],
  );

  // Rebuild playing state from the server's record of an in-progress run, so
  // a page reload never restarts (or resets) a started challenge.
  const resumeRun = useCallback((data: Challenge, run: RunState) => {
    const rt = data.roundTime;
    const results = run.results ?? [];
    wordsRef.current = data.combos.map((_, i) => results[i]?.word ?? "");
    setLiveResults(data.combos.map((_, i) => results[i] ?? null));
    setInput("");
    if (run.round >= data.combos.length) {
      // Every round already has a verdict: finalize
      submitRef.current();
    } else if (run.roundStartedAt > 0 || run.round === 0) {
      // Mid-round: resume with the time that is actually left
      advancingRef.current = false;
      setRound(run.round);
      setTimeLeft(
        run.roundStartedAt > 0
          ? Math.max(1, rt - (run.now - run.roundStartedAt))
          : rt,
      );
      setPhase("playing");
    } else {
      // Between rounds: show the last verdict and wait for Next
      advancingRef.current = true;
      setRound(run.round - 1);
      setPhase("verdict");
    }
  }, []);

  // Load today's challenge whenever the language changes. Challenge and
  // leaderboard are applied together so stale entries never flash in between.
  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    (async () => {
      try {
        const token = getDailyToken();
        const [res, board] = await Promise.all([
          fetch(`${api}/api/daily?language=${language}&token=${token}`),
          fetchLeaderboard(language),
          minLoaderDelay(),
        ]);
        if (!res.ok) throw new Error(`daily failed: ${res.status}`);
        const data: Challenge = await res.json();
        if (cancelled) return;
        setChallenge(data);
        setLeaderboard(board?.entries ?? []);
        setTotalPlayers(board?.total ?? 0);
        setResult(null);
        setShowAnswers(false);
        if (data.played) {
          setPhase("done");
        } else if (data.run) {
          resumeRun(data, data.run);
        } else {
          setPhase("intro");
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          toast.error("Could not load today's challenge.");
          setPhase("intro");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, language, fetchLeaderboard, resumeRun]);

  const submitRun = useCallback(async () => {
    setPhase("submitting");
    const loaderHold = minLoaderDelay();
    try {
      const res = await fetch(`${api}/api/daily/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: getDailyToken(),
          language,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `submit failed: ${res.status}`);
      }
      const board = await fetchLeaderboard(language);
      if (board) {
        setLeaderboard(board.entries);
        setTotalPlayers(board.total);
      }
      await loaderHold;
      setResult(data);
      // Fresh submit: the breakdown is the payoff, show it right away
      setShowAnswers(true);
      setPhase("done");
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Could not submit your score.",
      );
      await loaderHold;
      setPhase("done");
    }
  }, [api, language, fetchLeaderboard]);

  // Lock one round's word on the server (permanent — a round can only be
  // locked once) and show the verdict as soon as it comes back.
  const lockWord = useCallback(
    async (index: number, word: string, combo: Combo) => {
      const rejected: RoundResult = {
        atama: combo.atama,
        oshiri: combo.oshiri,
        word,
        accepted: false,
        score: 0,
      };
      let verdict = rejected;
      try {
        const res = await fetch(`${api}/api/daily/word`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: getDailyToken(),
            language,
            round: index,
            word,
          }),
        });
        if (res.ok) verdict = (await res.json()) as RoundResult;
      } catch {
        // Keep the pessimistic local verdict; Submit has the final say
      }
      setLiveResults((prev) => {
        const next = [...prev];
        next[index] = verdict;
        return next;
      });
    },
    [api, language],
  );

  // Stable ref so the challenge-loading effect can resume a run
  const submitRef = useRef(submitRun);
  submitRef.current = submitRun;

  // Lock in the current word and move to the next round (or submit)
  const advanceRound = useCallback(() => {
    if (!challenge || advancingRef.current) return;
    advancingRef.current = true;

    const combo = challenge.combos[round];
    const middle = input.trim().toLowerCase();
    wordsRef.current[round] = middle ? combo.atama + middle + combo.oshiri : "";

    // Lock the word server-side and show its verdict; the player decides
    // when to move on (advancingRef resets in nextRound)
    setLiveResults((prev) => {
      const next = [...prev];
      next[round] = null;
      return next;
    });
    lockWord(round, wordsRef.current[round], combo);
    setPhase("verdict");
  }, [challenge, round, input, lockWord]);

  // Keep a stable reference for the countdown effect
  const advanceRef = useRef(advanceRound);
  advanceRef.current = advanceRound;

  // Per-round countdown
  useEffect(() => {
    if (phase !== "playing") return;
    const interval = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, round]);

  // Time's up: lock in whatever is typed and move on
  useEffect(() => {
    if (phase === "playing" && timeLeft === 0) {
      advanceRef.current();
    }
  }, [phase, timeLeft]);

  async function startRun() {
    if (!challenge) return;
    const name = username.trim();
    if (!name) {
      toast.error("Pick a username first!");
      return;
    }
    localStorage.setItem("dailyUsername", name);
    setUsername(name);
    setPhase("loading");
    try {
      // The clock starts on the server: reloading the page resumes this
      // run instead of restarting it.
      const res = await fetch(`${api}/api/daily/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: getDailyToken(),
          username: name,
          avatar: "",
          language,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `start failed: ${res.status}`);
      }
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Could not start the challenge.",
      );
      setPhase("intro");
      return;
    }
    wordsRef.current = new Array(challenge.combos.length).fill("");
    advancingRef.current = false;
    setLiveResults([]);
    setRound(0);
    setInput("");
    setTimeLeft(challenge.roundTime);
    setPhase("playing");
  }

  // Player pressed Next on the verdict screen: start the next round's clock
  // on the server, or finalize after the last word.
  async function nextRound() {
    if (!challenge) return;
    if (round + 1 >= challenge.combos.length) {
      submitRun();
      return;
    }
    try {
      const res = await fetch(`${api}/api/daily/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: getDailyToken(), language }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `next failed: ${res.status}`);
      }
      advancingRef.current = false;
      setRound(data.round);
      setInput("");
      setTimeLeft(
        Math.max(1, challenge.roundTime - (data.now - data.roundStartedAt)),
      );
      setPhase("playing");
    } catch (err) {
      console.error(err);
      toast.error("Could not start the next word.");
    }
  }

  function selectLanguage(lang: string) {
    localStorage.setItem("dailyLanguage", lang);
    setLanguage(lang);
  }

  const combo = challenge?.combos[round];
  // Words to show on the done screen: this session's submit, or the stored
  // answers when the player comes back later in the day
  const doneResults = result?.results ?? challenge?.results;
  const acceptedCount = doneResults?.filter((r) => r.accepted).length ?? 0;
  const doneTotal = doneResults?.reduce((sum, r) => sum + r.score, 0) ?? 0;

  // "7/10 words · Rank #3 of 42" under the hero score
  const scoreContext = (rank: number) => (
    <span className="text-white/60 font-display">
      {doneResults ? `${acceptedCount}/${doneResults.length} words · ` : ""}
      Rank #{rank}
      {totalPlayers > 0 ? ` of ${totalPlayers}` : ""}
    </span>
  );

  const languagePicker = (
    <div className="flex gap-2">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.id}
          onClick={() => selectLanguage(lang.id)}
          className={`px-4 py-2 rounded-full font-display text-sm border transition-colors ${
            language === lang.id
              ? "bg-violet-600 border-violet-400 text-white"
              : "bg-surface-sunken border-white/10 text-white/50 hover:text-white"
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="w-full min-h-screen flex p-2">
      <div className="flex w-full flex-col gap-2">
        <div className="flex grow justify-center">
          <div className="flex flex-col gap-5 items-center w-full panel px-4 py-6 overflow-y-auto">
            <div className="flex w-full max-w-xl items-center justify-between">
              <Link
                to="/"
                className="flex items-center gap-2 text-white/60 hover:text-white font-display"
              >
                <FaArrowLeft aria-hidden /> Home
              </Link>
              <span className="text-white/40 font-display text-sm">
                {challenge?.day ?? ""}
              </span>
            </div>

            <h1 className="font-display font-semibold text-3xl sm:text-4xl text-white">
              Daily Challenge
            </h1>

            {/* Phases crossfade through one keyed wrapper. Playing and
                verdict share a key on purpose: the round skeleton must not
                re-animate between them, the letters stay put. */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={
                  phase === "playing" || phase === "verdict" ? "round" : phase
                }
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="flex grow flex-col items-center gap-5 w-full"
              >
                {phase === "loading" && (
                  <div className="flex grow items-center">
                    <TileLoader
                      letters="DAILY"
                      label="Loading daily challenge"
                    />
                  </div>
                )}

                {phase === "intro" && challenge && (
                  <>
                    <p className="text-white/60 text-center max-w-md">
                      Everyone gets the same {challenge.combos.length} letter
                      pairs today. {challenge.roundTime} seconds per word, one
                      attempt per day. Highest score tops the leaderboard!
                    </p>
                    {languagePicker}
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      maxLength={20}
                      placeholder="Username"
                      aria-label="Username"
                      className="w-full max-w-xs text-white bg-surface-sunken border border-white/10 placeholder:text-white/40 px-4 py-3 rounded-full text-center text-base"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck="false"
                    />
                    <Button
                      className="flex items-center justify-center gap-3 px-8"
                      onClick={startRun}
                      disabled={username.trim() === ""}
                    >
                      <FaPlay aria-hidden />
                      <span className="text-lg">Play today's challenge</span>
                    </Button>
                    <div className="w-full max-w-md">
                      <h2 className="font-display text-white/70 text-center mb-2">
                        Today's leaderboard
                      </h2>
                      <DailyLeaderboard
                        key={language}
                        entries={leaderboard}
                        total={totalPlayers}
                      />
                    </div>
                  </>
                )}

                {phase === "playing" && challenge && combo && (
                  <>
                    <div className="flex w-full max-w-md items-center justify-between font-display text-white/70">
                      <span>
                        Word {round + 1} / {challenge.combos.length}
                      </span>
                      <motion.span
                        key={timeLeft}
                        animate={timeLeft <= 5 ? { scale: [1, 1.2, 1] } : {}}
                        className={`text-2xl font-semibold ${
                          timeLeft <= 5 ? "text-red-400" : "text-white"
                        }`}
                      >
                        {timeLeft}
                      </motion.span>
                    </div>
                    {/* Same skeleton as the verdict screen (tiles / label slot /
                    button slot) so the letters stay put between phases */}
                    <div className="flex grow flex-col items-center justify-center gap-6">
                      <div className="flex flex-col items-center gap-3 w-full">
                        <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5 max-w-2xl">
                          <div className="tile tile-anchor">
                            {combo.atama.toUpperCase()}
                          </div>
                          <LetterBoxInput
                            text={input}
                            setText={setInput}
                            disabled={false}
                            focus={true}
                            onEnter={advanceRound}
                          />
                          <div className="tile tile-anchor">
                            {combo.oshiri.toUpperCase()}
                          </div>
                        </div>
                        <p className="text-white/40 text-sm h-7 flex items-center">
                          Press Enter to lock in your word
                        </p>
                      </div>
                      <Button
                        disabled
                        className="w-full max-w-xs py-3 invisible"
                      >
                        Next word
                      </Button>
                    </div>
                  </>
                )}

                {phase === "verdict" && challenge && (
                  <>
                    <div className="flex w-full max-w-md items-center justify-between font-display text-white/70">
                      <span>
                        Word {round + 1} / {challenge.combos.length}
                      </span>
                      {/* Invisible timer keeps this header the same height as
                      during play, so nothing below it shifts */}
                      <span
                        aria-hidden
                        className="text-2xl font-semibold invisible"
                      >
                        0
                      </span>
                    </div>
                    <div className="flex grow flex-col items-center justify-center gap-6">
                      {liveResults[round] ? (
                        <LetterBoxFinished
                          key={round}
                          wordAccepted={liveResults[round]!.accepted}
                          text={liveResults[round]!.word.toUpperCase()}
                          score={liveResults[round]!.score}
                        />
                      ) : (
                        // Verdict still in flight: keep the word on screen as
                        // neutral tiles, with an invisible label holding the
                        // exact space the verdict text will take
                        <div className="flex flex-col items-center gap-3 w-full">
                          <div className="flex flex-wrap gap-1 sm:gap-1.5 justify-center">
                            {wordsRef.current[round] ? (
                              wordsRef.current[round]
                                .toUpperCase()
                                .split("")
                                .map((letter, index) => (
                                  <div key={index} className="tile">
                                    {letter}
                                  </div>
                                ))
                            ) : (
                              <div className="tile tile-empty" />
                            )}
                          </div>
                          <div
                            aria-hidden
                            className="invisible font-display font-semibold text-lg sm:text-xl h-7 flex items-center"
                          >
                            Word accepted!
                          </div>
                        </div>
                      )}
                      <Button
                        onClick={nextRound}
                        disabled={!liveResults[round]}
                        className={`w-full max-w-xs py-3 ${
                          liveResults[round] ? "" : "invisible"
                        }`}
                      >
                        {round + 1 >= challenge.combos.length
                          ? "Show results"
                          : "Next word"}
                      </Button>
                    </div>
                  </>
                )}

                {phase === "submitting" && (
                  <div className="flex grow items-center">
                    <TileLoader letters="SCORE" label="Submitting result" />
                  </div>
                )}

                {phase === "done" && (
                  <>
                    {languagePicker}
                    {result ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-white/60 font-display">
                          Your score
                        </span>
                        <span className="font-display font-semibold text-5xl text-violet-300">
                          {result.score}
                          <span className="text-2xl text-violet-300/70 ml-1.5">
                            pts
                          </span>
                        </span>
                        {scoreContext(result.rank)}
                      </div>
                    ) : (
                      challenge?.entry && (
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-white/60 font-display">
                            You already played today
                          </span>
                          <span className="font-display font-semibold text-5xl text-violet-300">
                            {challenge.entry.score}
                            <span className="text-2xl text-violet-300/70 ml-1.5">
                              pts
                            </span>
                          </span>
                          {scoreContext(challenge.entry.rank)}
                        </div>
                      )
                    )}
                    {doneResults && doneResults.length > 0 && (
                      <div className="flex flex-col items-center w-full max-w-md">
                        <button
                          onClick={() => setShowAnswers((v) => !v)}
                          aria-expanded={showAnswers}
                          className="flex items-center gap-2 px-4 py-2 rounded-full font-display text-sm border bg-surface-sunken border-white/10 text-white/60 hover:text-white transition-colors"
                        >
                          {showAnswers ? "Hide my words" : "Show my words"}
                          <FaChevronDown
                            aria-hidden
                            className={`transition-transform duration-200 ${
                              showAnswers ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                        <AnimatePresence initial={false}>
                          {showAnswers && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: "easeOut" }}
                              className="w-full overflow-hidden"
                            >
                              <div className="flex flex-col gap-1 w-full pt-3">
                                {doneResults.map((r, i) => {
                                  const word = r.word.toUpperCase();
                                  const head = r.atama.toUpperCase();
                                  const tail = r.oshiri.toUpperCase();
                                  const middle = word.slice(
                                    head.length,
                                    word.length - tail.length,
                                  );
                                  return (
                                    <div
                                      key={i}
                                      className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface-sunken border border-white/5 font-display"
                                    >
                                      <span className="text-white/40 w-5 text-right tabular-nums">
                                        {i + 1}
                                      </span>
                                      {r.accepted ? (
                                        <FaCheckCircle
                                          aria-label="Accepted"
                                          className="text-green-400 shrink-0"
                                        />
                                      ) : (
                                        <FaTimesCircle
                                          aria-label="Not accepted"
                                          className="text-red-400 shrink-0"
                                        />
                                      )}
                                      <span className="flex-1 uppercase tracking-wide truncate">
                                        {word ? (
                                          r.accepted ? (
                                            // The middle letters earned the points,
                                            // so they get the brightness
                                            <>
                                              <span className="text-white/50">
                                                {head}
                                              </span>
                                              <span className="text-white">
                                                {middle}
                                              </span>
                                              <span className="text-white/50">
                                                {tail}
                                              </span>
                                            </>
                                          ) : (
                                            <span className="text-white/50 line-through">
                                              {word}
                                            </span>
                                          )
                                        ) : (
                                          <span className="text-white/50">
                                            {head} … {tail}
                                          </span>
                                        )}
                                      </span>
                                      <span
                                        className={`w-16 text-right tabular-nums ${
                                          r.accepted
                                            ? "text-violet-300"
                                            : "text-white/40"
                                        }`}
                                      >
                                        {r.accepted ? `+${r.score} pts` : "0"}
                                      </span>
                                    </div>
                                  );
                                })}
                                <div className="flex items-center gap-3 px-3 py-2 font-display border-t border-white/10 mt-1">
                                  <span className="w-5" aria-hidden />
                                  <span className="flex-1 text-white/60">
                                    Total
                                  </span>
                                  <span className="w-16 text-right tabular-nums font-semibold text-violet-300">
                                    {doneTotal} pts
                                  </span>
                                </div>
                                <p className="text-white/40 text-xs text-center pt-1">
                                  1 point per letter you fill in. Longer words
                                  score more!
                                </p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                    <div className="w-full max-w-md">
                      <h2 className="font-display text-white/70 text-center mb-2">
                        Today's leaderboard
                      </h2>
                      {leaderboard.some((e) => e.results?.length) && (
                        <p className="text-white/40 text-xs text-center mb-2">
                          Tap a player to see their words
                        </p>
                      )}
                      <DailyLeaderboard
                        key={language}
                        entries={leaderboard}
                        total={totalPlayers}
                        highlightUsername={
                          result ? username : challenge?.entry?.username
                        }
                        highlightRank={result?.rank ?? challenge?.entry?.rank}
                      />
                    </div>
                    <p className="text-white/40 text-sm text-center">
                      Come back tomorrow for a new board!
                    </p>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
