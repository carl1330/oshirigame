import { motion } from "framer-motion";
import useSound from "use-sound";
import usePrevious from "../hooks/usePrevious";

import clickSound from "../../public/sounds/click1.ogg";
import clackSound from "../../public/sounds/backspace.ogg";
import { useEffect, useState } from "react";

interface LetterBoxProps {
  text: string;
}

export default function LetterBoxView(props: LetterBoxProps) {
  const [playbackRate, setPlaybackRate] = useState(0.75);
  const prevInput = usePrevious(props.text);
  const [inputSound] = useSound(clickSound, {
    playbackRate,
    interrupt: true,
  });
  const [backspaceSound] = useSound(clackSound, {
    playbackRate,
    interrupt: true,
  });
  useEffect(() => {
    setPlaybackRate(Math.random() * (1 - 0.75) + 0.75);
    if (prevInput) {
      if (props.text.length > prevInput?.length) {
        inputSound();
      } else {
        backspaceSound();
      }
    }
  }, [props.text]);

  return (
    <div className="flex justify-start items-center pointer-events-none z-0 gap-2">
      {props.text.length > 0 ? (
        props.text.split("").map((letter, index) => (
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.3 }}
            key={index}
            className="text-center text-5xl text-white w-16 h-16 border rounded-md border-white flex justify-center items-center"
          >
            {letter}
          </motion.div>
        ))
      ) : (
        <div className="text-center text-5xl text-white w-16 h-16 border rounded-md border-white flex justify-center items-center" />
      )}
    </div>
  );
}
