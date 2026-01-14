import { motion } from "framer-motion";
import { useSound } from "use-sound";
import wordSuccessSound from "../../public/sounds/confirmation_001.ogg";
import wordFailureSound from "../../public/sounds/error_003.ogg";
interface LetterBoxProps {
  wordAccepted: boolean;
  text: string;
}

export default function LetterBoxFinished(props: LetterBoxProps) {
  const [successSound] = useSound(wordSuccessSound, {
    volume: 0.7,
  });
  const [failSound] = useSound(wordFailureSound, {
    volume: 0.7,
  });

  if (props.wordAccepted) {
    successSound();
    return (
      <>
        {props.text.length > 0 ? (
          props.text.split("").map((letter, index) => (
            <motion.div
              key={index}
              initial={{ scale: 0 }} // Initial scale of 0 to create the appearing effect
              animate={{ scale: [1, 1.2, 1], backgroundColor: "darkgreen" }} // Animation for scaling
              transition={{ duration: 0.3, delay: index * 0.05 }} // Duration and delay for stagger effect
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
  } else {
    failSound();
    return (
      <>
        {props.text.length > 0 ? (
          props.text.split("").map((letter, index) => (
            <motion.div
              animate={{ scale: [1, 1.2, 1], backgroundColor: "darkred" }}
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
}
