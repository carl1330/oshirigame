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

  const prevLength = useRef(props.text.length);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.toUpperCase();
    const newLength = newValue.length;

    // Play sound
    setPlaybackRate(Math.random() * (1 - 0.75) + 0.75);
    if (newLength < prevLength.current) {
      backspaceSound();
    } else if (newLength > prevLength.current) {
      inputSound();
    }
    prevLength.current = newLength;

    props.setText(newValue);
  };

  const handleKeyPress = () => {
    setPlaybackRate(Math.random() * (1 - 0.75) + 0.75);
  };

  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!props.disabled && ref.current) {
      ref.current.focus();
    }
  }, [props.disabled]);

  const handleBoxClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!props.disabled && ref.current) {
      ref.current.focus();
    }
  };

  return (
    <>
      <input
        maxLength={45}
        ref={ref}
        type="text"
        value={props.text}
        onChange={handleChange}
        onKeyDown={handleKeyPress}
        className="fixed left-0 top-0 opacity-0 pointer-events-auto"
        style={{
          textTransform: "uppercase",
          width: "1px",
          height: "1px",
        }}
        disabled={props.disabled}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
        autoFocus={!props.disabled}
      />
      {props.text.length > 0 ? (
        props.text.split("").map((letter, index) => (
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.3 }}
            key={index}
            onClick={handleBoxClick}
            className="text-center text-3xl sm:text-5xl text-white w-12 h-12 sm:w-16 sm:h-16 border rounded-md border-white flex justify-center items-center flex-shrink-0 cursor-text"
          >
            {letter}
          </motion.div>
        ))
      ) : (
        <div
          onClick={handleBoxClick}
          className="text-center text-3xl sm:text-5xl text-white w-12 h-12 sm:w-16 sm:h-16 border rounded-md border-white flex justify-center items-center cursor-text"
        />
      )}
    </>
  );
}
