import { MouseEventHandler } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";

interface ButtonProps {
  children: React.ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
  disabled?: boolean;
  variant?: ButtonVariant;
}

const base =
  "font-display font-semibold text-white p-3 sm:p-4 rounded-full min-h-[48px] min-w-[48px] " +
  "transition-all duration-150 enabled:hover:cursor-pointer enabled:active:translate-y-[2px] " +
  "disabled:bg-surface-sunken disabled:text-white/30 disabled:border disabled:border-white/5 ";

const variants: Record<ButtonVariant, string> = {
  primary:
    "enabled:bg-gradient-to-b enabled:from-violet-500 enabled:to-violet-700 " +
    "enabled:shadow-[0_4px_0_#4c1d95,0_8px_20px_rgba(139,92,246,0.35)] " +
    "enabled:hover:from-violet-400 enabled:hover:to-violet-600 " +
    "enabled:active:shadow-[0_2px_0_#4c1d95,0_4px_10px_rgba(139,92,246,0.3)] ",
  secondary:
    "enabled:bg-surface-raised enabled:border enabled:border-white/10 " +
    "enabled:shadow-[0_4px_0_#0d0d14] " +
    "enabled:hover:border-violet-400/50 enabled:hover:bg-surface " +
    "enabled:active:shadow-[0_2px_0_#0d0d14] ",
  danger:
    "enabled:bg-gradient-to-b enabled:from-red-500 enabled:to-red-700 " +
    "enabled:shadow-[0_4px_0_#7f1d1d,0_8px_20px_rgba(239,68,68,0.3)] " +
    "enabled:hover:from-red-400 enabled:hover:to-red-600 " +
    "enabled:active:shadow-[0_2px_0_#7f1d1d,0_4px_10px_rgba(239,68,68,0.25)] ",
};

export default function Button(props: ButtonProps) {
  return (
    <button
      className={base + variants[props.variant ?? "primary"] + (props.className ?? "")}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}
