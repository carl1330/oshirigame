import { motion } from "framer-motion";
import { useEffect } from "react";
import { useSound } from "use-sound";
import wordSuccessSound from "../../public/sounds/confirmation_001.ogg";
import wordFailureSound from "../../public/sounds/error_003.ogg";
interface LetterBoxProps {
  wordAccepted: boolean;
  text: string;
}

export default function LetterBoxFinished(props: LetterBoxProps) {
  const [successSound] = useSound(wordSuccessSound);
  const [failSound] = useSound(wordFailureSound);
  useEffect(() => {
    console.log(props.wordAccepted);
  }, [props.wordAccepted]);

  if (props.wordAccepted) {
    successSound();
    return (
      <motion.div
        className="flex justify-start items-center pointer-events-none z-0 gap-2"
        transition={{ duration: 0.3 }} // Duration for background color change
      >
        {props.text.length > 0 ? (
          props.text.split("").map((letter, index) => (
            <motion.div
              key={index}
              initial={{ scale: 0 }} // Initial scale of 0 to create the appearing effect
              animate={{ scale: [1, 1.2, 1], backgroundColor: "darkgreen" }} // Animation for scaling
              transition={{ duration: 0.3, delay: index * 0.05 }} // Duration and delay for stagger effect
              className="text-center text-5xl text-white w-16 h-16 border rounded-md border-white flex justify-center items-center"
            >
              {letter}
            </motion.div>
          ))
        ) : (
          <div className="text-center text-5xl text-white w-16 h-16 border rounded-md border-white flex justify-center items-center" />
        )}
      </motion.div>
    );
  }

  failSound();
  return (
    <div className="flex justify-start items-center pointer-events-none z-0 gap-2">
      {props.text.length > 0 ? (
        props.text.split("").map((letter, index) => (
          <motion.div
            animate={{ scale: [1, 1.2, 1], backgroundColor: "darkred" }}
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
