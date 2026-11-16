import { Dialog } from "@headlessui/react";
import { useEffect, useState } from "react";
import Button from "./Button";

interface GameMenuProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  isHost: boolean;
  gameStarted: boolean;
  onCancelGame?: () => void;
  onLeaveRoom: () => void;
}

export default function GameMenu(props: GameMenuProps) {
  // Leave Room is destructive — ask for confirmation inside the dialog
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

  return (
    <Dialog open={props.isOpen} onClose={() => props.setIsOpen(false)}>
      <div className="dialog-backdrop" aria-hidden="true" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-2 sm:p-4">
        <Dialog.Panel className="dialog-panel">
          {confirmingLeave ? (
            <>
              <Dialog.Title className="dialog-title mb-2">
                Leave room?
              </Dialog.Title>
              <p className="text-white/60 text-sm text-center mb-5">
                You'll be returned to the main menu.
              </p>
              <div className="flex flex-col gap-3">
                <Button
                  variant="secondary"
                  onClick={() => setConfirmingLeave(false)}
                  className="w-full"
                >
                  Stay in room
                </Button>
                <Button
                  variant="danger"
                  onClick={handleConfirmLeave}
                  className="w-full"
                >
                  Leave room
                </Button>
              </div>
            </>
          ) : (
            <>
              <Dialog.Title className="dialog-title mb-5">
                Game Menu
              </Dialog.Title>
              <div className="flex flex-col gap-3">
                {/* Safe action first, destructive actions grouped below */}
                <Button
                  onClick={() => props.setIsOpen(false)}
                  className="w-full"
                >
                  Back to Game
                </Button>
                {props.isHost && props.gameStarted && (
                  <Button
                    variant="secondary"
                    onClick={handleCancelGame}
                    className="w-full"
                  >
                    Cancel Game & Return to Lobby
                  </Button>
                )}
                <Button
                  variant="danger"
                  onClick={() => setConfirmingLeave(true)}
                  className="w-full"
                >
                  Leave Room
                </Button>
              </div>
            </>
          )}
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
