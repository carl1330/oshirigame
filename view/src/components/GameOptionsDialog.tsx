import { Dialog } from "@headlessui/react";
import Button from "./Button";

interface GameOptionsDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export default function GameOptionsDialog(props: GameOptionsDialogProps) {
  return (
    <Dialog
      open={props.isOpen}
      onClose={() => props.setIsOpen(false)}
      className="relative z-50"
    >
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <Dialog.Panel className="text-white bg-[#3F3F3F] p-4 rounded-xl">
          <Dialog.Title className="text-3xl font-bold">
            Game options
          </Dialog.Title>
          <form>
            <div>
              <p>Rounds: </p>
              <input />
              <p>Time per round: </p>
              <input />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => props.setIsOpen(false)}>Save</Button>
              <Button onClick={() => props.setIsOpen(false)}>Cancel</Button>
            </div>
          </form>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
