import type { Transition } from "framer-motion";

/**
 * Shared-element morph for the lobby ⇄ game transition (avatars, letter
 * tiles, start button/timer). One long ease-out curve, no bounce, beats are
 * sequenced by per-element delays on the game side.
 */
export const MORPH: Transition = { duration: 0.7, ease: [0.22, 1, 0.36, 1] };

/** Beat delays (seconds) for elements entering the game screen:
 *  1. avatars fly to the rail (0–0.7s, staggered)
 *  2. tiles fly down into the word row (0.45–1.3s)
 *  3. the round furniture settles in (input slot, drain bar, hints)
 *  4. "GO!" stamps, the round is on
 */
export const BEAT = {
  tiles: 0.45,
  tilesStagger: 0.15,
  timer: 0.75,
  roundHeader: 0.9,
  settle: 1.15,
  go: 1.35,
} as const;
