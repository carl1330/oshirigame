import Avatar from "boring-avatars";
import { FaCrown } from "react-icons/fa";

interface PlayerCardProps {
  username: string;
  score: number;
  isCurrentPlayer: boolean;
  isLeader: boolean;
  gameStarted: boolean;
}

export default function PlayerCard(props: PlayerCardProps) {
  return (
    <div
      className={`flex flex-col w-56 bg-[#212121] text-white p-4 rounded-xl ${
        props.isCurrentPlayer && "outline-1 outline-purple-600"
      }`}
    >
      <div className="flex gap-3">
        <Avatar variant="beam" size={45} name={props.username} />
        <div>
          <p className="flex items-center gap-2">
            {props.username} {props.isLeader && <FaCrown />}
          </p>
          <p>{`Score: ${props.score}`}</p>
        </div>
      </div>
    </div>
  );
}
