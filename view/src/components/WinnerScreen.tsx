import { useEffect, useState } from "react";
import Confetti from "react-confetti";
import { AnimatePresence, motion } from "framer-motion";
import PlayerAvatar from "./PlayerAvatar";
import Button from "./Button";

export interface PlayerRanking {
  username: string;
  avatar?: string;
  score: number;
  rank: number;
  /** Pre-formatted survival story shown instead of points (battle royale) */
  stat?: string;
}

// One end-of-game superlative, computed server-side. Value is pre-formatted:
// the word itself, "3.2s", or a count.
export interface Award {
  id: string;
  username: string;
  avatar?: string;
  value: string;
}

interface WinnerScreenProps {
  winners: PlayerRanking[];
  awards?: Award[];
  isHost?: boolean;
  onBackToLobby?: () => void;
}

// Presentation per award id: tile style carries the verdict color language
// (green = accepted word, purple = anchor/special, red = fail).
const AWARD_META: Record<
  string,
  { title: string; subtitle: string; tile: string }
> = {
  wordsmith: {
    title: "Wordsmith",
    subtitle: "Longest word of the game",
    tile: "tile-success",
  },
  speed_demon: {
    title: "Speed Demon",
    subtitle: "Fastest accepted word",
    tile: "tile-anchor",
  },
  thinker: {
    title: "The Thinker",
    subtitle: "Took their sweet time (slowest average)",
    tile: "",
  },
  swing_miss: {
    title: "Swing and a Miss",
    subtitle: "Most words rejected",
    tile: "tile-fail",
  },
  untouchable: {
    title: "Untouchable",
    subtitle: "Won without losing a single life",
    tile: "tile-anchor",
  },
  overachiever: {
    title: "Overachiever",
    subtitle: "Crushed the chain's required length",
    tile: "tile-success",
  },
  clutch: {
    title: "Clutch Player",
    subtitle: "Turns survived on their last life",
    tile: "tile-fail",
  },
};

// Palette confetti instead of the default rainbow
const CONFETTI_COLORS = ["#a78bfa", "#8b5cf6", "#22c55e", "#ec4899", "#f5f3ff"];

/** The award's value spelled out in game tiles, flipping in one by one. */
function ValueTiles(props: { value: string; tile: string }) {
  const chars = [...props.value];
  // Long words need smaller tiles to stay on one screen
  const size =
    chars.length > 10
      ? "w-7 h-7 text-sm sm:w-9 sm:h-9 sm:text-lg"
      : "w-9 h-9 text-lg sm:w-12 sm:h-12 sm:text-2xl";
  return (
    <div className="flex flex-wrap gap-1 justify-center max-w-md">
      {chars.map((char, i) => (
        <motion.span
          key={i}
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.2, 1] }}
          transition={{ duration: 0.3, delay: 0.5 + i * 0.08 }}
          className={`tile ${props.tile} ${size}`}
        >
          {char}
        </motion.span>
      ))}
    </div>
  );
}

/** One Jackbox-style superlative card. */
function AwardCard(props: { award: Award }) {
  const meta = AWARD_META[props.award.id] ?? {
    title: props.award.id,
    subtitle: "",
    tile: "",
  };
  return (
    <motion.div
      key={props.award.id}
      initial={{ opacity: 0, y: 32, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -24, scale: 0.95 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="panel flex flex-col items-center gap-3 sm:gap-4 px-6 py-6 sm:px-12 sm:py-8 w-full max-w-lg"
    >
      <h2 className="font-display font-semibold text-2xl sm:text-4xl text-white text-center">
        {meta.title}
      </h2>
      <p className="text-white/60 text-sm sm:text-base text-center -mt-1">
        {meta.subtitle}
      </p>
      <motion.div
        initial={{ scale: 0, rotate: -8 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.2 }}
      >
        <PlayerAvatar
          username={props.award.username}
          avatar={props.award.avatar}
          size={96}
        />
      </motion.div>
      <p className="text-white font-display font-semibold text-lg sm:text-xl">
        {props.award.username}
      </p>
      <ValueTiles value={props.award.value} tile={meta.tile} />
    </motion.div>
  );
}

/** One podium column: avatar + name riding on top of a rising keycap step. */
function PodiumColumn(props: {
  player: PlayerRanking;
  place: 1 | 2 | 3;
  delay: number;
}) {
  const { player, place, delay } = props;
  // 1st gets the purple anchor-tile treatment; 2nd/3rd the neutral keycap
  const stepStyle =
    place === 1
      ? {
          background: "linear-gradient(180deg, #7c3aed 0%, #5b21b6 100%)",
          border: "1px solid rgba(255,255,255,0.22)",
          boxShadow:
            "0 4px 0 #3b1577, 0 6px 16px rgba(124,58,237,0.4), inset 0 1px 0 rgba(255,255,255,0.25)",
        }
      : {
          background: "linear-gradient(180deg, #343447 0%, #262636 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow:
            "0 4px 0 #15151f, 0 6px 12px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
        };
  const heights = { 1: "h-32 sm:h-40", 2: "h-24 sm:h-32", 3: "h-20 sm:h-28" };
  const suffix = { 1: "1st", 2: "2nd", 3: "3rd" };

  return (
    <div className="flex flex-col items-center justify-end">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: delay + 0.25 }}
        className="flex flex-col items-center mb-2 sm:mb-3"
      >
        <PlayerAvatar
          username={player.username}
          avatar={player.avatar}
          size={place === 1 ? 88 : 64}
        />
        <p
          className={`text-white font-bold mt-2 truncate max-w-[100px] sm:max-w-[130px] ${
            place === 1 ? "text-base sm:text-lg" : "text-sm sm:text-base"
          }`}
        >
          {player.username}
        </p>
        <p
          className={`text-center max-w-[110px] sm:max-w-[140px] ${
            place === 1
              ? "text-violet-300 font-bold text-sm sm:text-base"
              : "text-white/70 text-xs sm:text-sm"
          }`}
        >
          {player.stat ?? `${player.score} pts`}
        </p>
      </motion.div>
      <motion.div
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
        style={{ ...stepStyle, transformOrigin: "bottom" }}
        className={`w-24 sm:w-32 rounded-t-xl flex flex-col items-center justify-start pt-2 sm:pt-3 font-display select-none ${heights[place]}`}
      >
        <span className="text-white font-bold text-2xl sm:text-4xl">
          {place}
        </span>
        <span className="text-white/80 text-xs sm:text-sm">{suffix[place]}</span>
      </motion.div>
    </div>
  );
}

export default function WinnerScreen(props: WinnerScreenProps) {
  const awards = props.awards ?? [];
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  // Flow: one award card at a time, then the podium
  const [awardIndex, setAwardIndex] = useState(0);
  const showingAwards = awardIndex < awards.length;
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    const handleResize = () =>
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Auto-advance the award cards; longer words hold a beat longer
  useEffect(() => {
    if (!showingAwards) return;
    const holdMs = 3800 + awards[awardIndex].value.length * 80;
    const timer = setTimeout(() => setAwardIndex((i) => i + 1), holdMs);
    return () => clearTimeout(timer);
  }, [awardIndex, showingAwards, awards]);

  // Confetti pops once, when the winner's step rises
  useEffect(() => {
    if (showingAwards) return;
    const timer = setTimeout(() => setShowConfetti(true), 1000);
    return () => clearTimeout(timer);
  }, [showingAwards]);

  // Space/Enter also skips ahead (local to this player's view)
  useEffect(() => {
    if (!showingAwards) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === " " || e.key === "Enter") {
        setAwardIndex((i) => i + 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showingAwards]);

  const topThree = props.winners.slice(0, 3);
  const first = topThree.find((w) => w.rank === 1);
  const second = topThree.find((w) => w.rank === 2);
  const third = topThree.find((w) => w.rank === 3);

  if (showingAwards) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-5 px-4 py-6">
        <h1 className="font-display font-bold text-xs sm:text-sm tracking-[0.3em] uppercase text-violet-300">
          The Awards
        </h1>
        <AnimatePresence mode="wait">
          <AwardCard key={awardIndex} award={awards[awardIndex]} />
        </AnimatePresence>
        {/* Progress dots + local skip */}
        <div className="flex items-center gap-2" aria-hidden>
          {awards.map((_, i) => (
            <span
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === awardIndex ? "bg-violet-400" : "bg-white/20"
              }`}
            />
          ))}
        </div>
        <button
          onClick={() => setAwardIndex((i) => i + 1)}
          className="keycap-btn px-4 py-2 text-sm sm:text-base"
        >
          Skip →
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-6 px-4 py-6 relative overflow-y-auto">
      {showConfetti && (
        <Confetti
          width={windowSize.width}
          height={windowSize.height}
          recycle={false}
          numberOfPieces={400}
          gravity={0.3}
          colors={CONFETTI_COLORS}
        />
      )}
      <h1 className="font-display font-bold text-xs sm:text-sm tracking-[0.3em] uppercase text-violet-300">
        Final Standings
      </h1>

      {/* Podium: steps rise 3rd → 2nd → 1st, Jackbox-style suspense */}
      <div className="w-full max-w-4xl">
        <div className="flex items-end justify-center gap-2 sm:gap-4">
          {second && <PodiumColumn player={second} place={2} delay={0.5} />}
          {first && <PodiumColumn player={first} place={1} delay={0.9} />}
          {third && <PodiumColumn player={third} place={3} delay={0.15} />}
        </div>
      </div>

      {/* Ranks 4+ */}
      {props.winners.length > 3 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 1.4 }}
          className="w-full max-w-2xl"
        >
          <div className="space-y-2 max-h-40 sm:max-h-48 overflow-y-auto">
            {props.winners.slice(3).map((winner, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-3 px-4 py-2 rounded-xl bg-surface-raised border border-white/5"
              >
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  <PlayerAvatar
                    username={winner.username}
                    avatar={winner.avatar}
                    size={32}
                  />
                  <span className="text-white/60 text-sm sm:text-base font-semibold flex-shrink-0">
                    #{winner.rank}
                  </span>
                  <p className="text-white text-sm sm:text-base truncate">
                    {winner.username}
                  </p>
                </div>
                {winner.stat ? (
                  <p className="text-white/70 text-xs sm:text-sm flex-shrink-0 text-right">
                    {winner.stat}
                  </p>
                ) : (
                  <p className="text-white text-base sm:text-lg font-bold flex-shrink-0">
                    {winner.score}
                  </p>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 1.6 }}
        className="flex flex-col sm:flex-row gap-3 w-full max-w-md"
      >
        {props.isHost && props.onBackToLobby ? (
          <Button onClick={props.onBackToLobby} className="flex-1 py-3">
            Back to Lobby
          </Button>
        ) : (
          <p className="text-white/60 text-center text-sm sm:text-base px-4 w-full">
            Waiting for the host to start a new game...
          </p>
        )}
      </motion.div>
    </div>
  );
}
