import { Dialog } from "@headlessui/react";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface GameMenuProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  isHost: boolean;
  gameStarted: boolean;
  round?: number;
  maxRounds?: number;
  onCancelGame?: () => void;
  onLeaveRoom: () => void;
}

interface PauseOptionProps {
  letter: string;
  label: string;
  hint?: string;
  danger?: boolean;
  index: number;
  onClick: () => void;
}

/** One takeover menu row: letter-tile hotkey + huge display type */
function PauseOption(props: PauseOptionProps) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: props.index * 0.06, duration: 0.3, ease: "easeOut" }}
      onClick={props.onClick}
      className={`pause-opt text-2xl sm:text-4xl py-2 ${
        props.danger ? "pause-opt-danger" : ""
      }`}
    >
      <span
        className="tile pause-key w-9 h-9 text-lg sm:w-12 sm:h-12 sm:text-2xl"
        aria-hidden
      >
        {props.letter}
      </span>
      <span>{props.label}</span>
      {props.hint && (
        <span className="font-body text-xs sm:text-sm font-bold text-white/30 self-center">
          {props.hint}
        </span>
      )}
    </motion.button>
  );
}

export default function GameMenu(props: GameMenuProps) {
  // Leave Room is destructive, ask for confirmation inside the takeover
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  // Always reopen on the main menu, not a stale confirm step
  useEffect(() => {
    if (props.isOpen) {
      setConfirmingLeave(false);
    }
  }, [props.isOpen]);

  function handleCancelGame() {
    if (props.onCancelGame) {
      props.onCancelGame();
    }
    props.setIsOpen(false);
  }

  function handleConfirmLeave() {
    props.setIsOpen(false);
    props.onLeaveRoom();
  }

  // The letter tiles double as hotkeys. The dialog traps focus while open,
  // so these never collide with the game's word input.
  useEffect(() => {
    if (!props.isOpen) return;
    function onKey(e: KeyboardEvent) {
      const key = e.key.toLowerCase();
      if (confirmingLeave) {
        if (key === "s") setConfirmingLeave(false);
        if (key === "l") handleConfirmLeave();
        return;
      }
      if (key === "b") props.setIsOpen(false);
      if (key === "c" && props.isHost && props.gameStarted) handleCancelGame();
      if (key === "l") setConfirmingLeave(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isOpen, confirmingLeave, props.isHost, props.gameStarted]);

  const showRound =
    props.gameStarted && props.round !== undefined && props.maxRounds;

  return (
    <Dialog open={props.isOpen} onClose={() => props.setIsOpen(false)}>
      <div className="pause-backdrop" aria-hidden="true" />
      <Dialog.Panel className="fixed inset-0 z-50 flex flex-col justify-center px-8 sm:px-16 md:px-24">
        {/* Context players actually pause to check */}
        {showRound && (
          <span className="absolute top-5 right-5 sm:top-6 sm:right-6 font-display font-semibold text-sm text-white/60 px-4 py-1.5 rounded-full border border-white/10 bg-surface/80">
            Round {props.round}/{props.maxRounds}
          </span>
        )}

        {confirmingLeave ? (
          <>
            <Dialog.Title className="font-display font-bold text-xs sm:text-sm tracking-[0.3em] uppercase text-violet-300 mb-4">
              Leave room?
            </Dialog.Title>
            <p className="text-white/60 text-base sm:text-lg mb-6 max-w-sm">
              You'll be returned to the main menu.
            </p>
            <div className="flex flex-col items-start gap-1">
              <PauseOption
                letter="S"
                label="Stay in room"
                index={0}
                onClick={() => setConfirmingLeave(false)}
              />
              <PauseOption
                letter="L"
                label="Leave room"
                danger
                index={1}
                onClick={handleConfirmLeave}
              />
            </div>
          </>
        ) : (
          <>
            <Dialog.Title className="font-display font-bold text-xs sm:text-sm tracking-[0.3em] uppercase text-violet-300 mb-6">
              {props.gameStarted ? "Paused" : "Menu"}
            </Dialog.Title>
            <div className="flex flex-col items-start gap-1">
              <PauseOption
                letter="B"
                label="Back to game"
                hint="ESC"
                index={0}
                onClick={() => props.setIsOpen(false)}
              />
              {props.isHost && props.gameStarted && (
                <PauseOption
                  letter="C"
                  label="Cancel game"
                  hint="back to lobby"
                  index={1}
                  onClick={handleCancelGame}
                />
              )}
              <PauseOption
                letter="L"
                label="Leave room"
                danger
                index={props.isHost && props.gameStarted ? 2 : 1}
                onClick={() => setConfirmingLeave(true)}
              />
            </div>
          </>
        )}

        <span className="absolute bottom-6 left-8 sm:left-16 md:left-24 text-xs sm:text-sm font-bold text-white/30">
          Press a letter key to choose · ESC to close
        </span>
      </Dialog.Panel>
    </Dialog>
  );
}
