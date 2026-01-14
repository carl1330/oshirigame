import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import useSound from "use-sound";

import clickSound from "../../public/sounds/click1.ogg";
import clackSound from "../../public/sounds/backspace.ogg";

interface LetterBoxProps {
  text: string;
  setText: (text: string) => void;
  disabled: boolean;
  focus: boolean;
}

export default function LetterBoxInput(props: LetterBoxProps) {
  const [playbackRate, setPlaybackRate] = useState(0.75);
  const [inputSound] = useSound(clickSound, {
    playbackRate,
    interrupt: true,
  });
  const [backspaceSound] = useSound(clackSound, {
    playbackRate,
    interrupt: true,
  });
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    props.setText(e.target.value.toUpperCase());
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setPlaybackRate(Math.random() * (1 - 0.75) + 0.75);
    if (e.code == "Backspace") {
      backspaceSound();
    } else {
      inputSound();
    }
  };

  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    !props.disabled && ref.current?.focus();
  }, [props.disabled]);

  return (
    <>
      <input
        maxLength={45}
        ref={ref}
        onBlur={(e) => e.target.focus()}
        key={"nonleader"}
        type="text"
        value={props.text}
        onChange={handleChange}
        onKeyDown={handleKeyPress}
        className="absolute opacity-0 pointer-events-auto w-0 h-0"
        placeholder="Type here..."
        style={{
          textTransform: "uppercase",
        }}
        disabled={props.disabled}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
      />
      {props.text.length > 0 ? (
        props.text.split("").map((letter, index) => (
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.3 }}
            key={index}
            className="text-center text-3xl sm:text-5xl text-white w-12 h-12 sm:w-16 sm:h-16 border rounded-md border-white flex justify-center items-center flex-shrink-0"
          >
            {letter}
          </motion.div>
        ))
      ) : (
        <div className="text-center text-3xl sm:text-5xl text-white w-12 h-12 sm:w-16 sm:h-16 border rounded-md border-white flex justify-center items-center" />
      )}
    </>
  );
}
