import { motion } from "framer-motion";
import PlayerAvatar from "./PlayerAvatar";

export interface LeaderboardEntry {
  rank: number;
  username: string;
  avatar: string;
  score: number;
}

interface DailyLeaderboardProps {
  entries: LeaderboardEntry[];
  total: number;
  /** Highlight the viewer's own row */
  highlightUsername?: string;
  highlightRank?: number;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function DailyLeaderboard(props: DailyLeaderboardProps) {
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
        return (
          <motion.div
            key={`${index}-${entry.username}-${entry.score}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.04 }}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl ${
              isViewer
                ? "bg-violet-500/20 border border-violet-400/40"
                : "bg-surface-sunken border border-white/5"
            }`}
          >
            <span className="w-8 text-center font-display font-semibold text-white/70">
              {entry.rank <= 3 ? MEDALS[entry.rank - 1] : entry.rank}
            </span>
            <PlayerAvatar username={entry.username} avatar={entry.avatar} size={28} />
            <span className="flex-1 truncate text-white font-display">
              {entry.username}
            </span>
            <span className="font-display font-semibold text-violet-300">
              {entry.score}
            </span>
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
