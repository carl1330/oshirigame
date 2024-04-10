import { MouseEventHandler } from "react";

interface ButtonProps {
  children: React.ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
  disabled?: boolean;
}

export default function Button(props: ButtonProps) {
  return (
    <button
      className={
        "enabled:bg-purple-700 disabled:bg-purple-950 disabled:text-gray-700 p-4 rounded-full text-white enabled:hover:bg-purple-800 hover:cursor-pointer " +
        props.className
      }
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}
