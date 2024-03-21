import { useState } from "react";
import Button from "../components/Button";
import LetterBoxInput from "../components/LetterBoxInput";
import LetterRandomizer from "../components/LetterRandomizer";

export default function Dev() {
  const [atamaActive, setAtamaActive] = useState(false);
  const [oshiriActive, setOshiriActive] = useState(false);
  return (
    <div className="flex gap-2 h-screen w-screen justify-center items-center">
      <Button onClick={() => setAtamaActive(true)}>Start roulette</Button>
      <LetterRandomizer
        letter={"A"}
        active={atamaActive}
        setActive={setAtamaActive}
        onFinished={() => setOshiriActive(true)}
      />
      <LetterBoxInput />
      <LetterRandomizer
        letter={"B"}
        active={oshiriActive}
        setActive={setOshiriActive}
      />
    </div>
  );
}
