import "react-toastify/dist/ReactToastify.css";
import Button from "../components/Button";
import { useNavigate } from "react-router-dom";
import { getHttpConfig } from "../misc/server.conf";
import { FaCalendarDay, FaPlay, FaSignInAlt } from "react-icons/fa";
import { useState } from "react";
import { Oval } from "react-loader-spinner";
import { motion } from "framer-motion";
import { toast } from "react-toastify";

export interface GamePreferences {
  token: string;
}

const TITLE = "OSHIRIGAME";

// Accepts a bare room code or a pasted invite URL and returns the room code
function parseRoomCode(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes("/")) {
    const segments = trimmed.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "";
  }
  return trimmed;
}

export default function Home() {
  const navigate = useNavigate();
  const apiConfig = getHttpConfig();
  const [loading, setLoading] = useState(false);
  const [roomCode, setRoomCode] = useState("");

  async function handleCreateRoom(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(apiConfig + "/creategame");
      if (!res.ok) {
        throw new Error(`creategame failed: ${res.status}`);
      }
      const data = await res.json();
      if (!data.id) {
        throw new Error("creategame returned no room id");
      }
      navigate("/room/" + data.id);
    } catch (err) {
      console.error(err);
      toast.error("Could not create a room. Please try again.");
      setLoading(false);
    }
  }

  function handleJoinRoom(e: React.FormEvent) {
    e.preventDefault();
    const code = parseRoomCode(roomCode);
    if (code) {
      navigate("/room/" + code);
    }
  }

  return (
    <div className="w-full h-screen flex p-2">
      <div className="flex w-full flex-col gap-2">
        <div className="flex grow justify-center">
          <div className="flex flex-col gap-6 justify-center items-center h-full w-full panel px-4 py-6">
            {/* Logo spelled in game tiles, the UI teaches the game before it starts */}
            <div className="flex flex-wrap justify-center gap-1 sm:gap-1.5 px-2">
              {TITLE.split("").map((letter, index) => (
                <motion.div
                  key={index}
                  initial={{ scale: 0, rotate: -8 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: index * 0.08, duration: 0.25, ease: "easeOut" }}
                  className={`tile w-8 h-8 text-xl xs:w-10 xs:h-10 xs:text-2xl sm:w-14 sm:h-14 sm:text-4xl md:w-16 md:h-16 md:text-5xl ${
                    index === 0 || index === TITLE.length - 1 ? "tile-anchor" : ""
                  }`}
                >
                  {letter}
                </motion.div>
              ))}
            </div>
            <Button
              className="flex items-center justify-center gap-3 px-8"
              onClick={handleCreateRoom}
              disabled={loading}
            >
              {loading ? (
                <Oval color="#ffffff" width={25} height={25} />
              ) : (
                <>
                  <FaPlay aria-hidden />
                  <span className="text-lg">Create room</span>
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              className="flex items-center justify-center gap-3 px-8"
              onClick={() => navigate("/daily")}
            >
              <FaCalendarDay aria-hidden />
              <span className="text-lg">Daily challenge</span>
            </Button>

            {/* Join an existing room by code or pasted invite link */}
            <div className="flex items-center gap-3 w-full max-w-xs">
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-white/40 text-sm">or join a room</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <form
              onSubmit={handleJoinRoom}
              className="flex gap-2 w-full max-w-xs"
            >
              <input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder="Room code or link"
                aria-label="Room code or invite link"
                className="flex-1 min-w-0 text-white bg-surface-sunken border border-white/10 placeholder:text-white/40 px-4 py-3 rounded-full text-center text-base"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
              />
              <Button
                variant="secondary"
                disabled={parseRoomCode(roomCode) === ""}
                className="flex items-center justify-center gap-2 px-5"
              >
                <FaSignInAlt aria-hidden />
                <span>Join</span>
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
