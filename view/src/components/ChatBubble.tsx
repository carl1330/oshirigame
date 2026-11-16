import { motion } from "framer-motion";

/**
 * Speech bubble pinned under a player's avatar. The outer div owns the
 * centering transform, framer-motion animates the inner element's transform,
 * so a -translate-x-1/2 there would be overwritten mid-animation.
 */
export default function ChatBubble({ text }: { text: string }) {
  return (
    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-30 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, y: -6, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        role="status"
        className="relative bg-white text-gray-900 text-xs font-semibold rounded-2xl px-3 py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.45)] w-max max-w-[160px] break-words text-center"
      >
        {/* Tail pointing up at the avatar */}
        <span
          className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white rotate-45 rounded-[2px]"
          aria-hidden
        />
        {text}
      </motion.div>
    </div>
  );
}
