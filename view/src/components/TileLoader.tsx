import { CSSProperties } from "react";

type TileLoaderSize = "sm" | "md" | "lg";

interface TileLoaderProps {
  size?: TileLoaderSize;
  /* One keycap per character; spaces render as blank caps */
  letters?: string;
  label?: string;
  className?: string;
}

const sizes: Record<
  TileLoaderSize,
  { cap: string; gap: string; drop: string }
> = {
  sm: { cap: "w-5 h-5 text-[11px] rounded-md", gap: "gap-1", drop: "3px" },
  md: { cap: "w-9 h-9 text-lg rounded-lg", gap: "gap-1.5", drop: "4px" },
  lg: { cap: "w-11 h-11 text-xl rounded-lg", gap: "gap-2", drop: "4px" },
};

/* Loading indicator themed as keycaps being typed by an invisible hand:
   each cap presses down in sequence, reusing the .tile depth trick. */
export default function TileLoader(props: TileLoaderProps) {
  const size = sizes[props.size ?? "md"];
  const chars = [...(props.letters ?? "···")];

  return (
    <div
      role="status"
      aria-label={props.label ?? "Loading"}
      className={`flex ${size.gap} ${props.className ?? ""}`}
    >
      {chars.map((char, index) => (
        <div
          key={index}
          className={`loader-cap flex items-center justify-center font-display
            font-semibold text-white select-none ${size.cap}`}
          style={
            {
              "--cap-drop": size.drop,
              animationDelay: `${index * 0.12}s`,
            } as CSSProperties
          }
          aria-hidden
        >
          {char === " " ? "" : char.toUpperCase()}
        </div>
      ))}
    </div>
  );
}
