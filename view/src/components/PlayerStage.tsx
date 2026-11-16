import { AnimatePresence, motion } from "framer-motion";
import PlayerAvatar from "./PlayerAvatar";
import { MORPH } from "../misc/motion";

export interface StagePlayer {
  username: string;
  avatar: string;
  isHost: boolean;
}

interface PlayerStageProps {
  players: StagePlayer[];
  /** Tapping an empty seat copies the invite link */
  onInvite: () => void;
  copied: boolean;
}

const ROOM_SOFT_CAP = 8;
const MAX_EMPTY_SEATS = 2;

const SEAT_SPRING = { type: "spring", stiffness: 300, damping: 26 } as const;

/**
 * Lobby center stage: players as big avatars, plus dashed empty seats that
 * advertise room for more and double as the invite CTA. Each player shares a
 * layoutId with their PlayerRail slot, so on game start they fly into the rail.
 */
export default function PlayerStage(props: PlayerStageProps) {
  const emptySeats = Math.max(
    0,
    Math.min(MAX_EMPTY_SEATS, ROOM_SOFT_CAP - props.players.length)
  );

  return (
    <div className="flex flex-wrap justify-center items-start gap-3 sm:gap-5 max-w-2xl px-2">
      <AnimatePresence mode="popLayout">
        {props.players.map((p) => (
          <motion.div
            key={p.username}
            layoutId={`player-${p.username}`}
            transition={{ scale: SEAT_SPRING, opacity: { duration: 0.25 }, layout: MORPH }}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            className="flex flex-col items-center gap-1.5 w-20 sm:w-24"
          >
            <div className="relative">
              <div className="rounded-full p-1 bg-surface-sunken border border-white/10">
                <PlayerAvatar username={p.username} avatar={p.avatar} size={64} />
              </div>
              {p.isHost && (
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 px-2 py-px rounded-full bg-violet-500 text-white text-[10px] font-display font-bold tracking-widest shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
                  HOST
                </span>
              )}
            </div>
            <span className="text-white font-display font-semibold text-xs sm:text-sm truncate w-full text-center">
              {p.username}
            </span>
          </motion.div>
        ))}
        {Array.from({ length: emptySeats }).map((_, i) => (
          <motion.button
            key={`seat-${i}`}
            type="button"
            onClick={props.onInvite}
            aria-label="Copy invite link"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={SEAT_SPRING}
            className="flex flex-col items-center gap-1.5 w-20 sm:w-24 group"
          >
            <span className="w-[72px] h-[72px] rounded-full border-2 border-dashed border-white/20 flex items-center justify-center text-white/40 text-3xl font-display group-hover:border-violet-400/60 group-hover:text-violet-300 transition-colors">
              +
            </span>
            <span className="text-white/40 text-xs group-hover:text-violet-300 transition-colors">
              {i === 0 ? (props.copied ? "Link copied!" : "Invite") : " "}
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
