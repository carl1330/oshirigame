import { Dialog } from "@headlessui/react";
import Button from "./Button";
import React, { useEffect, useState } from "react";
import {
  FaCrown,
  FaDice,
  FaEquals,
  FaMinus,
  FaPlus,
  FaRulerHorizontal,
  FaSyncAlt,
} from "react-icons/fa";
import {
  EventUpdateGameOptions,
  GameOptionsEvent,
  Message,
} from "../routes/Room";

interface GameOptionsDialogProps {
  currentGameMode: string;
  currentMaxRounds: number;
  currentRoundTime: number;
  currentMinWordCombos: number;
  currentLanguage: string;
  currentBannedAtama: string;
  currentBannedOshiri: string;
  currentSubmitOnEnter: boolean;
  currentLives: number;
  currentSwapTurns: number;
  currentMutation: string;
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

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}

function Stepper(props: StepperProps) {
  const step = props.step ?? 1;
  const clamp = (v: number) => Math.min(props.max, Math.max(props.min, v));

  return (
    <div>
      <span className="field-label">{props.label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${props.label}`}
          disabled={props.value <= props.min}
          onClick={() => props.onChange(clamp(props.value - step))}
          className="keycap-btn w-12 h-12"
        >
          <FaMinus aria-hidden />
        </button>
        <div className="flex-1 h-12 flex items-center justify-center rounded-xl bg-surface-sunken border border-white/10 font-display font-semibold text-lg tabular-nums">
          {props.value}
          {props.suffix && (
            <span className="text-white/40 text-sm ml-1 font-body">
              {props.suffix}
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label={`Increase ${props.label}`}
          disabled={props.value >= props.max}
          onClick={() => props.onChange(clamp(props.value + step))}
          className="keycap-btn w-12 h-12"
        >
          <FaPlus aria-hidden />
        </button>
      </div>
    </div>
  );
}

const languages = [
  { value: "english", label: "English", flag: "🇬🇧" },
  { value: "swedish", label: "Svenska", flag: "🇸🇪" },
];

const gameModes = [
  {
    value: "classic",
    label: "Classic",
    icon: FaSyncAlt,
    description: "Take turns finding a word between the letters",
  },
  {
    value: "longest",
    label: "Longest word",
    icon: FaRulerHorizontal,
    description: "Everyone writes at once. The longest valid word scores",
  },
  {
    value: "royale",
    label: "Battle royale",
    icon: FaCrown,
    description:
      "Each word must beat the last one's length. Fail and you lose a life. Last one standing wins!",
  },
];

// Battle royale chain rule mutations. "None" is a first-class choice so the
// group reads as a complete picker, and new mutations only need a new entry.
const mutations = [
  {
    value: "",
    label: "None",
    icon: FaDice,
    description: "Any word longer than the last keeps the chain alive",
  },
  {
    value: "exactLength",
    label: "Exact length",
    icon: FaEquals,
    description: "Words must grow by exactly one letter — no overshooting",
  },
];

export default function GameOptionsDialog(props: GameOptionsDialogProps) {
  const [maxRounds, setMaxRounds] = useState(props.currentMaxRounds);
  const [roundTime, setRoundTime] = useState(props.currentRoundTime);
  const [minWordCombos, setMinWordCombos] = useState(
    props.currentMinWordCombos
  );
  const [language, setLanguage] = useState(props.currentLanguage);
  const [gameMode, setGameMode] = useState(props.currentGameMode);
  const [bannedAtama, setBannedAtama] = useState(props.currentBannedAtama);
  const [bannedOshiri, setBannedOshiri] = useState(props.currentBannedOshiri);
  const [submitOnEnter, setSubmitOnEnter] = useState(props.currentSubmitOnEnter);
  const [lives, setLives] = useState(props.currentLives);
  const [swapTurns, setSwapTurns] = useState(props.currentSwapTurns);
  const [mutation, setMutation] = useState(props.currentMutation);

  // Re-sync from live game state each time the dialog opens
  useEffect(() => {
    if (props.isOpen) {
      setMaxRounds(props.currentMaxRounds);
      setRoundTime(props.currentRoundTime);
      setMinWordCombos(props.currentMinWordCombos);
      setLanguage(props.currentLanguage);
      setGameMode(props.currentGameMode);
      setBannedAtama(props.currentBannedAtama);
      setBannedOshiri(props.currentBannedOshiri);
      setSubmitOnEnter(props.currentSubmitOnEnter);
      setLives(props.currentLives);
      setSwapTurns(props.currentSwapTurns);
      setMutation(props.currentMutation);
    }
  }, [props.isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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
      gameMode: gameMode,
      bannedAtama: bannedAtama,
      bannedOshiri: bannedOshiri,
      submitOnEnter: submitOnEnter,
      lives: lives,
      swapTurns: swapTurns,
      mutation: mutation,
    };
    props.sendEvent(EventUpdateGameOptions, newOptions);
    props.setIsOpen(false);
  }

  return (
    <Dialog open={props.isOpen} onClose={() => props.setIsOpen(false)}>
      <div className="dialog-backdrop" aria-hidden="true" />
      <div className="fixed inset-0 z-50 flex w-screen items-center justify-center p-2 sm:p-4 overflow-y-auto">
        <Dialog.Panel className="dialog-panel dialog-panel-wide my-auto">
          <Dialog.Title className="dialog-title mb-5">
            Game Options
          </Dialog.Title>
          <div className="space-y-5">
            <div role="radiogroup" aria-label="Game mode">
              <span className="field-label">Game mode</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {gameModes.map((mode) => {
                  const selected = gameMode === mode.value;
                  const Icon = mode.icon;
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setGameMode(mode.value)}
                      className={`flex sm:flex-col items-center sm:items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                        selected
                          ? "bg-violet-500/15 border-violet-400/60"
                          : "bg-surface-sunken border-white/10 hover:border-white/25"
                      }`}
                    >
                      {/* Mode icon on a keycap tile, lights purple like an
                          anchor when selected */}
                      <span
                        className={`tile w-10 h-10 sm:w-10 sm:h-10 text-base sm:text-base rounded-lg flex-shrink-0 ${
                          selected ? "tile-anchor" : ""
                        }`}
                        aria-hidden
                      >
                        <Icon className="text-base" />
                      </span>
                      <span className="flex flex-col items-start">
                        <span className="text-sm font-semibold text-white/90 font-display">
                          {mode.label}
                        </span>
                        <span className="text-sm text-white/60">
                          {mode.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              {/* Battle royale has no fixed round count, it ends when one
                  player is left standing */}
              {gameMode !== "royale" && (
                <Stepper
                  label="Rounds"
                  value={maxRounds}
                  min={1}
                  max={10}
                  onChange={setMaxRounds}
                />
              )}
              {gameMode === "royale" && (
                <>
                  <Stepper
                    label="Lives"
                    value={lives}
                    min={1}
                    max={5}
                    onChange={setLives}
                  />
                  <Stepper
                    label="New letters every"
                    value={swapTurns}
                    min={2}
                    max={10}
                    suffix="turns"
                    onChange={setSwapTurns}
                  />
                </>
              )}
              <Stepper
                label="Round time"
                value={roundTime}
                min={5}
                max={60}
                step={5}
                suffix="sec"
                onChange={setRoundTime}
              />
              <Stepper
                label="Minimum word combinations"
                value={minWordCombos}
                min={1}
                max={1000}
                step={10}
                onChange={setMinWordCombos}
              />

              <div>
                <span className="field-label">Language</span>
                <div className="flex gap-2">
                  {languages.map((lang) => (
                    <button
                      key={lang.value}
                      type="button"
                      onClick={() => handleLanguageChange(lang.value)}
                      className={`keycap-btn flex-1 h-12 text-sm gap-2 ${
                        language === lang.value ? "keycap-btn-active" : ""
                      }`}
                    >
                      <span aria-hidden>{lang.flag}</span>
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Battle royale chain rule mutation, same card language as the
                game mode picker so it reads as one system */}
            {gameMode === "royale" && (
              <div role="radiogroup" aria-label="Mutation">
                <span className="field-label">Mutation</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {mutations.map((m) => {
                    const selected = mutation === m.value;
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setMutation(m.value)}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                          selected
                            ? "bg-violet-500/15 border-violet-400/60"
                            : "bg-surface-sunken border-white/10 hover:border-white/25"
                        }`}
                      >
                        <span
                          className={`tile w-10 h-10 text-base rounded-lg flex-shrink-0 ${
                            selected ? "tile-anchor" : ""
                          }`}
                          aria-hidden
                        >
                          <Icon className="text-base" />
                        </span>
                        <span className="flex flex-col items-start">
                          <span className="text-sm font-semibold text-white/90 font-display">
                            {m.label}
                          </span>
                          <span className="text-sm text-white/60">
                            {m.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              <div>
                <label className="field-label" htmlFor="banned-atama">
                  Banned starting letters
                </label>
                <input
                  id="banned-atama"
                  value={bannedAtama}
                  className="field-input uppercase tracking-[0.3em] font-display"
                  type="text"
                  placeholder="E.G. XQZ"
                  onChange={(e) =>
                    setBannedAtama(
                      sanitizeBannedLetters(e.target.value, language)
                    )
                  }
                />
                <p className="field-hint">
                  Words will never start with these letters.
                </p>
              </div>

              <div>
                <label className="field-label" htmlFor="banned-oshiri">
                  Banned ending letters
                </label>
                <input
                  id="banned-oshiri"
                  value={bannedOshiri}
                  className="field-input uppercase tracking-[0.3em] font-display"
                  type="text"
                  placeholder="E.G. JQV"
                  onChange={(e) =>
                    setBannedOshiri(
                      sanitizeBannedLetters(e.target.value, language)
                    )
                  }
                />
                <p className="field-hint">
                  Words will never end with these letters.
                </p>
              </div>
            </div>

            {/* Longest word and battle royale always submit on Enter */}
            {gameMode === "classic" && (
              <button
                type="button"
                role="switch"
                aria-checked={submitOnEnter}
                onClick={() => setSubmitOnEnter(!submitOnEnter)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-surface-sunken border border-white/10 hover:border-white/25 transition-colors text-left"
              >
                <span>
                  <span className="block text-sm font-semibold text-white/80">
                    End turn with Enter
                  </span>
                  <span className="block text-sm text-white/60">
                    Press ↵ to submit your word before the timer runs out
                  </span>
                </span>
                <span
                  className={`relative flex-shrink-0 w-12 h-7 rounded-full transition-colors ${
                    submitOnEnter
                      ? "bg-gradient-to-b from-violet-500 to-violet-700"
                      : "bg-surface-raised border border-white/10"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${
                      submitOnEnter ? "left-6" : "left-1"
                    }`}
                  />
                </span>
              </button>
            )}

            <div className="flex gap-3 pt-2 border-t border-white/10 sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => props.setIsOpen(false)}
                className="flex-1 sm:flex-none sm:min-w-32"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="flex-1 sm:flex-none sm:min-w-32"
              >
                Save
              </Button>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
