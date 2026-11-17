import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FaChevronDown } from "react-icons/fa";
import PlayerAvatar from "./PlayerAvatar";

export interface LeaderboardWord {
  atama: string;
  oshiri: string;
  word: string;
  accepted: boolean;
  score: number;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  avatar: string;
  score: number;
  /** Only present once the viewer has finished their own run */
  results?: LeaderboardWord[];
}

interface DailyLeaderboardProps {
  entries: LeaderboardEntry[];
  total: number;
  /** Highlight the viewer's own row */
  highlightUsername?: string;
  highlightRank?: number;
}

const MEDALS = ["🥇", "🥈", "🥉"];

function WordRow({ result, index }: { result: LeaderboardWord; index: number }) {
  const word = result.word.toUpperCase();
  const head = result.atama.toUpperCase();
  const tail = result.oshiri.toUpperCase();
  const middle = word.slice(head.length, word.length - tail.length);
  return (
    <div className="flex items-center gap-2 px-2 py-1 font-display text-sm">
      <span className="text-white/30 w-5 text-right tabular-nums">
        {index + 1}
      </span>
      <span className="flex-1 uppercase tracking-wide truncate">
        {word ? (
          result.accepted ? (
            <>
              <span className="text-white/50">{head}</span>
              <span className="text-white">{middle}</span>
              <span className="text-white/50">{tail}</span>
            </>
          ) : (
            <span className="text-white/40 line-through">{word}</span>
          )
        ) : (
          <span className="text-white/40">
            {head} … {tail}
          </span>
        )}
      </span>
      <span
        className={`w-12 text-right tabular-nums ${
          result.accepted ? "text-violet-300" : "text-white/30"
        }`}
      >
        {result.accepted ? `+${result.score}` : "0"}
      </span>
    </div>
  );
}

export default function DailyLeaderboard(props: DailyLeaderboardProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (props.entries.length === 0) {
    return (
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-white/40 text-center py-6"
      >
        No scores yet today. Be the first!
      </motion.p>
    );
  }

  return (
    <div className="flex flex-col gap-1 w-full">
      {props.entries.map((entry, index) => {
        const isViewer =
          entry.username === props.highlightUsername &&
          entry.rank === props.highlightRank;
        const expandable = (entry.results?.length ?? 0) > 0;
        const isExpanded = expandable && expanded === index;
        return (
          <motion.div
            key={`${index}-${entry.username}-${entry.score}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.04 }}
            className={`rounded-xl ${
              isViewer
                ? "bg-violet-500/20 border border-violet-400/40"
                : "bg-surface-sunken border border-white/5"
            }`}
          >
            <div
              role={expandable ? "button" : undefined}
              tabIndex={expandable ? 0 : undefined}
              aria-expanded={expandable ? isExpanded : undefined}
              onClick={
                expandable
                  ? () => setExpanded(isExpanded ? null : index)
                  : undefined
              }
              onKeyDown={
                expandable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpanded(isExpanded ? null : index);
                      }
                    }
                  : undefined
              }
              className={`flex items-center gap-3 px-3 py-2 ${
                expandable ? "cursor-pointer" : ""
              }`}
            >
              <span className="w-8 text-center font-display font-semibold text-white/70">
                {entry.rank <= 3 ? MEDALS[entry.rank - 1] : entry.rank}
              </span>
              <PlayerAvatar
                username={entry.username}
                avatar={entry.avatar}
                size={28}
              />
              <span className="flex-1 truncate text-white font-display">
                {entry.username}
              </span>
              <span className="font-display font-semibold text-violet-300">
                {entry.score}
              </span>
              {expandable && (
                <FaChevronDown
                  aria-hidden
                  className={`text-white/40 transition-transform duration-200 ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                />
              )}
            </div>
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col pb-2 px-2 border-t border-white/5 pt-1">
                    {entry.results!.map((r, i) => (
                      <WordRow key={i} result={r} index={i} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
      {props.total > props.entries.length && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: props.entries.length * 0.04 }}
          className="text-white/40 text-sm text-center pt-1"
        >
          {props.total} players today
        </motion.p>
      )}
    </div>
  );
}
