import { AnimatePresence, motion } from "framer-motion";
import PlayerAvatar from "./PlayerAvatar";
import ChatBubble from "./ChatBubble";
import { MORPH } from "../misc/motion";
import { RailPlayer } from "./PlayerRail";
import { Bubble } from "../hooks/useChatBubbles";

interface PlayerCircleProps {
  /** Alive players in turn order (queue head first), then eliminated players */
  players: RailPlayer[];
  /** Username of the player whose turn it is, seated at the bottom */
  currentUsername?: string;
  /** Live chat bubbles, keyed by username */
  bubbles?: Record<string, Bubble>;
}

/**
 * Battle royale seating: players form a ring around the play area, with the
 * current player's seat at bottom center. The whole ring glides around as the
 * turn passes (framer layout animations pick up the position changes).
 * Eliminated players keep their seat, grayed out with a skull.
 */
export default function PlayerCircle(props: PlayerCircleProps) {
  const n = Math.max(1, props.players.length);

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden={false}>
      {props.players.map((p, i) => {
        const current = p.username === props.currentUsername;
        // Seat 0 (queue head) sits at the bottom (90° in screen coords,
        // y grows downward); the rest spread clockwise around the ring.
        const angle = (Math.PI / 2) + (i * 2 * Math.PI) / n;
        const left = 50 + 44 * Math.cos(angle);
        const top = 50 + 44 * Math.sin(angle);
        return (
          <motion.div
            key={p.username}
            layout
            layoutId={`player-${p.username}`}
            transition={{ ...MORPH }}
            // Fixed 80×96 footprint centered on the ring point via calc():
            // framer's layout animation owns `transform`, so a CSS translate
            // for centering would get overridden mid-glide
            style={{
              left: `calc(${left}% - 40px)`,
              top: `calc(${top}% - 48px)`,
            }}
            title={
              p.eliminated
                ? `${p.username} · eliminated`
                : `${p.username} · ${p.lives ?? 0} ${
                    p.lives === 1 ? "life" : "lives"
                  }`
            }
            className="absolute w-20 h-24 pointer-events-auto flex flex-col items-center justify-center gap-0.5"
          >
            <div
              className={`relative rounded-full ${
                current
                  ? "ring-[3px] ring-violet-300 ring-offset-2 ring-offset-surface shadow-[0_0_24px_rgba(139,92,246,0.6)]"
                  : p.eliminated
                  ? "opacity-40 grayscale"
                  : "opacity-85"
              }`}
            >
              <PlayerAvatar
                username={p.username}
                avatar={p.avatar}
                size={current ? 64 : 48}
              />
              {p.isHost && (
                <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-px rounded-full bg-violet-500 text-white text-[9px] font-display font-bold tracking-widest shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
                  HOST
                </span>
              )}
              <span
                className="absolute -bottom-0.5 -right-0.5 min-w-[20px] px-1 h-[20px] flex items-center justify-center rounded-full bg-surface-sunken border border-white/15 text-[11px] font-bold tabular-nums"
                aria-label={
                  p.eliminated
                    ? `${p.username}: eliminated`
                    : `${p.username}: ${p.lives ?? 0} lives`
                }
              >
                {p.eliminated ? (
                  <span aria-hidden>💀</span>
                ) : (
                  <span className="text-red-400" aria-hidden>
                    ♥{p.lives ?? 0}
                  </span>
                )}
              </span>
            </div>
            <span
              className={`max-w-[88px] truncate text-center text-xs font-display ${
                current
                  ? "text-white font-semibold"
                  : p.eliminated
                  ? "text-white/30"
                  : "text-white/60"
              }`}
            >
              {p.username}
            </span>
            <AnimatePresence>
              {props.bubbles?.[p.username] && (
                <ChatBubble
                  key={props.bubbles[p.username].key}
                  text={props.bubbles[p.username].text}
                />
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
