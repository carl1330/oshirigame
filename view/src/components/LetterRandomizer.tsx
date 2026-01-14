import { useEffect, useState } from "react";

interface LetterRandomizerProps {
  letter: string;
  active: boolean;
  onFinished?: () => void;
}

export default function LetterRandomizer(props: LetterRandomizerProps) {
  const [letter, setLetter] = useState("");

  useEffect(() => {
    setInterval(() => {
      letterRoulette(setLetter);
    }, 50);
    if (!props.active) {
      if (props.onFinished) {
        props.onFinished();
      }
    }
  }, [props.active]); // eslint-disable-line react-hooks/exhaustive-deps

  if (props.active) {
    return (
      <div className="flex justify-center items-center rounded-md text-white font-bold text-3xl sm:text-5xl w-12 h-12 sm:w-16 sm:h-16 border-white border">
        {letter.toUpperCase()}
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center rounded-md text-white font-bold text-3xl sm:text-5xl w-12 h-12 sm:w-16 sm:h-16 border-white border">
      {props.letter.toUpperCase()}
    </div>
  );
}

function letterRoulette(setLetter: (letter: string) => void) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const randomIndex = Math.floor(Math.random() * alphabet.length);
  const letter = alphabet[randomIndex];
  setLetter(letter);
}
