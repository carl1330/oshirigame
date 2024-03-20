import { Dispatch, useState } from "react";
import { FaPaperPlane } from "react-icons/fa";

interface ChatProps {
  roomId: string;
  messages: string[];
  setMessages: Dispatch<string[]>;
  onSendMessage: (
    event: React.FormEvent<HTMLFormElement>,
    chatMessage: string
  ) => void;
  className?: string;
}

export default function Chat(props: ChatProps) {
  const [message, setMessage] = useState("");

  function handleChatSubmit(event: React.FormEvent<HTMLFormElement>) {
    props.onSendMessage(event, message);
    setMessage("");
  }

  return (
    <div
      className={
        "flex flex-col h-full bg-[#212121] p-4 rounded-xl gap-2 " +
        props.className
      }
    >
      <h1 className="text-white text-2xl">Room: {props.roomId} </h1>
      <div className="h-full  rounded-xl">
        <div className="flex h-full flex-col gap-2">
          <textarea
            readOnly
            className="flex grow bg-[#3F3F3F] text-white p-2 rounded-xl resize-none focus:outline-none"
            value={props.messages.join("\n")}
          />
          <form className="flex w-full gap-2" onSubmit={handleChatSubmit}>
            <input
              type="text"
              placeholder="Message"
              className="bg-[#3F3F3F] text-white p-2 rounded-xl w-full"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={250}
            />
            <button className="bg-purple-800 p-3 rounded-xl text-white">
              <FaPaperPlane className="text-white" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
