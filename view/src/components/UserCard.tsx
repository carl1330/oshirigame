interface UserCardProps {
  username: string;
  score: number;
}

export default function UserCard(props: UserCardProps) {
  return (
    <div className="flex bg-[#212121] rounded-xl p-2 gap-2">
      <img
        className="w-16 h-16 rounded-full"
        src={`https://api.dicebear.com/7.x/thumbs/svg?seed=${props.username}`}
      />
      <div>
        <h1 className="text-white font-bold">{props.username}</h1>
        <p className="text-white">Score: {props.score}</p>
      </div>
    </div>
  );
}
