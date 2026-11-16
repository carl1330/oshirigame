import { motion } from "framer-motion";
import PlayerAvatar from "./PlayerAvatar";
import { MORPH } from "../misc/motion";

export interface RailPlayer {
  username: string;
  avatar: string;
  score: number;
  isHost: boolean;
}

interface PlayerRailProps {
  players: RailPlayer[];
  /** Username of the player whose turn it is (ringed + highlighted) */
  currentUsername?: string;
}

/** Avatars shown before collapsing the rest into a "+N" chip */
const MAX_VISIBLE = 5;

/**
 * In-game player rail: big avatar circles in queue order, current player
 * ringed, host labeled, score as a corner chip. Shares layoutIds with
 * PlayerStage so the lobby avatars fly into their rail slots on game start.
 */
export default function PlayerRail(props: PlayerRailProps) {
  const visible = props.players.slice(0, MAX_VISIBLE);
  const hidden = props.players.slice(MAX_VISIBLE);

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      {visible.map((p, i) => {
        const current = p.username === props.currentUsername;
        return (
          <motion.div
            key={p.username}
            layoutId={`player-${p.username}`}
            transition={{ ...MORPH, delay: i * 0.07 }}
            title={`${p.username} — ${p.score} pts`}
            className={`relative flex-none rounded-full ${
              current
                ? "ring-[3px] ring-violet-300 ring-offset-2 ring-offset-surface shadow-[0_0_24px_rgba(139,92,246,0.6)]"
                : "opacity-80"
            }`}
          >
            <PlayerAvatar username={p.username} avatar={p.avatar} size={64} />
            {p.isHost && (
              <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-px rounded-full bg-violet-500 text-white text-[9px] font-display font-bold tracking-widest shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
                HOST
              </span>
            )}
            <span
              className="absolute -bottom-0.5 -right-0.5 min-w-[22px] px-1.5 h-[22px] flex items-center justify-center rounded-full bg-surface-sunken border border-white/15 text-white text-xs font-bold tabular-nums"
              aria-label={`${p.username}: ${p.score} points`}
            >
              {p.score}
            </span>
          </motion.div>
        );
      })}
      {hidden.length > 0 && (
        <div
          title={hidden.map((p) => `${p.username} — ${p.score} pts`).join("\n")}
          className="flex-none w-16 h-16 rounded-full bg-surface-sunken border border-white/15 flex items-center justify-center text-white/70 font-display font-bold"
        >
          +{hidden.length}
        </div>
      )}
    </div>
  );
}
