import { useNavigate, useParams } from "react-router-dom";
import Footer from "../components/Footer";
import React, { useEffect, useMemo, useRef, useState } from "react";
import useWebSocket from "react-use-websocket";
import { Oval } from "react-loader-spinner";
import { getWsConfig } from "../misc/server.conf";
import { useLocalStorage } from "usehooks-ts";
import Button from "../components/Button";
import { toast } from "react-toastify";
import LetterBoxInput from "../components/LetterBoxInput";
import LetterBoxView from "../components/LetterBoxView";
import LetterRandomizer from "../components/LetterRandomizer";
import LetterBoxFinished from "../components/LetterBoxFinished";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "framer-motion";
import { MORPH, BEAT } from "../misc/motion";
import RoomCodeMarquee from "../components/RoomCodeMarquee";
import PlayerStage from "../components/PlayerStage";
import PlayerRail from "../components/PlayerRail";
import { FaCog, FaCheckCircle, FaTimesCircle } from "react-icons/fa";
import { HiMenu } from "react-icons/hi";
import GameOptionsDialog from "../components/GameOptionsDialog";
import GameMenu from "../components/GameMenu";
import WinnerScreen, { PlayerRanking } from "../components/WinnerScreen";
import WordListDialog from "../components/WordListDialog";
import AvatarCreator from "../components/AvatarCreator";
import PlayerAvatar from "../components/PlayerAvatar";
import MuteButton from "../components/MuteButton";
import { FaPen } from "react-icons/fa";

export type Event = {
  type: string;
  data: Message;
};

export type GameState = {
  started: boolean;
  gameMode: string;
  time: number;
  round: number;
  maxRounds: number;
  wordCombinations: number;
  roundTime: number;
  language: string;
  bannedAtama: string;
  bannedOshiri: string;
  playerQueue: Player[];
  input: string;
  atama: string;
  oshiri: string;
  roundOver: boolean;
  submitOnEnter: boolean;
};

type Player = {
  token: string;
  username: string;
  avatar: string;
  ready: boolean;
  score: number;
  /** It's this player's turn (head of the queue) */
  isLeader: boolean;
  /** Stable room admin — controls options, starting and round flow */
  isHost: boolean;
};

interface JoinGameMessage {
  username: string;
  id: string;
  avatar: string;
}

interface PlayerInputMessage {
  token: string;
  id: string;
  input: string;
}

interface NewMessage {
  message: string;
}

interface NewClientEvent {
  token: string;
}

interface NewLetterEvent {
  letter: string;
}

export interface GameOptionsEvent {
  maxRounds: number;
  minWordCombinations: number;
  roundTime: number;
  language: string;
  gameMode: string;
  bannedAtama: string;
  bannedOshiri: string;
  submitOnEnter: boolean;
}

interface AllWordsResponse {
  atama: string;
  oshiri: string;
  words: string[];
}

export interface PlayerWordResult {
  username: string;
  avatar: string;
  word: string;
  accepted: boolean;
  winner: boolean;
}

interface RoundOverResponse {
  topWords: string[];
  gameState: GameState;
  wordAccepted: boolean;
  word: string;
  playerWords?: PlayerWordResult[];
}

interface GameOverResponse {
  winners: PlayerRanking[];
}

export type Message =
  | GameState
  | JoinGameMessage
  | NewClientEvent
  | PlayerInputMessage
  | RoundOverResponse
  | GameOverResponse
  | NewLetterEvent
  | NewMessage
  | GameOptionsEvent
  | AllWordsResponse
  | null;

export const EventJoinGame = "JOIN_GAME";
export const EventPlayerState = "PLAYER_STATE";
export const EventRoomNotFound = "ROOM_NOT_FOUND";
export const EventNextRound = "NEXT_ROUND";
export const EventNewClient = "NEW_CLIENT";
export const EventGameStart = "START_GAME";
export const EventGameState = "GAME_STATE";
export const EventRoundStart = "ROUND_START";
export const EventPlayerInput = "PLAYER_INPUT";
export const EventRoundFinished = "ROUND_FINISHED";
export const EventGameOver = "GAME_OVER";
export const EventResetGame = "RESET_GAME";
export const EventUsernameTooLong = "USERNAME_TOO_LONG";
export const EventRoundAtama = "ROUND_ATAMA";
export const EventRoundOshiri = "ROUND_OSHIRI";
export const EventUpdateGameOptions = "UPDATE_GAME_OPTIONS";
export const EventEndTurn = "END_TURN";
export const EventAllWords = "ALL_WORDS";
export const Error = "ERROR";

/** Read-only summary of the room settings so every player knows the rules */
function SettingsSummary({ gameState }: { gameState: GameState }) {
  const items = [
    gameState.gameMode === "longest" ? "Longest word" : "Classic",
    `${gameState.maxRounds} rounds`,
    `${gameState.roundTime}s timer`,
    gameState.language === "swedish" ? "Svenska" : "English",
  ];
  if (gameState.bannedAtama) {
    items.push(`Never starts with ${gameState.bannedAtama.toUpperCase()}`);
  }
  if (gameState.bannedOshiri) {
    items.push(`Never ends with ${gameState.bannedOshiri.toUpperCase()}`);
  }
  if (gameState.submitOnEnter && gameState.gameMode !== "longest") {
    items.push("↵ submits early");
  }

  return (
    <div className="flex flex-wrap gap-1.5 justify-center max-w-md px-2">
      {items.map((item) => (
        <span
          key={item}
          className="text-white/70 text-sm px-3 py-1 rounded-full bg-surface-sunken border border-white/10"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

/** Copy-the-room-URL state shared by the marquee and the empty stage seats */
function useCopyInvite() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't copy the link — copy the address bar URL instead");
    }
  }

  return { copied, copy };
}

export default function Room() {
  const { gameId } = useParams();
  const [token, setToken] = useLocalStorage("token", "");
  const [avatar, setAvatar] = useLocalStorage("avatar", "");
  const [avatarCreatorOpen, setAvatarCreatorOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [gameState, setGameState] = useState<GameState>();
  const [topWords, setTopWords] = useState<string[]>([]);
  const [player, setPlayer] = useState<Player>();
  const [atamaActive, setAtamaActive] = useState(false);
  const [oshiriActive, setOshiriActive] = useState(false);
  const [atama, setAtama] = useState("");
  const [oshiri, setOshiri] = useState("");
  const [roundOver, setRoundOver] = useState(false);
  const [playerInput, setPlayerInput] = useState("");
  const [finishedWord, setFinishedWord] = useState<string>("");
  const [wordAccepted, setWordAccepted] = useState<boolean>(false);
  const [focus, setFocus] = useState(false);
  const [gamePropsOpen, setGamePropsOpen] = useState(false);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  // GAME_OVER arrives right after the last ROUND_FINISHED — hold the winner
  // screen so players can look at the final round's results first
  const [gameOverPending, setGameOverPending] = useState(false);
  const [winners, setWinners] = useState<PlayerRanking[]>([]);
  const [allWords, setAllWords] = useState<AllWordsResponse | null>(null);
  const [playerWords, setPlayerWords] = useState<PlayerWordResult[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [wordListOpen, setWordListOpen] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const navigate = useNavigate();
  const { copied, copy } = useCopyInvite();

  // Lobby → game entry window: drives the "GO!" stamp and the slow, beat-
  // delayed shared-element morphs. Outside it, layout changes (e.g. the word
  // growing while typing) must snap fast, so elements never lag over content.
  // Set during render (not in an effect) so the game screen's very first
  // commit already carries the slow morph transitions. Only fires when we
  // watched the lobby become a game — never on reconnects straight into one.
  const [entering, setEntering] = useState(false);
  const prevStartedRef = useRef<boolean | undefined>(undefined);
  if (gameState && prevStartedRef.current !== gameState.started) {
    if (gameState.started && prevStartedRef.current === false) {
      setEntering(true);
    }
    prevStartedRef.current = gameState.started;
  }
  useEffect(() => {
    if (!entering) return;
    const timeout = window.setTimeout(() => setEntering(false), 2200);
    return () => window.clearTimeout(timeout);
  }, [entering]);

  // Fast layout transition for live play; slow beat morphs only on entry
  const tileTransition = (beat: number) =>
    entering ? { ...MORPH, delay: beat } : { duration: 0.2, ease: "easeOut" };

  // Round furniture (input slot, drain bar, hints) stays hidden until the
  // tiles have landed, so the round visibly "starts" as the last beat
  const settleInitial = entering ? { opacity: 0, y: 10 } : false;
  const settleAnimate = { opacity: 1, y: 0 };
  const settleTransition = entering
    ? { delay: BEAT.settle, duration: 0.4 }
    : { duration: 0 };

  // Refs so websocket lifecycle callbacks always see current values
  const usernameRef = useRef(username);
  usernameRef.current = username;
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const avatarRef = useRef(avatar);
  avatarRef.current = avatar;
  // Set when the player leaves on purpose, so we don't try to reconnect
  const leavingRef = useRef(false);

  // Passing the token lets the server re-identify us across reconnects
  const wsUrl = useMemo(() => {
    const base = getWsConfig();
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  }, [token]);

  const { sendMessage, lastMessage } = useWebSocket(wsUrl, {
    shouldReconnect: () => !leavingRef.current,
    reconnectAttempts: 10,
    reconnectInterval: (attempt) => Math.min(500 * 2 ** attempt, 5000),
    onReconnectStop: () => {
      toast.error(`Lost connection to gameroom ${gameId}`);
      navigate("/");
    },
    onOpen: () => {
      setReconnecting(false);
      // Rejoin automatically after a reconnect — the server keeps our seat
      // for a grace period, keyed by our token
      if (usernameRef.current !== "" && gameId) {
        const event: Event = {
          type: EventJoinGame,
          data: {
            username: usernameRef.current,
            id: gameId,
            token: tokenRef.current,
            avatar: avatarRef.current,
          },
        };
        sendMessage(JSON.stringify(event));
      }
    },
    onClose: () => {
      if (!leavingRef.current && usernameRef.current !== "") {
        setReconnecting(true);
      }
    },
  });

  function sendEvent(eventType: string, payload: Message | null) {
    const event: Event = {
      type: eventType,
      data: payload,
    };
    sendMessage(JSON.stringify(event));
  }

  useEffect(() => {
    if (lastMessage === null) {
      return;
    }
    const event: Event = JSON.parse(lastMessage.data);
    switch (event.type) {
      case EventNewClient: {
        console.log("new client");
        const token = (event.data as NewClientEvent).token;
        setToken(token);
        break;
      }
      case EventGameStart:
        setGameState(event.data as GameState);
        // Both scrollers spin from round start; the server stops each one
        // with ROUND_ATAMA (3s) and ROUND_OSHIRI (6s)
        setAtamaActive(true);
        setOshiriActive(true);
        break;
      case EventGameState: {
        const gameState = event.data as GameState;
        setGameState(gameState);
        
        // If game was reset to lobby (not started), clear all game-specific state
        if (!gameState.started) {
          setGameOver(false);
          setGameOverPending(false);
          setWinners([]);
          setRoundOver(false);
          setPlayerInput("");
          setAtamaActive(false);
          setOshiriActive(false);
          setAtama("");
          setOshiri("");
          setFinishedWord("");
          setWordAccepted(false);
          setTopWords([]);
          setAllWords(null);
          setWordListOpen(false);
          setPlayerWords([]);
          setHasSubmitted(false);
        }

        // In longest-word mode everyone types their own hidden word,
        // so never overwrite the local input with the shared one
        if (player && !player.isLeader && gameState.gameMode !== "longest") {
          setPlayerInput(gameState.input);
        }

        // After a reconnect mid-game the ROUND_ATAMA/OSHIRI events are long
        // gone — recover the round letters from the shared state
        if (gameState.started) {
          setAtama((a) => a || gameState.atama);
          setOshiri((o) => o || gameState.oshiri);
        }
        break;
      }
      case EventPlayerState:
        setPlayer(event.data as Player);
        break;
      case EventRoundStart: {
        const gameState = event.data as GameState;
        setGameState(gameState);
        // Safety net: the round is live, no scroller may still be spinning
        setAtamaActive(false);
        setOshiriActive(false);
        break;
      }
      case EventNextRound: {
        // Broadcast to every client (leader included) — spin both scrollers
        const nextState = event.data as GameState;
        setRoundOver(false);
        setAtamaActive(true);
        setOshiriActive(true);
        // In longest-word mode everyone starts the round with a fresh word
        if (nextState.gameMode === "longest") {
          setPlayerInput("");
          setHasSubmitted(false);
          setPlayerWords([]);
        }
        break;
      }
      case EventRoundFinished: {
        const gameStateFinished = event.data as RoundOverResponse;
        gameStateFinished.gameState.time =
          gameStateFinished.gameState.roundTime;
        setRoundOver(true);
        setTopWords(gameStateFinished.topWords);
        setGameState(gameStateFinished.gameState);
        setFinishedWord(gameStateFinished.word.toLocaleUpperCase());
        setWordAccepted(gameStateFinished.wordAccepted);
        setPlayerWords(gameStateFinished.playerWords ?? []);
        setHasSubmitted(false);
        setInputUsername("");
        setFocus(false);
        break;
      }
      case EventUsernameTooLong: {
        console.log("username too long");
        toast.error("Username too long");
        setUsername("");
        break;
      }
      case EventRoomNotFound:
        toast.error("Room not found — it may have expired");
        leavingRef.current = true;
        navigate("/");
        break;
      case EventRoundAtama:
        setAtama((event.data as NewLetterEvent).letter);
        setAtamaActive(false);
        break;
      case EventRoundOshiri:
        setOshiri((event.data as NewLetterEvent).letter);
        setOshiriActive(false);
        break;
      case EventAllWords: {
        setAllWords(event.data as AllWordsResponse);
        setWordListOpen(true);
        break;
      }
      case EventGameOver: {
        const gameOverData = event.data as GameOverResponse;
        setWinners(gameOverData.winners);
        if (roundOver) {
          // Let everyone see the last round's play first; a button reveals
          // the winner screen
          setGameOverPending(true);
        } else {
          setGameOver(true);
        }
        break;
      }
      case Error: {
        const error = event.data as NewMessage;
        toast.error(error.message);
        leavingRef.current = true;
        navigate("/");
      }
    }
  }, [lastMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (player && gameId) {
      sendEvent(EventPlayerInput, {
        token: player.token,
        id: gameId,
        input: playerInput,
      });
    }
  }, [playerInput]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      return "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, []);

  const [inputUsername, setInputUsername] = useState("");
  const USERNAME_MAX = 20;

  function handleJoinRoom(e: React.FormEvent) {
    e.preventDefault();
    const name = inputUsername.trim();
    if (name === "" || !gameId) return;
    setUsername(name);
    sendEvent(EventJoinGame, {
      username: name,
      id: gameId,
      token: token,
      avatar: avatar,
    });
  }

  if (username === "") {
    return (
      <div className="w-full h-screen flex p-2">
        <div className="flex w-full flex-col gap-2">
          <div className="flex grow justify-center">
            <div className="flex flex-col gap-4 justify-center items-center h-full w-full panel px-4 py-6">
              <h1 className="text-white font-display text-2xl sm:text-3xl font-semibold text-center">Join room</h1>
              {/* Avatar preview — tap the pencil to customize */}
              <div className="relative">
                <div className="rounded-full p-1.5 bg-surface-sunken border border-white/10">
                  <PlayerAvatar
                    username={inputUsername || "player"}
                    avatar={avatar}
                    size={96}
                  />
                </div>
                <button
                  type="button"
                  aria-label="Customize avatar"
                  onClick={() => setAvatarCreatorOpen(true)}
                  className="absolute -bottom-1 -right-1 w-11 h-11 flex items-center justify-center rounded-full bg-gradient-to-b from-violet-500 to-violet-700 text-white shadow-[0_2px_0_#4c1d95,0_4px_12px_rgba(139,92,246,0.4)] hover:from-violet-400 hover:to-violet-600 active:scale-95 transition-all"
                >
                  <FaPen className="text-sm" aria-hidden />
                </button>
              </div>
              {avatarCreatorOpen && (
                <AvatarCreator
                  isOpen={avatarCreatorOpen}
                  setIsOpen={setAvatarCreatorOpen}
                  username={inputUsername}
                  value={avatar}
                  onSave={setAvatar}
                />
              )}
              <form
                onSubmit={handleJoinRoom}
                className="flex flex-col gap-2 w-full max-w-xs"
              >
                <input
                  className="text-white bg-surface-sunken border border-white/10 placeholder:text-white/40 px-4 py-3 sm:px-6 sm:py-4 rounded-full text-center text-base sm:text-lg w-full"
                  placeholder="Enter your username"
                  value={inputUsername}
                  maxLength={USERNAME_MAX}
                  autoComplete="off"
                  spellCheck="false"
                  onChange={(e) => setInputUsername(e.target.value)}
                ></input>
                {/* Only surface the limit once the player approaches it */}
                <p
                  className={`text-sm text-center h-5 ${
                    inputUsername.length >= USERNAME_MAX
                      ? "text-red-400"
                      : "text-white/60"
                  }`}
                >
                  {inputUsername.length >= USERNAME_MAX - 5
                    ? `${inputUsername.length}/${USERNAME_MAX} characters`
                    : ""}
                </p>
                <Button
                  disabled={inputUsername.trim() === ""}
                  className="w-full py-3"
                >
                  Join room
                </Button>
              </form>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  if (!gameState || !player) {
    return (
      <div className="flex flex-col h-screen p-2 gap-2">
        <div className="flex grow w-full gap-2">
          <div className="flex grow flex-col justify-center items-center panel gap-4">
            <h1 className="text-white font-display text-2xl sm:text-3xl font-semibold text-center">Loading..</h1>
          </div>
          <div className="hidden sm:flex flex-col gap-2 h-full justify-center items-center panel-sunken"></div>
        </div>
        <Footer />
      </div>
    );
  }

  const isLongest = gameState.gameMode === "longest";
  const hostName =
    gameState.playerQueue.find((p) => p.isHost)?.username ?? "the host";

  function handleStartGame() {
    if (gameId) sendEvent(EventGameStart, { token: token, id: gameId });
  }

  function handleSubmitWord() {
    if (hasSubmitted) return;
    setHasSubmitted(true);
    sendEvent(EventEndTurn, null);
  }

  function handleStartRound() {
    if (gameId) {
      // Local reset for instant feedback; the NEXT_ROUND broadcast repeats
      // this on every client (including this one)
      setPlayerInput("");
      setAtamaActive(true);
      setOshiriActive(true);
      setRoundOver(false);
      setPlayerWords([]);
      setHasSubmitted(false);
      sendEvent(EventNextRound, null);
    }
  }

  function handleBackToLobby() {
    if (gameId && player?.isHost) {
      // Reset game state locally
      setGameOver(false);
      setGameOverPending(false);
      setWinners([]);
      setRoundOver(false);
      setPlayerInput("");
      setAtamaActive(false);
      setOshiriActive(false);
      setAtama("");
      setOshiri("");
      setFinishedWord("");
      setWordAccepted(false);
      setTopWords([]);
      setPlayerWords([]);
      setHasSubmitted(false);

      // Send reset event to backend
      sendEvent(EventResetGame, null);
    }
  }

  function handleCancelGame() {
    // Same as back to lobby - reset game to lobby state
    handleBackToLobby();
  }

  function handleLeaveRoom() {
    leavingRef.current = true;
    navigate("/");
  }

  return (
    <MotionConfig reducedMotion="user">
    <LayoutGroup>
    <div className="flex flex-col h-screen p-2 gap-2">
      <div className="flex grow w-full gap-2">
        {/* popLayout keeps the leaving screen rendered (absolute) while the
            next one mounts — required for the shared-element morphs and the
            crossfade between lobby and game */}
        <AnimatePresence mode="popLayout" initial={false}>
        {gameOver ? (
          <motion.div
            key="gameover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex grow flex-col justify-center items-center panel relative"
          >
            {/* Menu button — non-hosts need a way out of the winner screen */}
            <div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex gap-2 z-10">
              <MuteButton />
              <button
                onClick={() => setGameMenuOpen(true)}
                aria-label="Game menu"
                className="w-12 h-12 flex items-center justify-center rounded-full bg-surface-sunken border border-white/10 hover:bg-surface-raised active:scale-95 transition-transform text-white"
              >
                <HiMenu className="text-xl sm:text-2xl" />
              </button>
            </div>
            <WinnerScreen
              winners={winners}
              isHost={player?.isHost || false}
              onBackToLobby={handleBackToLobby}
            />
          </motion.div>
        ) : gameState.started ? (
          <motion.div
            key="game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex grow flex-col justify-center items-center panel gap-4 px-2 pt-24 pb-4 sm:pt-28 relative"
          >
            {/* Top bar: player rail · round header · controls */}
            <div className="absolute top-0 inset-x-0 z-10 flex items-center gap-2 sm:gap-4 p-2 sm:p-4">
              <div className="flex-none pl-1 pt-1">
                <PlayerRail
                  players={gameState.playerQueue}
                  currentUsername={
                    !isLongest && !roundOver && gameState.playerQueue.length > 0
                      ? gameState.playerQueue[0].username
                      : undefined
                  }
                />
              </div>
              <motion.h1
                initial={{ opacity: 0, y: -14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: BEAT.roundHeader }}
                className="flex-1 min-w-0 truncate text-center text-white font-display font-semibold text-sm sm:text-lg md:text-xl"
              >
                Round {gameState.round}/{gameState.maxRounds} —{" "}
                {roundOver
                  ? "Round over"
                  : isLongest
                  ? "Longest word wins!"
                  : gameState.playerQueue.length > 0
                  ? `${gameState.playerQueue[0].username}'s turn!`
                  : "Waiting for players…"}
              </motion.h1>
              <div className="flex-none flex gap-2">
                <MuteButton />
                <button
                  onClick={() => setGameMenuOpen(true)}
                  aria-label="Game menu"
                  className="w-12 h-12 flex items-center justify-center rounded-full bg-surface-sunken border border-white/10 hover:bg-surface-raised active:scale-95 transition-transform text-white"
                >
                  <HiMenu className="text-xl sm:text-2xl" />
                </button>
              </div>
            </div>

            {/* "GO!" stamp on round start */}
            <AnimatePresence>
              {entering && (
                <motion.div
                  key="go"
                  className="absolute inset-x-0 top-[18%] z-20 flex items-start justify-center pointer-events-none"
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.15, 1, 1] }}
                  transition={{ duration: 1.2, delay: BEAT.go, times: [0, 0.25, 0.6, 1] }}
                >
                  <span className="font-display font-bold text-6xl sm:text-8xl text-violet-300 drop-shadow-[0_4px_24px_rgba(139,92,246,0.8)]">
                    GO!
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {!roundOver && (
              <div className="flex flex-col justify-center items-center gap-2 sm:gap-3">
                {/* Timer: critical info — big, and pulses red when running out.
                    Shares a layoutId with the lobby Start button so one morphs
                    into the other on game start. */}
                <motion.div
                  layoutId="start-timer"
                  transition={tileTransition(BEAT.timer)}
                  className={`flex items-center justify-center rounded-full border font-display font-bold tabular-nums min-w-[72px] px-5 py-2 text-2xl sm:text-3xl transition-colors ${
                    gameState.time <= 5
                      ? "text-red-400 border-red-500/60 bg-red-500/10 animate-pulse-urgent"
                      : "text-white border-white/15 bg-surface-sunken"
                  }`}
                  aria-label={`Time left: ${gameState.time} seconds`}
                >
                  {gameState.time}
                </motion.div>
                {/* Draining bar: time proportion at a glance while typing */}
                <motion.div
                  initial={settleInitial}
                  animate={settleAnimate}
                  transition={settleTransition}
                  className="w-full max-w-xs h-2 rounded-full bg-surface-sunken border border-white/10 overflow-hidden"
                  aria-hidden
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
                      gameState.time <= 5 ? "bg-red-500" : "bg-violet-500"
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        (gameState.time / Math.max(1, gameState.roundTime)) * 100
                      )}%`,
                    }}
                  />
                </motion.div>
                {isLongest ? (
                  <motion.p
                    initial={settleInitial}
                    animate={settleAnimate}
                    transition={settleTransition}
                    className="text-white/60 text-sm"
                  >
                    {hasSubmitted
                      ? "Word locked in! Waiting for the other players..."
                      : "Press ↵ Enter to lock in your word"}
                  </motion.p>
                ) : (
                  player.isLeader &&
                  gameState.submitOnEnter && (
                    <motion.p
                      initial={settleInitial}
                      animate={settleAnimate}
                      transition={settleTransition}
                      className="text-white/60 text-sm"
                    >
                      Press ↵ Enter to submit your word early
                    </motion.p>
                  )
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-1 sm:gap-1.5 justify-center w-full max-w-full px-2">
              {(isLongest || player.isLeader) && !roundOver && (
                <>
                  <motion.div
                    layoutId="anchor-atama"
                    transition={tileTransition(BEAT.tiles)}
                  >
                    <LetterRandomizer letter={atama} active={atamaActive} />
                  </motion.div>
                  <motion.div
                    initial={settleInitial}
                    animate={settleAnimate}
                    transition={settleTransition}
                    className="flex flex-wrap gap-1 sm:gap-1.5 justify-center"
                  >
                    <LetterBoxInput
                      focus={focus}
                      text={playerInput}
                      setText={setPlayerInput}
                      disabled={gameState.roundOver || (isLongest && hasSubmitted)}
                      onEnter={
                        isLongest
                          ? handleSubmitWord
                          : gameState.submitOnEnter
                          ? () => sendEvent(EventEndTurn, null)
                          : undefined
                      }
                    />
                  </motion.div>
                  <motion.div
                    layoutId="anchor-oshiri"
                    transition={tileTransition(BEAT.tiles + BEAT.tilesStagger)}
                  >
                    <LetterRandomizer letter={oshiri} active={oshiriActive} />
                  </motion.div>
                </>
              )}
              {!isLongest && !player.isLeader && !roundOver && (
                <>
                  <motion.div
                    layoutId="anchor-atama"
                    transition={tileTransition(BEAT.tiles)}
                  >
                    <LetterRandomizer letter={atama} active={atamaActive} />
                  </motion.div>
                  <motion.div
                    initial={settleInitial}
                    animate={settleAnimate}
                    transition={settleTransition}
                    className="flex flex-wrap gap-1 sm:gap-1.5 justify-center"
                  >
                    <LetterBoxView text={playerInput.toUpperCase()} />
                  </motion.div>
                  <motion.div
                    layoutId="anchor-oshiri"
                    transition={tileTransition(BEAT.tiles + BEAT.tilesStagger)}
                  >
                    <LetterRandomizer letter={oshiri} active={oshiriActive} />
                  </motion.div>
                </>
              )}
              {roundOver && !isLongest && (
                <LetterBoxFinished
                  text={finishedWord}
                  wordAccepted={wordAccepted}
                />
              )}
            </div>
            {/* Longest-word mode results: everyone's word side by side */}
            {roundOver && isLongest && playerWords.length > 0 && (
              <div className="flex flex-col gap-1.5 w-full max-w-md">
                {playerWords.map((result, key) => (
                  <div
                    key={key}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${
                      result.winner
                        ? "bg-violet-500/15 border-violet-400/50"
                        : "bg-surface-sunken border-white/10"
                    }`}
                  >
                    <PlayerAvatar
                      username={result.username}
                      avatar={result.avatar}
                      size={32}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-white/60 text-sm truncate">
                        {result.username}
                      </span>
                      <span
                        className={`font-display font-semibold tracking-wider truncate ${
                          result.accepted ? "text-white" : "text-white/40 line-through"
                        }`}
                      >
                        {result.word.toUpperCase()}
                      </span>
                    </div>
                    <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                      {result.winner && (
                        <span className="text-violet-300 font-display font-bold text-sm">
                          +1
                        </span>
                      )}
                      {result.accepted ? (
                        <FaCheckCircle className="text-green-400" aria-label="Valid word" />
                      ) : (
                        <FaTimesCircle className="text-red-400" aria-label="Not a valid word" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {roundOver && topWords.length > 0 && (
              <div className="flex flex-col gap-2 items-center max-w-full">
                <span className="text-white/50 font-display text-sm sm:text-base uppercase tracking-widest">
                  Top words
                </span>
                <div className="flex gap-2 flex-wrap justify-center">
                  {topWords.map((value, key) => (
                    <span
                      key={key}
                      className="text-white text-sm sm:text-base px-3 py-1 rounded-full bg-surface-sunken border border-white/10"
                    >
                      {value}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => sendEvent(EventAllWords, null)}
                  className="text-sm text-violet-300 hover:text-violet-200 font-semibold underline underline-offset-4 decoration-violet-400/40 transition-colors"
                >
                  Show all possible words
                </button>
              </div>
            )}
            {roundOver && gameOverPending ? (
              // Final round: everyone reveals the winner screen at their own pace
              <Button
                onClick={() => setGameOver(true)}
                className="w-full max-w-xs py-3"
              >
                Show final results
              </Button>
            ) : roundOver && player.isHost ? (
              <Button onClick={handleStartRound} className="w-full max-w-xs py-3">Next round</Button>
            ) : (
              <p className="text-white text-center text-sm px-4">
                {roundOver && `Waiting for ${hostName} to start next round`}
              </p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="lobby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="flex grow flex-col justify-center items-center panel gap-4 px-4 py-6 relative"
          >
            {/* Mute + menu buttons for lobby */}
            <div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex gap-2 z-10">
              <MuteButton />
              <button
                onClick={() => setGameMenuOpen(true)}
                aria-label="Game menu"
                className="w-12 h-12 flex items-center justify-center rounded-full bg-surface-sunken border border-white/10 hover:bg-surface-raised active:scale-95 transition-transform text-white"
              >
                <HiMenu className="text-xl sm:text-2xl" />
              </button>
            </div>

            <p className="text-white/50 font-display text-sm sm:text-base uppercase tracking-widest text-center">
              Lobby · waiting for players
            </p>
            <RoomCodeMarquee code={gameId ?? ""} copied={copied} onCopy={copy} />
            <PlayerStage
              players={gameState.playerQueue}
              onInvite={copy}
              copied={copied}
            />
            <SettingsSummary gameState={gameState} />
            {player.isHost ? (
              <>
                <div className="flex flex-col items-center gap-3 w-full max-w-xs">
                  {/* Shares a layoutId with the in-game timer pill — on start
                      the button shrinks and morphs into the countdown */}
                  <motion.div
                    layoutId="start-timer"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="w-full"
                  >
                    <Button onClick={handleStartGame} className="w-full py-3">Start Game</Button>
                  </motion.div>
                  <button
                    onClick={() => setGamePropsOpen(true)}
                    title="Game options"
                    className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-full bg-surface-sunken border border-white/10 hover:bg-surface-raised hover:border-violet-400/50 active:scale-95 transition-all text-white"
                  >
                    <FaCog className="text-xl" />
                  </button>
                  <GameOptionsDialog
                    currentGameMode={gameState.gameMode}
                    currentMaxRounds={gameState.maxRounds}
                    currentRoundTime={gameState.roundTime}
                    currentMinWordCombos={gameState.wordCombinations}
                    currentLanguage={gameState.language}
                    currentBannedAtama={gameState.bannedAtama}
                    currentBannedOshiri={gameState.bannedOshiri}
                    currentSubmitOnEnter={gameState.submitOnEnter}
                    isOpen={gamePropsOpen}
                    setIsOpen={setGamePropsOpen}
                    sendEvent={sendEvent}
                  />
                </div>
              </>
            ) : (
              <p className="text-white text-center text-sm sm:text-base px-4">
                Waiting for {hostName} to start the game
              </p>
            )}
          </motion.div>
        )}
        </AnimatePresence>
      </div>
      <Footer />
      
      {/* All possible words for the finished round */}
      {allWords && (
        <WordListDialog
          isOpen={wordListOpen}
          setIsOpen={setWordListOpen}
          atama={allWords.atama}
          oshiri={allWords.oshiri}
          words={allWords.words}
        />
      )}

      {/* Reconnecting overlay — the server holds our seat for a grace period */}
      {reconnecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="dialog-backdrop" aria-hidden="true" />
          <div className="dialog-panel relative flex flex-col items-center gap-4 max-w-xs text-center">
            <Oval color="#a78bfa" secondaryColor="#4c1d95" width={48} height={48} />
            <p className="font-display font-semibold text-lg">Reconnecting…</p>
            <p className="text-white/60 text-sm">
              Connection lost. Hang tight — your spot in the game is saved for
              a little while.
            </p>
          </div>
        </div>
      )}

      {/* Game Menu */}
      <GameMenu
        isOpen={gameMenuOpen}
        setIsOpen={setGameMenuOpen}
        isHost={player?.isHost || false}
        gameStarted={gameState?.started || false}
        onCancelGame={handleCancelGame}
        onLeaveRoom={handleLeaveRoom}
      />
    </div>
    </LayoutGroup>
    </MotionConfig>
  );
}
