import { useNavigate, useParams } from "react-router-dom";
import Footer from "../components/Footer";
import React, { useEffect, useState } from "react";
import useWebSocket from "react-use-websocket";
import { getWsConfig } from "../misc/server.conf";
import { useLocalStorage } from "usehooks-ts";
import PlayerCard from "../components/PlayerCard";
import Button from "../components/Button";
import { ToastContainer, toast } from "react-toastify";
import LetterBoxInput from "../components/LetterBoxInput";
import LetterBoxView from "../components/LetterBoxView";
import LetterRandomizer from "../components/LetterRandomizer";

export type Event = {
  type: string;
  data: Message;
};

export type GameState = {
  started: boolean;
  time: number;
  round: number;
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

interface NewClientEvent {
  token: string;
}

interface RoundOverResponse {
  topWords: string[];
  gameState: GameState;
}

export type Message =
  | GameState
  | JoinGameMessage
  | NewClientEvent
  | PlayerInputMessage
  | RoundOverResponse
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

export default function Room() {
  const { gameId } = useParams();
  const [token, setToken] = useLocalStorage("token", "");
  const [username, setUsername] = useLocalStorage("username", "");
  const [gameState, setGameState] = useState<GameState>();
  const [topWords, setTopWords] = useState<string[]>([]);
  const [player, setPlayer] = useState<Player>();
  const [atamaActive, setAtamaActive] = useState(false);
  const [oshiriActive, setOshiriActive] = useState(false);
  const [playerInput, setPlayerInput] = useState("");
  const navigate = useNavigate();
  const apiConfig = getWsConfig();

  const { sendMessage, lastMessage } = useWebSocket(
    apiConfig + `?token=${token}`,
    {
      shouldReconnect: () => true,
      reconnectInterval: 1000,
      reconnectAttempts: 5,
      onReconnectStop: () => {
        toast.info(`Disconnected from gameroom ${gameId}`);
        navigate("/");
      },
    }
  );

  function sendEvent(eventType: string, payload: Message | null) {
    const event: Event = {
      type: eventType,
      data: payload,
    };
    sendMessage(JSON.stringify(event));
  }

  const notify = () => toast("Wow so easy!");

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
        if (gameId != undefined && username != "")
          sendEvent(EventJoinGame, {
            username: username,
            id: gameId,
            token: token,
          });
        break;
      }
      case EventGameStart:
        console.log("game start");
        setGameState(event.data as GameState);
        setAtamaActive(true);
        break;
      case EventGameState:
        console.log("game state");
        setGameState(event.data as GameState);
        break;
      case EventPlayerState:
        console.log("player state");
        setPlayer(event.data as Player);
        break;
      case EventRoundStart: {
        console.log("round start");
        const gameState = event.data as GameState;
        setGameState(gameState);
        break;
      }
      case EventNextRound:
        if (player) {
          if (!player.isLeader) {
            setAtamaActive(true);
          }
        }
        break;
      case EventRoundFinished: {
        console.log("round finished");
        console.log(event.data);
        const gameStateFinished = event.data as RoundOverResponse;
        setTopWords(gameStateFinished.topWords);
        setGameState(gameStateFinished.gameState);
        break;
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
            <div className="flex flex-col gap-2 justify-center items-center h-full w-full rounded-xl bg-[#212121]">
              <h1 className="text-white text-3xl font-bold">Join room</h1>
              <form className="flex flex-col gap-4">
                <input
                  className="text-white bg-[#3F3F3F] px-6 py-4 rounded-full text-center"
                  placeholder="Enter your username"
                  onChange={(e) => setInputUsername(e.target.value)}
                ></input>
                <Button onClick={handleJoinRoom}>Join room</Button>
              </form>
            </div>
          </div>
          <Footer />
          <ToastContainer />
        </div>
      </div>
    );
  }

  if (!gameState || !player) {
    return (
      <div className="flex flex-col h-screen p-2 gap-2">
        <div className="flex grow w-full gap-2">
          <div className="flex grow flex-col justify-center items-center bg-[#212121] rounded-xl gap-4">
            <h1 className="text-white text-3xl font-bold">Loading..</h1>
          </div>
          <div className="flex flex-col gap-2 h-full justify-center items-center bg-[#161616] rounded-xl"></div>
        </div>
        <Footer />
        <ToastContainer />
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
      sendEvent(EventNextRound, null);
    }
  }

  return (
    <div className="flex flex-col h-screen p-2 gap-2">
      <div className="flex grow w-full gap-2">
        {gameState.started ? (
          <div className="flex grow flex-col justify-center items-center bg-[#212121] rounded-xl gap-4">
            <h1 className="text-white text-3xl font-bold">
              {gameState.roundOver
                ? "Round Over"
                : "Time left: " + gameState.time}
            </h1>
            <div className="flex gap-2">
              {player.isLeader ? (
                <>
                  <LetterRandomizer
                    letter={gameState.atama}
                    active={atamaActive}
                    setActive={setAtamaActive}
                    onFinished={() => {
                      setOshiriActive(true);
                    }}
                  />
                  <LetterBoxInput
                    text={playerInput}
                    setText={setPlayerInput}
                    disabled={gameState.roundOver}
                  />
                  <LetterRandomizer
                    letter={gameState.oshiri}
                    active={oshiriActive}
                    setActive={setOshiriActive}
                    onFinished={() => {
                      sendEvent(EventRoundStart, { token: token, id: gameId });
                    }}
                  />
                </>
              ) : (
                <>
                  <LetterRandomizer
                    letter={gameState.atama}
                    active={atamaActive}
                    setActive={setAtamaActive}
                    onFinished={() => {
                      setOshiriActive(true);
                    }}
                  />
                  <LetterBoxView text={gameState.input.toUpperCase()} />
                  <LetterRandomizer
                    letter={gameState.oshiri}
                    active={oshiriActive}
                    setActive={setOshiriActive}
                  />
                </>
              )}
            </div>
            <div className="flex gap-2 text-white">
              {gameState.roundOver && "top words: "}
              {gameState.roundOver &&
                topWords.map((value, key) => (
                  <p key={key} className="text-white">
                    {value}
                  </p>
                ))}
            </div>
            {gameState.roundOver && player.isLeader ? (
              <Button onClick={handleStartRound}>Next round</Button>
            ) : (
              <p className="text-white">
                {gameState.roundOver &&
                  "Waiting for " +
                    gameState.playerQueue[0].username +
                    " to start next round"}
              </p>
            )}
          </div>
        ) : (
          <div className="flex grow flex-col justify-center items-center bg-[#212121] rounded-xl gap-4">
            <h1 onClick={notify} className="text-white text-3xl font-bold">
              Room: {gameId}
            </h1>
            {player.isLeader ? (
              <Button onClick={handleStartGame}>Start Game</Button>
            ) : (
              <p className="text-white">
                Waiting for {gameState.playerQueue[0].username} to start the
                game
              </p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2 h-full justify-center items-center bg-[#161616] rounded-xl">
          {gameState.playerQueue.map((value, key) => (
            <PlayerCard
              key={key}
              username={value.username}
              score={value.score}
              isLeader={value.isLeader}
              isCurrentPlayer={true}
              gameStarted={gameState.started}
            />
          ))}
        </div>
      </div>
      <Footer />
      <ToastContainer />
    </div>
  );
}
