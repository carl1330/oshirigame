import { Dialog } from "@headlessui/react";
import Button from "./Button";
import React, { useState } from "react";
import {
  EventUpdateGameOptions,
  GameOptionsEvent,
  Message,
} from "../routes/Room";

interface GameOptionsDialogProps {
  currentMaxRounds: number;
  currentRoundTime: number;
  currentMinWordCombos: number;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  sendEvent: (eventType: string, payload: Message | null) => void;
}

export default function GameOptionsDialog(props: GameOptionsDialogProps) {
  const [maxRounds, setMaxRounds] = useState(props.currentMaxRounds);
  const [roundTime, setRoundTime] = useState(props.currentRoundTime);
  const [minWordCombos, setMinWordCombos] = useState(props.currentMaxRounds);

  function handleSave(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const newOptions: GameOptionsEvent = {
      maxRounds: maxRounds,
      roundTime: roundTime,
      minWordCombinations: minWordCombos,
    };
    props.sendEvent(EventUpdateGameOptions, newOptions);
    props.setIsOpen(false);
  }

  return (
    <Dialog open={props.isOpen} onClose={() => props.setIsOpen(false)}>
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-2 sm:p-4">
        <Dialog.Panel className="w-full max-w-sm rounded bg-[#3F3F3F] p-3 sm:p-4 text-white">
          <Dialog.Title className="text-xl sm:text-3xl text-bold text-center mb-4">
            Game Options
          </Dialog.Title>
          <div className="space-y-4">
            <div>
              <p className="text-sm sm:text-base">Rounds: </p>
              <input
                defaultValue={props.currentMaxRounds}
                className="w-full text-black px-2 py-1 rounded text-base"
                type="number"
                min={1}
                max={10}
                step={1}
                onChange={(e) => setMaxRounds(parseInt(e.target.value))}
              />
            </div>
            <div>
              <p className="text-sm sm:text-base">Round time: </p>
              <input
                defaultValue={props.currentRoundTime}
                className="w-full text-black px-2 py-1 rounded text-base"
                type="number"
                min={1}
                max={60}
                step={1}
                onChange={(e) => setRoundTime(parseInt(e.target.value))}
              />
            </div>

            <div>
              <p className="text-sm sm:text-base">Minimum word combinations</p>
              <input
                defaultValue={props.currentMinWordCombos}
                className="w-full text-black px-2 py-1 rounded text-base"
                type="number"
                step={1}
                onChange={(e) => setMinWordCombos(parseInt(e.target.value))}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} className="flex-1">Save</Button>
              <Button onClick={() => props.setIsOpen(false)} className="flex-1">Cancel</Button>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
