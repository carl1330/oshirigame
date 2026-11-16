import { Dialog } from "@headlessui/react";
import Button from "./Button";

interface WordListDialogProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  atama: string;
  oshiri: string;
  words: string[];
}

export default function WordListDialog(props: WordListDialogProps) {
  return (
    <Dialog open={props.isOpen} onClose={() => props.setIsOpen(false)}>
      <div className="dialog-backdrop" aria-hidden="true" />
      <div className="fixed inset-0 z-50 flex w-screen items-center justify-center p-2 sm:p-4">
        <Dialog.Panel className="dialog-panel max-w-lg flex flex-col max-h-[85vh]">
          <Dialog.Title className="dialog-title mb-1">
            All possible words
          </Dialog.Title>
          <p className="text-white/50 text-sm text-center mb-4">
            <span className="text-violet-300 font-display font-semibold uppercase">
              {props.atama}
            </span>
            {" … "}
            <span className="text-violet-300 font-display font-semibold uppercase">
              {props.oshiri}
            </span>
            {" · "}
            {props.words.length} words, longest first
          </p>
          <div className="flex-1 overflow-y-auto panel-sunken p-3 mb-4">
            <div className="flex flex-wrap gap-1.5 justify-center">
              {props.words.map((word) => (
                <span
                  key={word}
                  className="text-white/90 text-sm px-2.5 py-1 rounded-full bg-surface-raised border border-white/5"
                >
                  {word}
                </span>
              ))}
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => props.setIsOpen(false)}
            className="w-full"
          >
            Close
          </Button>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
