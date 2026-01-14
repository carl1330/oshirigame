import { Dialog } from "@headlessui/react";
import Button from "./Button";

interface GameMenuProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  isLeader: boolean;
  gameStarted: boolean;
  onCancelGame?: () => void;
  onLeaveRoom: () => void;
}

export default function GameMenu(props: GameMenuProps) {
  function handleCancelGame() {
    if (props.onCancelGame) {
      props.onCancelGame();
    }
    props.setIsOpen(false);
  }

  function handleLeaveRoom() {
    // Show confirmation dialog
    const confirmed = window.confirm(
      "Are you sure you want to leave? You will be returned to the main menu."
    );
    if (confirmed) {
      props.onLeaveRoom();
      props.setIsOpen(false);
    }
  }

  return (
    <Dialog open={props.isOpen} onClose={() => props.setIsOpen(false)}>
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-2 sm:p-4">
        <Dialog.Panel className="w-full max-w-sm rounded bg-[#3F3F3F] p-3 sm:p-4 text-white">
          <Dialog.Title className="text-xl sm:text-2xl font-bold text-center mb-4">
            Game Menu
          </Dialog.Title>
          <div className="space-y-3">
            {props.isLeader && props.gameStarted && (
              <Button
                onClick={handleCancelGame}
                className="w-full bg-orange-600 hover:bg-orange-700"
              >
                Cancel Game & Return to Lobby
              </Button>
            )}
            <Button
              onClick={handleLeaveRoom}
              className="w-full bg-red-600 hover:bg-red-700"
            >
              Leave Room
            </Button>
            <Button onClick={() => props.setIsOpen(false)} className="w-full">
              Back to Game
            </Button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
