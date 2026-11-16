import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import useSound from "use-sound";

import tickSoundFile from "../../public/sounds/rollover5.ogg";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SPIN_DELAY_MS = 50;
// Keep the full decelerate-and-land sequence around half a second: the
// server starts the round right after the last letter event, so a long
// tail would roll into live play.
const DECEL_START_DELAY_MS = 60;
const DECEL_FACTOR = 1.3;
const DECEL_TICKS = 5;

interface LetterRandomizerProps {
  letter: string;
  active: boolean;
}

export default function LetterRandomizer(props: LetterRandomizerProps) {
  const [display, setDisplay] = useState(() => randomLetter(""));
  const [landed, setLanded] = useState(!props.active);
  const hasSpunRef = useRef(false);
  const timeoutRef = useRef<number>();
  const letterRef = useRef(props.letter);
  letterRef.current = props.letter;

  const [playTick] = useSound(tickSoundFile, {
    volume: 0.35,
    interrupt: true,
  });
  // use-sound swaps in the real play function once the file loads; the spin
  // loop runs in a closure, so it must read the latest one through a ref.
  const playTickRef = useRef(playTick);
  playTickRef.current = playTick;

  useEffect(() => {
    window.clearTimeout(timeoutRef.current);

    if (props.active) {
      hasSpunRef.current = true;
      setLanded(false);
      const spin = () => {
        playTickRef.current();
        setDisplay((prev) => randomLetter(prev));
        timeoutRef.current = window.setTimeout(spin, SPIN_DELAY_MS);
      };
      spin();
    } else if (hasSpunRef.current) {
      hasSpunRef.current = false;
      let delay = DECEL_START_DELAY_MS;
      let ticksLeft = DECEL_TICKS;
      const step = () => {
        if (ticksLeft <= 0) {
          playTickRef.current();
          setDisplay(letterRef.current);
          setLanded(true);
          return;
        }
        ticksLeft--;
        playTickRef.current();
        setDisplay((prev) => randomLetter(prev));
        delay *= DECEL_FACTOR;
        timeoutRef.current = window.setTimeout(step, delay);
      };
      step();
    } else {
      setLanded(true);
    }

    return () => window.clearTimeout(timeoutRef.current);
  }, [props.active]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!landed) {
    return (
      <motion.div
        key={display}
        initial={{ y: -4, opacity: 0.6 }}
        animate={{ y: 0, opacity: 0.85 }}
        transition={{ duration: 0.05 }}
        className="tile tile-anchor"
      >
        {display.toUpperCase()}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ scale: 1.35 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 15 }}
      className="tile tile-anchor"
    >
      {props.letter.toUpperCase()}
    </motion.div>
  );
}

function randomLetter(exclude: string): string {
  let letter = exclude;
  while (letter === exclude) {
    letter = ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return letter;
}
