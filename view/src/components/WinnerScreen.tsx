import { useEffect, useState } from "react";
import Confetti from "react-confetti";
import Button from "./Button";

export interface PlayerRanking {
  username: string;
  score: number;
  rank: number;
}

interface WinnerScreenProps {
  winners: PlayerRanking[];
  onNewGame?: () => void;
  onBackToLobby?: () => void;
}

export default function WinnerScreen(props: WinnerScreenProps) {
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);

    // Stop confetti after 5 seconds
    const timer = setTimeout(() => {
      setShowConfetti(false);
    }, 5000);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timer);
    };
  }, []);

  const getMedalEmoji = (rank: number) => {
    switch (rank) {
      case 1:
        return "🥇";
      case 2:
        return "🥈";
      case 3:
        return "🥉";
      default:
        return "";
    }
  };

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return "1st Place";
    if (rank === 2) return "2nd Place";
    if (rank === 3) return "3rd Place";
    return `${rank}th Place`;
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-6 px-4 py-6 relative">
      {showConfetti && (
        <Confetti
          width={windowSize.width}
          height={windowSize.height}
          recycle={false}
          numberOfPieces={500}
          gravity={0.3}
        />
      )}
      <h1 className="text-white text-3xl sm:text-4xl md:text-5xl font-bold text-center">
        Game Over!
      </h1>

      <div className="w-full max-w-2xl space-y-3">
        {props.winners.slice(0, 3).map((winner, index) => (
          <div
            key={index}
            className={`
              flex items-center justify-between gap-4 px-6 py-4 rounded-xl
              ${
                winner.rank === 1
                  ? "bg-gradient-to-r from-yellow-600 to-yellow-700 shadow-lg shadow-yellow-900/50"
                  : winner.rank === 2
                  ? "bg-gradient-to-r from-gray-400 to-gray-500 shadow-lg shadow-gray-700/50"
                  : winner.rank === 3
                  ? "bg-gradient-to-r from-orange-700 to-orange-800 shadow-lg shadow-orange-900/50"
                  : "bg-[#3F3F3F]"
              }
            `}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-3xl sm:text-4xl flex-shrink-0">
                {getMedalEmoji(winner.rank)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xl sm:text-2xl font-bold truncate">
                  {winner.username}
                </p>
                <p className="text-white/80 text-sm sm:text-base">
                  {getRankDisplay(winner.rank)}
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-white text-2xl sm:text-3xl font-bold">
                {winner.score}
              </p>
              <p className="text-white/80 text-xs sm:text-sm">points</p>
            </div>
          </div>
        ))}
      </div>

      {props.winners.length > 3 && (
        <div className="w-full max-w-2xl">
          <h2 className="text-white text-xl font-semibold mb-3 text-center">
            Other Players
          </h2>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {props.winners.slice(3).map((winner, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg bg-[#3F3F3F]"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-white/60 text-lg font-semibold w-8 flex-shrink-0">
                    #{winner.rank}
                  </span>
                  <p className="text-white text-lg truncate">{winner.username}</p>
                </div>
                <p className="text-white text-xl font-bold flex-shrink-0">
                  {winner.score}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md mt-4">
        {props.onBackToLobby && (
          <Button onClick={props.onBackToLobby} className="flex-1 py-3">
            Back to Lobby
          </Button>
        )}
      </div>
    </div>
  );
}
