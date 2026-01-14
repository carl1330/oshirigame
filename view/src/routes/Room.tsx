import { useNavigate, useParams } from "react-router-dom";
import Footer from "../components/Footer";
import React, { useEffect, useState } from "react";
import useWebSocket from "react-use-websocket";
import { getWsConfig } from "../misc/server.conf";
import { useLocalStorage } from "usehooks-ts";
import PlayerCard from "../components/PlayerCard";
import Button from "../components/Button";
import { toast } from "react-toastify";
import LetterBoxInput from "../components/LetterBoxInput";
import LetterBoxView from "../components/LetterBoxView";
import LetterRandomizer from "../components/LetterRandomizer";
import LetterBoxFinished from "../components/LetterBoxFinished";
import { FaCog } from "react-icons/fa";
import { HiMenu } from "react-icons/hi";
import GameOptionsDialog from "../components/GameOptionsDialog";
import GameMenu from "../components/GameMenu";
import WinnerScreen, { PlayerRanking } from "../components/WinnerScreen";

export type Event = {
  type: string;
  data: Message;
};

export type GameState = {
  started: boolean;
  time: number;
  round: number;
  maxRounds: number;
  wordCombinations: number;
  roundTime: number;
  playerQueue: Player[];
  input: string;
  atama: string;
  oshiri: string;
  roundOver: boolean;
};

type Player = {
  token: string;
  username: string;
  ready: boolean;
  score: number;
  isLeader: boolean;
};

interface JoinGameMessage {
  username: string;
  id: string;
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
}

interface RoundOverResponse {
  topWords: string[];
  gameState: GameState;
  wordAccepted: boolean;
  word: string;
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
export const Error = "ERROR";

export default function Room() {
  const { gameId } = useParams();
  const [token, setToken] = useLocalStorage("token", "");
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
  const [winners, setWinners] = useState<PlayerRanking[]>([]);
  const navigate = useNavigate();
  const apiConfig = getWsConfig();

  const { sendMessage, lastMessage } = useWebSocket(apiConfig, {
    onClose: (e) => {
      console.log(e);
      toast.info(`Disconnected from gameroom ${gameId}`);
      navigate("/");
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
        setAtamaActive(true);
        break;
      case EventGameState: {
        const gameState = event.data as GameState;
        setGameState(gameState);
        if (player && !player.isLeader) {
          setPlayerInput(gameState.input);
        }
        break;
      }
      case EventPlayerState:
        setPlayer(event.data as Player);
        break;
      case EventRoundStart: {
        const gameState = event.data as GameState;
        setGameState(gameState);
        break;
      }
      case EventNextRound:
        if (player) {
          if (!player.isLeader) {
            setRoundOver(false);
          }
        }
        break;
      case EventRoundFinished: {
        const gameStateFinished = event.data as RoundOverResponse;
        gameStateFinished.gameState.time = 25;
        setRoundOver(true);
        setTopWords(gameStateFinished.topWords);
        setGameState(gameStateFinished.gameState);
        setFinishedWord(gameStateFinished.word.toLocaleUpperCase());
        setWordAccepted(gameStateFinished.wordAccepted);
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
      case EventGameOver: {
        const gameOverData = event.data as GameOverResponse;
        setGameOver(true);
        setWinners(gameOverData.winners);
        break;
      }
      case Error: {
        const error = event.data as NewMessage;
        toast.error(error.message);
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
    window.addEventListener("beforeunload", (event) => {
      event.preventDefault();
      return "";
    });

    return () => {
      window.addEventListener("beforeunload", (event) => {
        event.preventDefault();
        return "";
      });
    };
  }, []);

  function handleJoinRoom(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    setUsername(inputUsername);
    if (gameId)
      sendEvent(EventJoinGame, {
        username: inputUsername,
        id: gameId,
        token: token,
      });
  }

  const [inputUsername, setInputUsername] = useState("");

  if (username === "") {
    return (
      <div className="w-full h-screen flex p-2">
        <div className="flex w-full flex-col gap-2">
          <div className="flex grow justify-center">
            <div className="flex flex-col gap-4 justify-center items-center h-full w-full rounded-xl bg-[#212121] px-4 py-6">
              <h1 className="text-white text-2xl sm:text-3xl font-bold text-center">Join room</h1>
              <form className="flex flex-col gap-4 w-full max-w-xs">
                <input
                  className="text-white bg-[#3F3F3F] px-4 py-3 sm:px-6 sm:py-4 rounded-full text-center text-base sm:text-lg w-full"
                  placeholder="Enter your username"
                  onChange={(e) => setInputUsername(e.target.value)}
                ></input>
                <Button onClick={handleJoinRoom} className="w-full py-3">Join room</Button>
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
          <div className="flex grow flex-col justify-center items-center bg-[#212121] rounded-xl gap-4">
            <h1 className="text-white text-2xl sm:text-3xl font-bold text-center">Loading..</h1>
          </div>
          <div className="hidden sm:flex flex-col gap-2 h-full justify-center items-center bg-[#161616] rounded-xl"></div>
        </div>
        <Footer />
      </div>
    );
  }

  function handleStartGame() {
    if (gameId) sendEvent(EventGameStart, { token: token, id: gameId });
  }

  function handleStartRound() {
    if (gameId) {
      setPlayerInput("");
      setAtamaActive(true);
      setRoundOver(false);
      sendEvent(EventNextRound, null);
    }
  }

  function handleBackToLobby() {
    if (gameId && player?.isLeader) {
      // Reset game state locally
      setGameOver(false);
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
      
      // Send reset event to backend
      sendEvent(EventResetGame, null);
    }
  }

  function handleCancelGame() {
    // Same as back to lobby - reset game to lobby state
    handleBackToLobby();
  }

  function handleLeaveRoom() {
    // Navigate back to home page
    navigate("/");
  }

  return (
    <div className="flex flex-col h-screen p-2 gap-2">
      <div className="flex grow w-full gap-2">
        {gameOver ? (
          <div className="flex grow flex-col justify-center items-center bg-[#212121] rounded-xl">
            <WinnerScreen 
              winners={winners}
              isLeader={player?.isLeader || false}
              onBackToLobby={handleBackToLobby}
            />
          </div>
        ) : gameState.started ? (
          <div className="flex grow flex-col justify-center items-center bg-[#212121] rounded-xl gap-4 px-2 py-4 relative">
            {/* Menu Button */}
            <button 
              onClick={() => setGameMenuOpen(true)} 
              className="absolute top-2 right-2 sm:top-4 sm:right-4 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-[#3F3F3F] hover:bg-[#4F4F4F] active:scale-95 transition-transform text-white z-10"
            >
              <HiMenu className="text-xl sm:text-2xl" />
            </button>

            <h1 className="text-white text-xl sm:text-2xl md:text-3xl font-bold text-center">
              Round: {gameState.round}
            </h1>
            <h1 className="text-white text-lg sm:text-xl md:text-3xl font-bold text-center">
              {roundOver ? (
                "Round Over"
              ) : (
                <div className="flex flex-col justify-center items-center gap-2 sm:gap-4">
                  <p className="text-lg sm:text-2xl md:text-4xl text-center">
                    {gameState.playerQueue[0].username}'s turn!
                  </p>
                  <p className="text-sm sm:text-base">Time left: {gameState.time}</p>
                </div>
              )}
            </h1>
            <div className="flex flex-wrap gap-0 justify-center w-full max-w-full px-2">
              {player.isLeader && !roundOver && (
                <>
                  <LetterRandomizer
                    letter={atama}
                    active={atamaActive}
                    onFinished={() => {
                      setOshiriActive(true);
                    }}
                  />
                  <LetterBoxInput
                    focus={focus}
                    text={playerInput}
                    setText={setPlayerInput}
                    disabled={gameState.roundOver}
                  />
                  <LetterRandomizer letter={oshiri} active={oshiriActive} />
                </>
              )}
              {!player.isLeader && !roundOver && (
                <>
                  <LetterRandomizer
                    letter={atama}
                    active={atamaActive}
                    onFinished={() => {
                      setOshiriActive(true);
                    }}
                  />
                  <LetterBoxView text={playerInput.toUpperCase()} />
                  <LetterRandomizer letter={oshiri} active={oshiriActive} />
                </>
              )}
              {roundOver && (
                <LetterBoxFinished
                  text={finishedWord}
                  wordAccepted={wordAccepted}
                />
              )}
            </div>
            <div className="flex gap-1 sm:gap-2 text-white flex-wrap justify-center max-w-full">
              {roundOver && <span className="w-full text-center text-sm sm:text-base">top words:</span>}
              {roundOver &&
                topWords.map((value, key) => (
                  <p key={key} className="text-white text-xs sm:text-sm px-1">
                    {value}
                  </p>
                ))}
            </div>
            {roundOver && player.isLeader ? (
              <Button onClick={handleStartRound} className="w-full max-w-xs py-3">Next round</Button>
            ) : (
              <p className="text-white text-center text-xs sm:text-sm px-4">
                {roundOver &&
                  "Waiting for " +
                    gameState.playerQueue[0].username +
                    " to start next round"}
              </p>
            )}
            
            {/* Mobile players list */}
            <div className="sm:hidden flex flex-col gap-2 w-full max-w-md">
              <h3 className="text-white text-sm font-semibold text-center">Players</h3>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {gameState.playerQueue.map((value, key) => (
                  <PlayerCard
                    key={key}
                    username={value.username}
                    score={value.score}
                    isLeader={value.isLeader}
                    isCurrentPlayer={true}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex grow flex-col justify-center items-center bg-[#212121] rounded-xl gap-4 px-4 py-6 relative">
            {/* Menu Button for Lobby */}
            <button 
              onClick={() => setGameMenuOpen(true)} 
              className="absolute top-2 right-2 sm:top-4 sm:right-4 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-[#3F3F3F] hover:bg-[#4F4F4F] active:scale-95 transition-transform text-white"
            >
              <HiMenu className="text-xl sm:text-2xl" />
            </button>

            <h1 className="text-white text-xl sm:text-2xl md:text-3xl font-bold text-center">Room: {gameId}</h1>
            {player.isLeader ? (
              <>
                <div className="flex flex-col items-center gap-3 w-full max-w-xs">
                  <Button onClick={handleStartGame} className="w-full py-3">Start Game</Button>
                  <button 
                    onClick={() => setGamePropsOpen(true)} 
                    className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-full bg-purple-700 hover:bg-purple-800 active:scale-95 transition-transform text-white"
                  >
                    <FaCog className="text-xl" />
                  </button>
                  <GameOptionsDialog
                    currentMaxRounds={gameState.maxRounds}
                    currentRoundTime={gameState.roundTime}
                    currentMinWordCombos={gameState.wordCombinations}
                    isOpen={gamePropsOpen}
                    setIsOpen={setGamePropsOpen}
                    sendEvent={sendEvent}
                  />
                </div>
              </>
            ) : (
              <p className="text-white text-center text-sm sm:text-base px-4">
                Waiting for {gameState.playerQueue[0].username} to start the
                game
              </p>
            )}
            
            {/* Mobile players list for lobby */}
            <div className="sm:hidden flex flex-col gap-2 w-full max-w-md mt-4">
              <h3 className="text-white text-sm font-semibold text-center">Players in Lobby</h3>
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                {gameState.playerQueue.map((value, key) => (
                  <PlayerCard
                    key={key}
                    username={value.username}
                    score={value.score}
                    isLeader={value.isLeader}
                    isCurrentPlayer={true}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        {!gameOver && (
          <div className="hidden sm:flex flex-col gap-2 h-full bg-[#161616] rounded-xl px-2 py-4">
            <h3 className="text-white text-sm font-semibold text-center">Players</h3>
            <div className="flex flex-col gap-2 overflow-y-auto flex-1">
              {gameState.playerQueue.map((value, key) => (
                <PlayerCard
                  key={key}
                  username={value.username}
                  score={value.score}
                  isLeader={value.isLeader}
                  isCurrentPlayer={true}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      <Footer />
      
      {/* Game Menu */}
      <GameMenu
        isOpen={gameMenuOpen}
        setIsOpen={setGameMenuOpen}
        isLeader={player?.isLeader || false}
        gameStarted={gameState?.started || false}
        onCancelGame={handleCancelGame}
        onLeaveRoom={handleLeaveRoom}
      />
    </div>
  );
}
