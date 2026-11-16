import { useState } from "react";
import { FaPaperPlane } from "react-icons/fa";

export const CHAT_MAX_LEN = 100;

/**
 * Compact chat pill: type, Enter (or the send button) broadcasts the message
 * as a speech bubble under your avatar. Grows a little while focused.
 */
export default function ChatInput({
  onSend,
}: {
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");

  function send() {
    const trimmed = text.trim();
    if (trimmed === "") return;
    onSend(trimmed);
    setText("");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="flex items-center gap-1.5"
    >
      <input
        value={text}
        maxLength={CHAT_MAX_LEN}
        placeholder="Say something…"
        autoComplete="off"
        spellCheck="false"
        onChange={(e) => setText(e.target.value)}
        // Keep keystrokes (especially ESC) from reaching the window-level
        // game shortcuts while typing a chat message
        onKeyDown={(e) => e.stopPropagation()}
        aria-label="Chat message"
        className="w-36 focus:w-56 sm:w-44 sm:focus:w-72 transition-all bg-surface-sunken border border-white/10 focus:border-violet-400/60 rounded-full px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none"
      />
      <button
        type="submit"
        aria-label="Send message"
        // Don't steal focus from the input on press: the blur would shrink
        // the input and slide this button out from under the cursor before
        // mouseup, swallowing the click
        onMouseDown={(e) => e.preventDefault()}
        disabled={text.trim() === ""}
        className="w-9 h-9 flex items-center justify-center rounded-full bg-gradient-to-b from-violet-500 to-violet-700 text-white shadow-[0_2px_0_#4c1d95,0_4px_12px_rgba(139,92,246,0.4)] hover:from-violet-400 hover:to-violet-600 active:scale-95 disabled:opacity-30 disabled:shadow-none transition-all flex-shrink-0"
      >
        <FaPaperPlane className="text-xs" aria-hidden />
      </button>
    </form>
  );
}
