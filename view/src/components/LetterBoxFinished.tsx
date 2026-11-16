import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useSound } from "use-sound";
import { FaCheckCircle, FaTimesCircle } from "react-icons/fa";
import wordSuccessSound from "../../public/sounds/confirmation_001.ogg";
import wordFailureSound from "../../public/sounds/error_003.ogg";

interface LetterBoxProps {
  wordAccepted: boolean;
  text: string;
}

export default function LetterBoxFinished(props: LetterBoxProps) {
  const [successSound, { sound: successHowl }] = useSound(wordSuccessSound, {
    volume: 0.7,
  });
  const [failSound, { sound: failHowl }] = useSound(wordFailureSound, {
    volume: 0.7,
  });

  // Play the verdict sound exactly once, and only after the file has loaded
  // (the play function is a no-op until then).
  const hasPlayed = useRef(false);
  useEffect(() => {
    if (hasPlayed.current) {
      return;
    }
    if (props.wordAccepted && successHowl) {
      hasPlayed.current = true;
      successSound();
    } else if (!props.wordAccepted && failHowl) {
      hasPlayed.current = true;
      failSound();
    }
  }, [props.wordAccepted, successHowl, failHowl, successSound, failSound]);

  const tileClass = props.wordAccepted ? "tile tile-success" : "tile tile-fail";

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="flex flex-wrap gap-1 justify-center">
        {props.text.length > 0 ? (
          props.text.split("").map((letter, index) => (
            <motion.div
              key={index}
              initial={{ scale: 0 }}
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className={tileClass}
            >
              {letter}
            </motion.div>
          ))
        ) : (
          <div className="tile tile-empty" />
        )}
      </div>
      {/* Icon + label verdict so the result never relies on color alone */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: props.text.length * 0.05 }}
        className={`flex items-center gap-2 font-display font-semibold text-lg sm:text-xl ${
          props.wordAccepted ? "text-green-400" : "text-red-400"
        }`}
      >
        {props.wordAccepted ? (
          <>
            <FaCheckCircle aria-hidden /> Word accepted!
          </>
        ) : (
          <>
            <FaTimesCircle aria-hidden /> Not a valid word
          </>
        )}
      </motion.div>
    </div>
  );
}
