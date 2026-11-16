import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import useSound from "use-sound";

import clickSound from "../../public/sounds/click1.ogg";
import clackSound from "../../public/sounds/backspace.ogg";

interface LetterBoxProps {
  text: string;
  setText: (text: string) => void;
  disabled: boolean;
  focus: boolean;
  /** Called when the player presses Enter (submit-on-enter option) */
  onEnter?: () => void;
}

export default function LetterBoxInput(props: LetterBoxProps) {
  const [inputSound] = useSound(clickSound, {
    interrupt: true,
  });
  const [backspaceSound] = useSound(clackSound, {
    interrupt: true,
  });

  const prevLength = useRef(props.text.length);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.toUpperCase();
    const newLength = newValue.length;

    // Play sound with a slightly randomized pitch per keystroke
    const playbackRate = Math.random() * (1 - 0.75) + 0.75;
    if (newLength < prevLength.current) {
      backspaceSound({ playbackRate });
    } else if (newLength > prevLength.current) {
      inputSound({ playbackRate });
    }
    prevLength.current = newLength;

    props.setText(newValue);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      props.onEnter?.();
    }
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
            className="tile cursor-text"
          >
            {letter}
          </motion.div>
        ))
      ) : (
        <div onClick={handleBoxClick} className="tile tile-empty cursor-text" />
      )}
    </>
  );
}
