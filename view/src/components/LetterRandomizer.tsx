import { useEffect, useState } from "react";

interface LetterRandomizerProps {
  letter: string;
  active: boolean;
  onFinished?: () => void;
  setActive: (active: boolean) => void;
}

export default function LetterRandomizer(props: LetterRandomizerProps) {
  const [letter, setLetter] = useState("");

  useEffect(() => {
    if (props.active) {
      let counter = 10;
      const func = () => {
        clearInterval(interval);
        letterRoulette(setLetter);
        counter += 2;
        interval = setInterval(func, counter);
      };
      let interval = setInterval(func, counter);

      setTimeout(() => {
        clearInterval(interval);
        setLetter(props.letter);
        props.setActive(false);
        if (props.onFinished) {
          props.onFinished();
        }
      }, 3000);
    }
  }, [props.active]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex justify-center items-center rounded-md text-white font-bold text-5xl w-16 h-16 border-white border">
      {letter.toUpperCase()}
    </div>
  );
}

function letterRoulette(setLetter: (letter: string) => void) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const randomIndex = Math.floor(Math.random() * alphabet.length);
  const letter = alphabet[randomIndex];
  setLetter(letter);
}
