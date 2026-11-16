import PlayerAvatar from "./PlayerAvatar";

interface PlayerCardProps {
  username: string;
  avatar?: string;
  score: number;
  /** It's this player's turn right now (glow + "playing" badge) */
  isCurrentPlayer: boolean;
  /** Stable room admin (crown) — controls options and round flow */
  isHost: boolean;
}

export default function PlayerCard(props: PlayerCardProps) {
  return (
    <div
      className={`flex flex-col w-full sm:w-56 text-white p-3 sm:p-4 rounded-xl border transition-colors ${
        props.isCurrentPlayer
          ? "bg-gradient-to-b from-violet-600/40 to-violet-900/30 border-violet-400/60 animate-glow"
          : "bg-surface-raised border-white/5"
      }`}
    >
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative flex-shrink-0">
          <PlayerAvatar username={props.username} avatar={props.avatar} size={35} />
          {props.isHost && (
            <span
              className="absolute -top-2 -right-1 text-lg drop-shadow"
              title="Room host"
            >
              👑
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-sm sm:text-base truncate">
            {props.username}
          </p>
          <p className="text-xs sm:text-sm text-white/60">
            {props.score} pts
            {props.isCurrentPlayer && (
              <span className="ml-2 text-violet-300 font-semibold">
                ● playing
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
