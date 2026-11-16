import { motion } from "framer-motion";
import useSound from "use-sound";
import usePrevious from "../hooks/usePrevious";

import clickSound from "../../public/sounds/click1.ogg";
import clackSound from "../../public/sounds/backspace.ogg";
import { useEffect } from "react";

interface LetterBoxProps {
  text: string;
}

export default function LetterBoxView(props: LetterBoxProps) {
  const prevInput = usePrevious(props.text);
  const [inputSound] = useSound(clickSound, {
    interrupt: true,
  });
  const [backspaceSound] = useSound(clackSound, {
    interrupt: true,
  });
  useEffect(() => {
    const playbackRate = Math.random() * (1 - 0.75) + 0.75;
    if (prevInput !== undefined && props.text !== prevInput) {
      if (props.text.length > prevInput.length) {
        inputSound({ playbackRate });
      } else {
        backspaceSound({ playbackRate });
      }
    }
  }, [props.text]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {props.text.length > 0 ? (
        props.text.split("").map((letter, index) => (
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.3 }}
            key={index}
            className="tile"
          >
            {letter}
          </motion.div>
        ))
      ) : (
        <div className="tile tile-empty" />
      )}
    </>
  );
}
