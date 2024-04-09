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
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-sm rounded bg-[#3F3F3F] p-4 text-white">
          <Dialog.Title className="text-3xl text-bold">
            Game Options
          </Dialog.Title>
          <p>Rounds: </p>
          <input
            defaultValue={props.currentMaxRounds}
            className="text-black"
            type="number"
            min={1}
            max={10}
            step={1}
            onChange={(e) => setMaxRounds(parseInt(e.target.value))}
          />
          <p>Round time: </p>
          <input
            defaultValue={props.currentRoundTime}
            className="text-black"
            type="number"
            min={1}
            max={60}
            step={1}
            onChange={(e) => setRoundTime(parseInt(e.target.value))}
          />

          <p>Minimum word combinations</p>
          <input
            defaultValue={props.currentMinWordCombos}
            className="text-black"
            type="number"
            step={1}
            onChange={(e) => setMinWordCombos(parseInt(e.target.value))}
          />

          <div className="flex gap-2">
            <Button onClick={handleSave}>Save</Button>
            <Button onClick={() => props.setIsOpen(false)}>Cancel</Button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
