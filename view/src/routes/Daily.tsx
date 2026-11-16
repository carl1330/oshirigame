import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "react-toastify";
import { FaArrowLeft, FaPlay } from "react-icons/fa";
import { Oval } from "react-loader-spinner";
import Button from "../components/Button";
import Footer from "../components/Footer";
import LetterBoxInput from "../components/LetterBoxInput";
import DailyLeaderboard, {
  LeaderboardEntry,
} from "../components/DailyLeaderboard";
import { getHttpConfig } from "../misc/server.conf";
import "react-toastify/dist/ReactToastify.css";

interface Combo {
  atama: string;
  oshiri: string;
}

interface Challenge {
  day: string;
  language: string;
  roundTime: number;
  combos: Combo[];
  played: boolean;
  entry?: { rank: number; username: string; avatar: string; score: number };
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

type Phase = "loading" | "intro" | "playing" | "submitting" | "done";

const LANGUAGES = [
  { id: "english", label: "English" },
  { id: "swedish", label: "Svenska" },
];

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
    localStorage.getItem("dailyLanguage") ?? "english"
  );
  const [username, setUsername] = useState(
    localStorage.getItem("dailyUsername") ?? ""
  );
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [result, setResult] = useState<SubmitResponse | null>(null);

  // Live round state
  const [round, setRound] = useState(0);
  const [input, setInput] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const wordsRef = useRef<string[]>([]);
  // Guards against the timer tick and the Enter key both advancing one round
  const advancingRef = useRef(false);

  const fetchLeaderboard = useCallback(
    async (lang: string) => {
      try {
        const res = await fetch(`${api}/api/daily/leaderboard?language=${lang}`);
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
    [api]
  );

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
        ]);
        if (!res.ok) throw new Error(`daily failed: ${res.status}`);
        const data: Challenge = await res.json();
        if (cancelled) return;
        setChallenge(data);
        setLeaderboard(board?.entries ?? []);
        setTotalPlayers(board?.total ?? 0);
        setResult(null);
        setPhase(data.played ? "done" : "intro");
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
  }, [api, language, fetchLeaderboard]);

  const submitRun = useCallback(
    async (words: string[]) => {
      setPhase("submitting");
      try {
        const res = await fetch(`${api}/api/daily/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: getDailyToken(),
            username,
            avatar: "",
            language,
            words,
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
        setResult(data);
        setPhase("done");
      } catch (err) {
        console.error(err);
        toast.error(
          err instanceof Error ? err.message : "Could not submit your score."
        );
        setPhase("done");
      }
    },
    [api, username, language, fetchLeaderboard]
  );

  // Lock in the current word and move to the next round (or submit)
  const advanceRound = useCallback(() => {
    if (!challenge || advancingRef.current) return;
    advancingRef.current = true;

    const combo = challenge.combos[round];
    const middle = input.trim().toLowerCase();
    wordsRef.current[round] = middle
      ? combo.atama + middle + combo.oshiri
      : "";

    if (round + 1 >= challenge.combos.length) {
      submitRun(wordsRef.current);
    } else {
      setRound(round + 1);
      setInput("");
      setTimeLeft(challenge.roundTime);
      // Let the next render settle before accepting another advance
      setTimeout(() => {
        advancingRef.current = false;
      }, 50);
    }
  }, [challenge, round, input, submitRun]);

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

  function startRun() {
    if (!challenge) return;
    const name = username.trim();
    if (!name) {
      toast.error("Pick a username first!");
      return;
    }
    localStorage.setItem("dailyUsername", name);
    setUsername(name);
    wordsRef.current = new Array(challenge.combos.length).fill("");
    advancingRef.current = false;
    setRound(0);
    setInput("");
    setTimeLeft(challenge.roundTime);
    setPhase("playing");
  }

  function selectLanguage(lang: string) {
    localStorage.setItem("dailyLanguage", lang);
    setLanguage(lang);
  }

  const combo = challenge?.combos[round];

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

            {phase === "loading" && (
              <div className="flex grow items-center">
                <Oval color="#8b5cf6" width={40} height={40} />
              </div>
            )}

            {phase === "intro" && challenge && (
              <>
                <p className="text-white/60 text-center max-w-md">
                  Everyone gets the same {challenge.combos.length} letter pairs
                  today. {challenge.roundTime} seconds per word, one attempt per
                  day. Highest score tops the leaderboard!
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
                <div className="flex grow items-center">
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
                </div>
                <p className="text-white/40 text-sm">
                  Press Enter to lock in your word
                </p>
              </>
            )}

            {phase === "submitting" && (
              <div className="flex grow items-center">
                <Oval color="#8b5cf6" width={40} height={40} />
              </div>
            )}

            {phase === "done" && (
              <>
                {languagePicker}
                {result ? (
                  <>
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-white/60 font-display">
                        Your score
                      </span>
                      <span className="font-display font-semibold text-5xl text-violet-300">
                        {result.score}
                      </span>
                      <span className="text-white/60 font-display">
                        Rank #{result.rank}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 w-full max-w-md">
                      {result.results.map((r, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface-sunken border border-white/5 font-display"
                        >
                          <span className="text-white/40 w-6">{i + 1}</span>
                          <span
                            className={`flex-1 uppercase tracking-wide truncate ${
                              r.accepted
                                ? "text-white"
                                : "text-white/30 line-through"
                            }`}
                          >
                            {r.word ||
                              `${r.atama.toUpperCase()} … ${r.oshiri.toUpperCase()}`}
                          </span>
                          <span
                            className={
                              r.accepted ? "text-violet-300" : "text-white/30"
                            }
                          >
                            {r.accepted ? `+${r.score}` : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  challenge?.entry && (
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-white/60 font-display">
                        You already played today
                      </span>
                      <span className="font-display font-semibold text-5xl text-violet-300">
                        {challenge.entry.score}
                      </span>
                      <span className="text-white/60 font-display">
                        Rank #{challenge.entry.rank}
                      </span>
                    </div>
                  )
                )}
                <div className="w-full max-w-md">
                  <h2 className="font-display text-white/70 text-center mb-2">
                    Today's leaderboard
                  </h2>
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
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
