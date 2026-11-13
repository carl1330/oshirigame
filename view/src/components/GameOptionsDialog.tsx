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
  currentLanguage: string;
  currentBannedAtama: string;
  currentBannedOshiri: string;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  sendEvent: (eventType: string, payload: Message | null) => void;
}

const alphabets: Record<string, string> = {
  english: "abcdefghijklmnopqrstuvwxyz",
  swedish: "abcdefghijklmnopqrstuvwxyzåäö",
};

// Keep only unique letters from the language's alphabet, leaving at least one available
function sanitizeBannedLetters(input: string, language: string): string {
  const alphabet = alphabets[language] ?? alphabets.english;
  const letters = [...input.toLowerCase()].filter((c) => alphabet.includes(c));
  return [...new Set(letters)].slice(0, alphabet.length - 1).join("");
}

export default function GameOptionsDialog(props: GameOptionsDialogProps) {
  const [maxRounds, setMaxRounds] = useState(props.currentMaxRounds);
  const [roundTime, setRoundTime] = useState(props.currentRoundTime);
  const [minWordCombos, setMinWordCombos] = useState(props.currentMaxRounds);
  const [language, setLanguage] = useState(props.currentLanguage);
  const [bannedAtama, setBannedAtama] = useState(props.currentBannedAtama);
  const [bannedOshiri, setBannedOshiri] = useState(props.currentBannedOshiri);

  function handleLanguageChange(newLanguage: string) {
    setLanguage(newLanguage);
    setBannedAtama((v) => sanitizeBannedLetters(v, newLanguage));
    setBannedOshiri((v) => sanitizeBannedLetters(v, newLanguage));
  }

  function handleSave(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const newOptions: GameOptionsEvent = {
      maxRounds: maxRounds,
      roundTime: roundTime,
      minWordCombinations: minWordCombos,
      language: language,
      bannedAtama: bannedAtama,
      bannedOshiri: bannedOshiri,
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

            <div>
              <p className="text-sm sm:text-base">Language</p>
              <select
                value={language}
                className="w-full text-black px-2 py-1 rounded text-base"
                onChange={(e) => handleLanguageChange(e.target.value)}
              >
                <option value="english">English</option>
                <option value="swedish">Svenska</option>
              </select>
            </div>

            <div>
              <p className="text-sm sm:text-base">Banned starting letters</p>
              <input
                value={bannedAtama}
                className="w-full text-black px-2 py-1 rounded text-base"
                type="text"
                placeholder="e.g. xqz"
                onChange={(e) =>
                  setBannedAtama(sanitizeBannedLetters(e.target.value, language))
                }
              />
            </div>

            <div>
              <p className="text-sm sm:text-base">Banned ending letters</p>
              <input
                value={bannedOshiri}
                className="w-full text-black px-2 py-1 rounded text-base"
                type="text"
                placeholder="e.g. jqv"
                onChange={(e) =>
                  setBannedOshiri(sanitizeBannedLetters(e.target.value, language))
                }
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
