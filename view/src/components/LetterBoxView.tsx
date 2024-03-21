import { motion } from "framer-motion";
interface LetterBoxProps {
  text: string;
}

export default function LetterBoxView(props: LetterBoxProps) {
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
