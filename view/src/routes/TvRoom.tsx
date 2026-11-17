import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import useWebSocket from "react-use-websocket";
import { QRCodeSVG } from "qrcode.react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "framer-motion";
import { toast } from "react-toastify";
import { useLocalStorage } from "usehooks-ts";
import useSound from "use-sound";
import { FaCheckCircle, FaCompress, FaExpand, FaTimesCircle } from "react-icons/fa";
import { HiMenu } from "react-icons/hi";

import { getWsConfig } from "../misc/server.conf";
import TileLoader from "../components/TileLoader";
import PlayerStage from "../components/PlayerStage";
import PlayerRail from "../components/PlayerRail";
import PlayerCircle from "../components/PlayerCircle";
import LetterRandomizer from "../components/LetterRandomizer";
import LetterBoxView from "../components/LetterBoxView";
import LetterBoxFinished from "../components/LetterBoxFinished";
import PlayerAvatar from "../components/PlayerAvatar";
import ChatBubble from "../components/ChatBubble";
import { MORPH } from "../misc/motion";
import { Bubble } from "../hooks/useChatBubbles";
import MuteButton from "../components/MuteButton";
import GameMenu from "../components/GameMenu";
import WinnerScreen, { Award, PlayerRanking } from "../components/WinnerScreen";
import { useChatBubbles } from "../hooks/useChatBubbles";
import heartbeatSound from "../../public/sounds/heartbeat.mp3";

import {
  Event,
  GameState,
  Player,
  RoundOverResponse,
  GameOverResponse,
  PlayerWordResult,
  RoyaleResult,
  vary,
  CHAIN_ALIVE_PHRASES,
  NOT_A_WORD_PHRASES,
  LOSE_LIFE_PHRASES,
  ELIMINATED_PHRASES,
  tooShortPhrases,
  tooLongPhrases,
  EventJoinSpectate,
  EventGameState,
  EventGameStart,
  EventRoundStart,
  EventNextRound,
  EventRoundFinished,
  EventRoundAtama,
  EventRoundOshiri,
  EventGameOver,
  EventChatMessage,
  EventRoomNotFound,
  EventNewClient,
} from "./Room";

interface NewLetterEvent {
  letter: string;
}

interface ChatMessageEvent {
  username: string;
  message: string;
}

interface NewClientEvent {
  token: string;
}

/** How long the TV lingers on the final round's results before it reveals
    the winner screen on its own (it has no "show results" button to press) */
const GAME_OVER_HOLD_MS = 6000;

/**
 * Longest-word live board: every player's secret-word progress as a big
 * status card. Three states, each carrying an icon/word so color never
 * stands alone: thinking (dim), typing (violet pulse), locked in (green).
 * The words themselves never reach the TV, so nothing can spoil.
 */
function LongestStatusBoard(props: {
  players: Player[];
  bubbles: Record<string, Bubble>;
}) {
  const locked = props.players.filter((p) => p.submitted).length;

  return (
    <div className="flex flex-col items-center gap-5 w-full">
      <div className="flex flex-wrap justify-center items-start gap-6 lg:gap-8 max-w-5xl">
        {props.players.map((p) => {
          const status = p.submitted
            ? { label: "Locked in", chip: "border-green-400/60 bg-green-500/10 text-green-300", ring: "ring-[3px] ring-green-400/70" }
            : p.hasRoundInput
            ? { label: "Typing…", chip: "border-violet-400/60 bg-violet-500/10 text-violet-300 animate-pulse", ring: "ring-[3px] ring-violet-300/60" }
            : { label: "Thinking…", chip: "border-white/10 bg-surface-sunken text-white/40", ring: "" };
          return (
            <motion.div
              key={p.username}
              layoutId={`player-${p.username}`}
              transition={MORPH}
              className="relative flex flex-col items-center gap-2 w-28 lg:w-32"
            >
              <div className={`rounded-full ${status.ring}`}>
                <PlayerAvatar username={p.username} avatar={p.avatar} size={80} />
              </div>
              <span className="text-white font-display font-semibold text-base lg:text-lg truncate w-full text-center">
                {p.username}
              </span>
              <span
                className={`px-3 py-1 rounded-full border text-sm lg:text-base font-semibold flex items-center gap-1.5 ${status.chip}`}
              >
                {p.submitted && <FaCheckCircle aria-hidden />}
                {status.label}
              </span>
              <AnimatePresence>
                {props.bubbles[p.username] && (
                  <ChatBubble
                    key={props.bubbles[p.username].key}
                    text={props.bubbles[p.username].text}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
      <p className="text-white/50 text-lg tabular-nums">
        {locked}/{props.players.length} locked in · reveal at the buzzer
      </p>
    </div>
  );
}

/**
 * TV mode: a watch-only big-screen view of a room, Jackbox-style. The TV
 * never takes input beyond mute/fullscreen - it shows the join QR in the
 * lobby and mirrors the game once it starts. Players drive everything from
 * their own devices; the first player to join becomes the host.
 */
export default function TvRoom() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  // Reuse the stored identity token so the server recognizes this device,
  // but spectating never claims a seat with it
  const [token, setToken] = useLocalStorage("token", "");

  const [gameState, setGameState] = useState<GameState>();
  const [atama, setAtama] = useState("");
  const [oshiri, setOshiri] = useState("");
  const [atamaActive, setAtamaActive] = useState(false);
  const [oshiriActive, setOshiriActive] = useState(false);
  const [roundOver, setRoundOver] = useState(false);
  const roundOverRef = useRef(false);
  const [finishedWord, setFinishedWord] = useState("");
  const [wordAccepted, setWordAccepted] = useState(false);
  const [topWords, setTopWords] = useState<string[]>([]);
  const [playerWords, setPlayerWords] = useState<PlayerWordResult[]>([]);
  const [royaleResult, setRoyaleResult] = useState<RoyaleResult | null>(null);
  const [autoNextAt, setAutoNextAt] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [winners, setWinners] = useState<PlayerRanking[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [reconnecting, setReconnecting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  // Set when the TV leaves on purpose, so we don't try to reconnect
  const leavingRef = useRef(false);
  const { bubbles, showBubble } = useChatBubbles();

  const tokenRef = useRef(token);
  tokenRef.current = token;

  const wsUrl = useMemo(() => {
    const base = getWsConfig();
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  }, [token]);

  // Same ordered message queue as Room: the server can send several
  // messages in one tick and react batching must not drop any
  const [messageQueue, setMessageQueue] = useState<string[]>([]);

  const { sendMessage } = useWebSocket(wsUrl, {
    onMessage: (message) =>
      setMessageQueue((queue) => [...queue, message.data as string]),
    shouldReconnect: () => !leavingRef.current,
    reconnectAttempts: 10,
    reconnectInterval: (attempt) => Math.min(500 * 2 ** attempt, 5000),
    onReconnectStop: () => {
      toast.error(`Lost connection to gameroom ${gameId}`);
      navigate("/");
    },
    onOpen: () => {
      setReconnecting(false);
      if (gameId) {
        const event: Event = {
          type: EventJoinSpectate,
          data: { id: gameId },
        };
        sendMessage(JSON.stringify(event));
      }
    },
    onClose: () => {
      if (!leavingRef.current) setReconnecting(true);
    },
  });

  function handleLeaveRoom() {
    leavingRef.current = true;
    navigate("/");
  }

  // ESC opens the menu, matching the player view; the dialog itself owns
  // ESC while open (headlessui closes it on the same press)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (gameMenuOpen) return;
      setGameMenuOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gameMenuOpen]);

  useEffect(() => {
    if (messageQueue.length === 0) return;
    for (const raw of messageQueue) {
      handleServerEvent(JSON.parse(raw));
    }
    setMessageQueue([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageQueue]);

  function handleServerEvent(event: Event) {
    switch (event.type) {
      case EventNewClient:
        setToken((event.data as NewClientEvent).token);
        break;
      case EventGameStart:
        setGameState(event.data as GameState);
        setAtamaActive(true);
        setOshiriActive(true);
        break;
      case EventGameState: {
        const state = event.data as GameState;
        setGameState(state);
        if (!state.started) {
          // Reset to lobby: clear everything round-related
          setGameOver(false);
          setWinners([]);
          setAwards([]);
          roundOverRef.current = false;
          setRoundOver(false);
          setAtamaActive(false);
          setOshiriActive(false);
          setAtama("");
          setOshiri("");
          setFinishedWord("");
          setWordAccepted(false);
          setTopWords([]);
          setPlayerWords([]);
          setRoyaleResult(null);
          setAutoNextAt(null);
        }
        // Attached mid-game (or reconnected): the letter events are long
        // gone, recover the round letters from the shared state
        if (state.started) {
          setAtama((a) => a || state.atama);
          setOshiri((o) => o || state.oshiri);
          roundOverRef.current = state.roundOver;
          setRoundOver((r) => (r === state.roundOver ? r : state.roundOver));
        }
        break;
      }
      case EventRoundStart:
        setGameState(event.data as GameState);
        setAtamaActive(false);
        setOshiriActive(false);
        break;
      case EventNextRound:
        roundOverRef.current = false;
        setRoundOver(false);
        setAtamaActive(true);
        setOshiriActive(true);
        setPlayerWords([]);
        setRoyaleResult(null);
        setAutoNextAt(null);
        break;
      case EventRoundFinished: {
        const finished = event.data as RoundOverResponse;
        finished.gameState.time = finished.gameState.roundTime;
        roundOverRef.current = true;
        setRoundOver(true);
        setTopWords(finished.topWords ?? []);
        setGameState(finished.gameState);
        setFinishedWord(finished.word.toLocaleUpperCase());
        setWordAccepted(finished.wordAccepted);
        setPlayerWords(finished.playerWords ?? []);
        if (finished.gameState.gameMode === "royale") {
          setRoyaleResult({
            turnUsername: finished.turnUsername ?? "",
            accepted: finished.wordAccepted,
            tooShort: finished.tooShort ?? false,
            tooLong: finished.tooLong ?? false,
            neededLength: finished.neededLength ?? 0,
            eliminatedPlayer: finished.eliminatedPlayer,
            seed: Math.random(),
          });
          setAutoNextAt(
            finished.autoNextIn ? Date.now() + finished.autoNextIn * 1000 : null
          );
        }
        break;
      }
      case EventRoundAtama:
        setAtama((event.data as NewLetterEvent).letter);
        setAtamaActive(false);
        break;
      case EventRoundOshiri:
        setOshiri((event.data as NewLetterEvent).letter);
        setOshiriActive(false);
        break;
      case EventChatMessage: {
        const chat = event.data as ChatMessageEvent;
        showBubble(chat.username, chat.message);
        break;
      }
      case EventGameOver: {
        const over = event.data as GameOverResponse;
        setWinners(over.winners);
        setAwards(over.awards ?? []);
        if (roundOverRef.current) {
          // Let the last round's result breathe, then reveal the podium -
          // the TV has no "show final results" button
          window.setTimeout(() => setGameOver(true), GAME_OVER_HOLD_MS);
        } else {
          setGameOver(true);
        }
        break;
      }
      case EventRoomNotFound:
        toast.error("Room not found. It may have expired");
        leavingRef.current = true;
        navigate("/");
        break;
    }
  }

  // Heartbeat under the final seconds, same ramp as the player view - the
  // TV doubles as the party speaker
  const [heartbeat, { stop: stopHeartbeat, sound: heartbeatHowl }] = useSound(
    heartbeatSound,
    { volume: 0.9 }
  );
  const heartbeatOn = useRef(false);
  const timeLeft = gameState?.time;
  useEffect(() => {
    const live =
      !!gameState?.started &&
      !roundOver &&
      timeLeft !== undefined &&
      timeLeft > 0 &&
      timeLeft <= 7;
    if (live) {
      const rate = 1 + 0.2 * (7 - Math.max(1, timeLeft));
      if (!heartbeatOn.current) {
        heartbeatOn.current = true;
        heartbeat({ playbackRate: rate });
      } else {
        heartbeatHowl?.rate(rate);
      }
    } else if (heartbeatOn.current) {
      heartbeatOn.current = false;
      stopHeartbeat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, roundOver, gameState?.started]);

  // Royale auto-advance countdown label
  const [, setCountdownTick] = useState(0);
  useEffect(() => {
    if (!autoNextAt) return;
    const id = window.setInterval(() => setCountdownTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [autoNextAt]);
  const nextTurnIn = autoNextAt
    ? Math.max(0, Math.ceil((autoNextAt - Date.now()) / 1000))
    : null;

  // Two-phase round-over reveal, same rhythm as the player view
  const [verdictShown, setVerdictShown] = useState(false);
  useEffect(() => {
    if (!roundOver) {
      setVerdictShown(false);
      return;
    }
    const ms = finishedWord.length * 50 + 1400;
    const timeout = window.setTimeout(() => setVerdictShown(true), ms);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundOver]);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setFullscreen(false);
    } else {
      document.documentElement.requestFullscreen?.();
      setFullscreen(true);
    }
  }

  const joinUrl = `${window.location.origin}/room/${gameId}`;

  if (!gameState) {
    return (
      <div className="flex flex-col h-screen p-3">
        <div className="flex grow flex-col justify-center items-center panel gap-4">
          <TileLoader size="lg" letters="···" label="Connecting" />
          <h1 className="text-white font-display text-3xl font-semibold">
            Connecting to room…
          </h1>
        </div>
      </div>
    );
  }

  const isLongest = gameState.gameMode === "longest";
  const isRoyale = gameState.gameMode === "royale";
  const railPlayers = isRoyale
    ? [
        ...gameState.playerQueue,
        ...(gameState.eliminatedPlayers ?? []).map((p) => ({
          ...p,
          eliminated: true,
        })),
      ]
    : gameState.playerQueue;
  const aliveCount = gameState.playerQueue.length;
  const currentPlayer =
    gameState.playerQueue.length > 0 ? gameState.playerQueue[0] : undefined;
  const hostName =
    gameState.playerQueue.find((p) => p.isHost)?.username ?? "the host";

  return (
    <MotionConfig reducedMotion="user">
    <LayoutGroup>
    {/* Outer padding doubles as the TV title-safe margin: all content stays
        clear of overscan without a separate calibration step */}
    <div className="tv-scale flex flex-col h-screen p-[2.5vmin] gap-2">
      <div className="flex grow w-full min-h-0 relative">
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
            <WinnerScreen winners={winners} awards={awards} isHost={false} />
          </motion.div>
        ) : gameState.started ? (
          <motion.div
            key="game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex grow flex-col panel relative min-h-0 overflow-hidden"
          >
            {/* Top bar: player rail · round header */}
            <div className="absolute top-0 inset-x-0 z-10 flex items-center gap-4 p-4 lg:p-6">
              {/* During a live longest-word round the status board below IS
                  the player display, a rail on top would just duplicate it */}
              {!isRoyale && !(isLongest && !roundOver) && (
                <div className="flex-none pl-1 pt-1">
                  <PlayerRail
                    players={railPlayers}
                    bubbles={bubbles}
                    currentUsername={
                      !isLongest && !roundOver && currentPlayer
                        ? currentPlayer.username
                        : undefined
                    }
                  />
                </div>
              )}
              <h1 className="flex-1 min-w-0 truncate text-center text-white font-display font-semibold text-2xl lg:text-4xl">
                {isRoyale
                  ? `Turn ${gameState.round} · ${aliveCount} left`
                  : `Round ${gameState.round}/${gameState.maxRounds}`}{" "}
                ·{" "}
                {roundOver
                  ? isRoyale
                    ? "Turn over"
                    : "Round over"
                  : isLongest
                  ? "Longest word wins!"
                  : currentPlayer
                  ? `${currentPlayer.username}'s turn!`
                  : "Waiting for players…"}
              </h1>
            </div>

            {/* Battle royale: players ring the play area */}
            {isRoyale && (
              <div className="absolute inset-x-10 top-28 bottom-8 z-0 pointer-events-none">
                <PlayerCircle
                  players={railPlayers}
                  bubbles={bubbles}
                  currentUsername={currentPlayer?.username}
                />
              </div>
            )}

            <div className="flex grow flex-col items-center gap-6 w-full min-h-0 overflow-y-auto px-4 pt-28 pb-10">
            <AnimatePresence mode="wait" initial={false}>
            {!roundOver ? (
            <motion.div
              key="live-round"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14, scale: 0.98 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="flex flex-col justify-center items-center gap-6 w-full my-auto shrink-0"
            >
              <div className="flex flex-col justify-center items-center gap-3">
                {/* Timer: hero-sized for the couch, pulses red at the end */}
                <div
                  className={`flex items-center justify-center rounded-full border font-display font-bold tabular-nums min-w-[120px] px-8 py-3 text-5xl lg:text-6xl transition-colors ${
                    gameState.time <= 7
                      ? "text-red-400 border-red-500/60 bg-red-500/10 animate-pulse-urgent"
                      : "text-white border-white/15 bg-surface-sunken"
                  }`}
                  aria-label={`Time left: ${gameState.time} seconds`}
                >
                  {gameState.time}
                </div>
                <div
                  className="w-full max-w-md h-3 rounded-full bg-surface-sunken border border-white/10 overflow-hidden"
                  aria-hidden
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
                      gameState.time <= 7 ? "bg-red-500" : "bg-violet-500"
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        (gameState.time / Math.max(1, gameState.roundTime)) * 100
                      )}%`,
                    }}
                  />
                </div>
                {isRoyale && (
                  <div className="flex flex-col items-center gap-1 text-center">
                    <p className="text-white font-display font-semibold text-xl lg:text-2xl">
                      {gameState.requiredLength > 0
                        ? gameState.mutation === "exactLength"
                          ? `Match the chain: exactly ${gameState.requiredLength} letters`
                          : `Beat the chain: at least ${gameState.requiredLength} letters`
                        : "Any valid word starts the chain"}
                    </p>
                    <p className="text-white/60 text-lg">
                      New letters in {gameState.swapIn}{" "}
                      {gameState.swapIn === 1 ? "turn" : "turns"}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 justify-center w-full max-w-full px-2">
                <LetterRandomizer letter={atama} active={atamaActive} />
                {isLongest ? (
                  // Hidden words: the TV must not spoil anyone's typing, so
                  // it shows a secretive placeholder between the letters
                  <div className="tile tile-empty animate-pulse" aria-hidden />
                ) : (
                  <LetterBoxView text={gameState.input.toUpperCase()} />
                )}
                <LetterRandomizer letter={oshiri} active={oshiriActive} />
              </div>
              {isLongest && (
                <LongestStatusBoard
                  players={gameState.playerQueue}
                  bubbles={bubbles}
                />
              )}
            </motion.div>
            ) : (
            <motion.div
              key="round-results"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14, transition: { duration: 0.2, ease: "easeIn" } }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col justify-center items-center gap-5 w-full my-auto shrink-0"
            >
              {/* Only render a verdict the TV actually witnessed: attaching
                  after ROUND_FINISHED leaves finishedWord empty, and an empty
                  tile with "Not a valid word" would be a lie */}
              {!isLongest && finishedWord !== "" && (
                <div className="flex flex-wrap gap-1.5 justify-center w-full max-w-full px-2">
                  <LetterBoxFinished text={finishedWord} wordAccepted={wordAccepted} />
                </div>
              )}
              {/* Battle royale verdict: chain status, lost lives, eliminations */}
              {isRoyale && verdictShown && royaleResult && (
                <motion.div
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col items-center gap-2 text-center max-w-2xl px-2"
                >
                  {royaleResult.accepted ? (
                    <p className="text-white font-display font-semibold text-xl lg:text-2xl">
                      {royaleResult.turnUsername}{" "}
                      {vary(CHAIN_ALIVE_PHRASES, royaleResult.seed)} Next word
                      needs {gameState.mutation === "exactLength"
                        ? "exactly"
                        : "at least"}{" "}
                      {gameState.requiredLength} letters.
                    </p>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 px-6 py-4 rounded-xl bg-red-500/10 border border-red-500/40">
                      <p className="text-red-300 font-display font-semibold text-xl lg:text-2xl">
                        {royaleResult.tooShort
                          ? vary(tooShortPhrases(royaleResult.neededLength), royaleResult.seed)
                          : royaleResult.tooLong
                          ? vary(tooLongPhrases(royaleResult.neededLength), royaleResult.seed)
                          : vary(NOT_A_WORD_PHRASES, royaleResult.seed)}
                      </p>
                      <p className="text-white/80 text-lg">
                        {royaleResult.turnUsername}{" "}
                        {vary(LOSE_LIFE_PHRASES, royaleResult.seed)}{" "}
                        <span className="text-red-400" aria-hidden>♥</span>
                      </p>
                      {royaleResult.eliminatedPlayer && (
                        <p className="text-white font-display font-bold text-xl lg:text-2xl">
                          💀 {royaleResult.eliminatedPlayer}{" "}
                          {vary(ELIMINATED_PHRASES, royaleResult.seed)}
                        </p>
                      )}
                    </div>
                  )}
                  {gameState.swapIn <= 0 && (
                    <p className="text-violet-300 text-lg font-semibold">
                      New letters coming up!
                    </p>
                  )}
                </motion.div>
              )}
              {/* Longest-word reveal: everyone's secret word, cascading in.
                  This is the TV's payoff moment for the mode. */}
              {isLongest && playerWords.length > 0 && (
                <div className="flex flex-col gap-2 w-full max-w-2xl">
                  {playerWords.map((result, key) => (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, y: 16, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        duration: 0.35,
                        ease: [0.22, 1, 0.36, 1],
                        delay: key * 0.3,
                      }}
                      className={`flex items-center gap-4 px-5 py-3 rounded-xl border ${
                        result.winner
                          ? "bg-violet-500/15 border-violet-400/50"
                          : "bg-surface-sunken border-white/10"
                      }`}
                    >
                      <PlayerAvatar
                        username={result.username}
                        avatar={result.avatar}
                        size={48}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-white/60 text-base truncate">
                          {result.username}
                        </span>
                        <span
                          className={`font-display font-semibold tracking-wider truncate text-xl lg:text-2xl ${
                            result.accepted ? "text-white" : "text-white/40 line-through"
                          }`}
                        >
                          {result.word.toUpperCase()}
                        </span>
                      </div>
                      <div className="ml-auto flex items-center gap-3 flex-shrink-0">
                        {result.winner && (
                          <span className="text-violet-300 font-display font-bold text-xl">
                            +1
                          </span>
                        )}
                        {result.accepted ? (
                          <FaCheckCircle className="text-green-400 text-2xl" aria-label="Valid word" />
                        ) : (
                          <FaTimesCircle className="text-red-400 text-2xl" aria-label="Not a valid word" />
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
              {verdictShown && topWords.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    duration: 0.35,
                    ease: [0.22, 1, 0.36, 1],
                    delay: isLongest ? playerWords.length * 0.3 + 0.2 : 0,
                  }}
                  className="flex flex-col gap-2 items-center max-w-full"
                >
                  <span className="text-white/50 font-display text-lg uppercase tracking-widest">
                    Top words
                  </span>
                  <div className="flex gap-2 flex-wrap justify-center">
                    {topWords.map((value, key) => (
                      <span
                        key={key}
                        className="text-white text-lg px-4 py-1.5 rounded-full bg-surface-sunken border border-white/10"
                      >
                        {value}
                      </span>
                    ))}
                  </div>
                </motion.div>
              )}
              {verdictShown && (
                <p className="text-white/60 text-center text-lg tabular-nums">
                  {isRoyale
                    ? nextTurnIn !== null && nextTurnIn > 0
                      ? `Next turn in ${nextTurnIn}…`
                      : "Next turn starting…"
                    : `Waiting for ${hostName} to start the next round`}
                </p>
              )}
            </motion.div>
            )}
            </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="lobby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="flex grow flex-col items-center justify-center panel gap-6 px-6 py-8 relative min-h-0 overflow-y-auto"
          >
            <p className="text-white/50 font-display text-lg lg:text-xl uppercase tracking-widest text-center">
              Oshirigame · join on your phone
            </p>

            {/* Join block: QR is the primary path, the code the fallback */}
            <div className="flex flex-wrap items-center justify-center gap-8 lg:gap-14">
              <div className="flex flex-col items-center gap-3">
                {/* White quiet zone so the QR scans against the dark theme */}
                <div className="bg-white p-4 rounded-2xl shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
                  <QRCodeSVG
                    value={joinUrl}
                    size={200}
                    marginSize={0}
                    aria-label={`QR code to join room ${gameId}`}
                  />
                </div>
                <p className="text-white/60 text-lg">Scan to join</p>
              </div>
              <div className="flex flex-col items-center gap-3 max-w-full">
                <p className="text-white/60 text-lg text-center">
                  or go to{" "}
                  <span className="text-white font-semibold">
                    {window.location.host}
                  </span>{" "}
                  and enter
                </p>
                {/* Room code in the game's own tiles */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-full px-2">
                  {(gameId ?? "").split("").map((c, i) => (
                    <div
                      key={i}
                      className={`tile !w-10 !h-10 !text-2xl lg:!w-14 lg:!h-14 lg:!text-4xl ${
                        c === "-" ? "tile-empty !text-white/60" : ""
                      }`}
                    >
                      {c.toUpperCase()}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <PlayerStage
              players={gameState.playerQueue}
              onInvite={() => {}}
              copied={false}
              bubbles={bubbles}
              readOnly
            />

            <p className="text-white/70 text-lg lg:text-xl text-center px-4">
              {gameState.playerQueue.length === 0
                ? "Waiting for players… the first to join runs the game"
                : `Waiting for ${hostName} to start the game`}
            </p>
          </motion.div>
        )}
        </AnimatePresence>

        {/* The TV's only controls: mute and fullscreen, tucked in a corner */}
        <div className="absolute top-3 right-3 lg:top-5 lg:right-5 flex gap-2 z-20">
          <MuteButton />
          <button
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-surface-sunken border border-white/10 hover:bg-surface-raised active:scale-95 transition-transform text-white"
          >
            {fullscreen ? <FaCompress className="text-xl" /> : <FaExpand className="text-xl" />}
          </button>
          <button
            onClick={() => setGameMenuOpen(true)}
            aria-label="Game menu"
            className="w-12 h-12 flex items-center justify-center rounded-full bg-surface-sunken border border-white/10 hover:bg-surface-raised active:scale-95 transition-transform text-white"
          >
            <HiMenu className="text-xl" />
          </button>
        </div>
      </div>

      {/* ESC menu: the TV never hosts, so it only offers the way out */}
      <GameMenu
        isOpen={gameMenuOpen}
        setIsOpen={setGameMenuOpen}
        isHost={false}
        gameStarted={gameState?.started || false}
        round={gameState?.round}
        maxRounds={gameState?.maxRounds}
        onLeaveRoom={handleLeaveRoom}
      />

      {/* Reconnecting overlay */}
      {reconnecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="dialog-backdrop" aria-hidden="true" />
          <div className="dialog-panel relative flex flex-col items-center gap-4 max-w-xs text-center">
            <TileLoader size="lg" letters="···" label="Reconnecting" />
            <p className="font-display font-semibold text-lg">Reconnecting…</p>
          </div>
        </div>
      )}
    </div>
    </LayoutGroup>
    </MotionConfig>
  );
}
