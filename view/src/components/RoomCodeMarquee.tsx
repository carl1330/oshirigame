import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import { MORPH } from "../misc/motion";

interface RoomCodeMarqueeProps {
  code: string;
  copied: boolean;
  onCopy: () => void;
}

/**
 * The room code spelled in the game's own letter tiles. The first and last
 * tiles carry the same layoutIds as the in-game atama/oshiri randomizers,
 * so on game start they fly from the marquee into the word row.
 */
export default function RoomCodeMarquee(props: RoomCodeMarqueeProps) {
  const chars = props.code.split("");
  const last = chars.length - 1;

  // Tiles shrink with the browser width so long codes never overflow the
  // panel: full 4rem tiles when there's room, down to a 1.5rem floor
  // (flex-wrap catches the pathological rest)
  const tileSize = {
    "--tile": `clamp(1.5rem, calc((100vw - 12rem) / ${chars.length}), 4rem)`,
  } as CSSProperties;
  const tileClass =
    "tile w-[var(--tile)] h-[var(--tile)] text-[length:calc(var(--tile)*0.62)] " +
    "transition-shadow group-hover:shadow-[0_4px_0_#15151f,0_0_16px_rgba(139,92,246,0.5)]";

  return (
    <div className="flex flex-col items-center gap-2 max-w-full">
      <button
        type="button"
        onClick={props.onCopy}
        aria-label="Copy invite link"
        style={tileSize}
        className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5 group max-w-full px-2"
      >
        <span className="text-white/40 font-display text-xs sm:text-sm uppercase tracking-widest mr-1.5">
          Room
        </span>
        {chars.map((c, i) => {
          const tile = <div className={tileClass}>{c.toUpperCase()}</div>;
          if (i === 0) {
            return (
              <motion.div key={i} layoutId="anchor-atama" transition={MORPH}>
                {tile}
              </motion.div>
            );
          }
          if (i === last) {
            return (
              <motion.div key={i} layoutId="anchor-oshiri" transition={MORPH}>
                {tile}
              </motion.div>
            );
          }
          return <div key={i}>{tile}</div>;
        })}
      </button>
      <p
        aria-live="polite"
        className={`text-xs sm:text-sm transition-colors ${
          props.copied ? "text-green-300 font-semibold" : "text-white/40"
        }`}
      >
        {props.copied ? "Invite link copied!" : "Tap the code to copy the invite link"}
      </p>
    </div>
  );
}
