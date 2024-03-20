import { useNavigate, useParams } from "react-router-dom";
import Footer from "../components/Footer";
import React, { useEffect, useState } from "react";
import useWebSocket from "react-use-websocket";
import { getWsConfig } from "../misc/server.conf";
import { useLocalStorage } from "usehooks-ts";
import PlayerCard from "../components/PlayerCard";
import Button from "../components/Button";
import { ToastContainer, toast } from "react-toastify";

export type Event = {
  type: string;
  data: Message;
};

export type GameState = {
  started: boolean;
  playerQueue: Player[];
  time: number;
  round: number;
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

interface NewClientEvent {
  token: string;
}

export type Message = GameState | JoinGameMessage | NewClientEvent | null;

export const EventJoinGame = "JOIN_GAME";
export const EventPlayerState = "PLAYER_STATE";
export const EventRoomNotFound = "ROOM_NOT_FOUND";
export const EventNewClient = "NEW_CLIENT";
export const EventGameStart = "START_GAME";
export const EventGameState = "GAME_STATE";

export default function Room() {
  const { gameId } = useParams();
  const [token, setToken] = useLocalStorage("token", "");
  const [username, setUsername] = useLocalStorage("username", "");
  const [gameState, setGameState] = useState<GameState>();
  const [player, setPlayer] = useState<Player>();
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
      case EventGameState:
        console.log("game state");
        setGameState(event.data as GameState);
        break;
      case EventPlayerState:
        console.log("player state");
        setPlayer(event.data as Player);
        break;
    }
  }, [lastMessage]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="flex flex-col h-screen p-2 gap-2">
      <div className="flex grow w-full gap-2">
        {gameState.started ? (
          <div className="flex grow flex-col justify-center items-center bg-[#212121] rounded-xl gap-4">
            <h1 className="text-white text-3xl font-bold">
              Time left: {gameState.time}
            </h1>
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
