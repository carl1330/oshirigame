import { useEffect, useRef } from "react";

interface LetterBoxProps {
  text: string;
  setText: (text: string) => void;
  disabled: boolean;
  focus: boolean;
}

export default function LetterBoxInput(props: LetterBoxProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    props.setText(e.target.value.toUpperCase());
  };

  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    !props.disabled && ref.current?.focus();
  }, [props.disabled]);

  const inputWidth = props.text.length * 64 + "px";

  return (
    <div className={`relative ${props.text.length === 0 && "w-16"}`}>
      <input
        maxLength={20}
        ref={ref}
        onBlur={(e) => e.target.focus()}
        key={"nonleader"}
        type="text"
        value={props.text}
        onChange={handleChange}
        className="w-full border border-gray-300 rounded-md px-4 py-2 outline-none"
        placeholder="Type here..."
        style={{
          width: inputWidth,
          opacity: 0,
          textTransform: "uppercase",
        }}
        disabled={props.disabled}
      />
      <div className="absolute top-0 left-0 h-full w-full flex justify-start items-center pointer-events-none z-0 gap-2">
        {props.text.length > 0 ? (
          props.text.split("").map((letter, index) => (
            <div
              key={index}
              className="text-center text-5xl text-white w-16 h-16 border rounded-md border-white flex justify-center items-center"
            >
              {letter}
            </div>
          ))
        ) : (
          <div className="text-center text-5xl text-white w-16 h-16 border rounded-md border-white flex justify-center items-center" />
        )}
      </div>
    </div>
  );
}
