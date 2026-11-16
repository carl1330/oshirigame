import { useEffect, useRef, useState } from "react";

export interface Bubble {
  text: string;
  /** Changes per message so AnimatePresence re-pops the bubble */
  key: number;
}

/**
 * Per-player chat bubbles keyed by username. A new message from the same
 * player replaces their bubble and restarts its timer; longer messages
 * linger a bit longer so they can actually be read.
 */
export function useChatBubbles() {
  const [bubbles, setBubbles] = useState<Record<string, Bubble>>({});
  const timers = useRef<Record<string, number>>({});

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(window.clearTimeout);
  }, []);

  function showBubble(username: string, text: string) {
    setBubbles((b) => ({ ...b, [username]: { text, key: Date.now() } }));
    window.clearTimeout(timers.current[username]);
    const ms = Math.min(8000, 4000 + text.length * 40);
    timers.current[username] = window.setTimeout(() => {
      setBubbles((b) => {
        const next = { ...b };
        delete next[username];
        return next;
      });
    }, ms);
  }

  return { bubbles, showBubble };
}
