import Avatar from "boring-avatars";

interface PlayerCardProps {
  username: string;
  score: number;
  isCurrentPlayer: boolean;
  isLeader: boolean;
}

export default function PlayerCard(props: PlayerCardProps) {
  return (
    <div
      className={`flex flex-col w-full sm:w-56 bg-[#212121] text-white p-3 sm:p-4 rounded-xl ${
        props.isLeader && "bg-purple-600"
      }`}
    >
      <div className="flex gap-2 sm:gap-3">
        <div className="relative flex-shrink-0">
          <Avatar variant="beam" size={35} name={props.username} />
          {props.isLeader && (
            <span className="absolute -top-1 -right-1 text-lg">👑</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm sm:text-base truncate">
            {props.username}
            {props.isLeader && <span className="text-yellow-400">👑</span>}
          </p>
          <p className="text-xs sm:text-sm">{`Score: ${props.score}`}</p>
        </div>
      </div>
    </div>
  );
}
