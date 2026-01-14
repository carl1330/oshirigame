import { useEffect, useState } from "react";
import Confetti from "react-confetti";
import Avatar from "boring-avatars";
import Button from "./Button";

export interface PlayerRanking {
  username: string;
  score: number;
  rank: number;
}

interface WinnerScreenProps {
  winners: PlayerRanking[];
  isLeader?: boolean;
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

  // Get top 3 players for podium
  const topThree = props.winners.slice(0, 3);
  const first = topThree.find((w) => w.rank === 1);
  const second = topThree.find((w) => w.rank === 2);
  const third = topThree.find((w) => w.rank === 3);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-6 px-4 py-6 relative overflow-y-auto">
      {showConfetti && (
        <Confetti
          width={windowSize.width}
          height={windowSize.height}
          recycle={false}
          numberOfPieces={500}
          gravity={0.3}
        />
      )}
      <h1 className="text-white text-3xl sm:text-4xl md:text-5xl font-bold text-center mb-4">
        Game Over!
      </h1>

      {/* Podium Section */}
      <div className="w-full max-w-4xl">
        <div className="flex items-end justify-center gap-2 sm:gap-4 mb-8">
          {/* 2nd Place - Left */}
          {second && (
            <div className="flex flex-col items-center">
              <div className="mb-2 sm:mb-3">
                <div className="relative">
                  <Avatar
                    variant="beam"
                    size={window.innerWidth < 640 ? 60 : 80}
                    name={second.username}
                  />
                  <div className="absolute -bottom-1 -right-1 bg-gray-400 rounded-full w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-xl sm:text-2xl shadow-lg">
                    🥈
                  </div>
                </div>
              </div>
              <div className="text-center mb-2">
                <p className="text-white font-bold text-sm sm:text-base truncate max-w-[100px] sm:max-w-[120px]">
                  {second.username}
                </p>
                <p className="text-white/80 text-xs sm:text-sm">{second.score} pts</p>
              </div>
              <div className="w-24 sm:w-32 h-24 sm:h-32 bg-gradient-to-t from-gray-500 to-gray-400 rounded-t-lg flex flex-col items-center justify-start pt-2 sm:pt-3 shadow-xl">
                <span className="text-white font-bold text-xl sm:text-3xl">2</span>
                <span className="text-white/80 text-xs sm:text-sm">2nd</span>
              </div>
            </div>
          )}

          {/* 1st Place - Center (Taller) */}
          {first && (
            <div className="flex flex-col items-center">
              <div className="mb-2 sm:mb-3">
                <div className="relative">
                  <Avatar
                    variant="beam"
                    size={window.innerWidth < 640 ? 80 : 100}
                    name={first.username}
                  />
                  <div className="absolute -bottom-1 -right-1 bg-yellow-400 rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-2xl sm:text-3xl shadow-lg">
                    🥇
                  </div>
                </div>
              </div>
              <div className="text-center mb-2">
                <p className="text-white font-bold text-base sm:text-lg truncate max-w-[120px] sm:max-w-[140px]">
                  {first.username}
                </p>
                <p className="text-yellow-400 font-bold text-sm sm:text-base">
                  {first.score} pts
                </p>
              </div>
              <div className="w-24 sm:w-32 h-32 sm:h-40 bg-gradient-to-t from-yellow-600 to-yellow-500 rounded-t-lg flex flex-col items-center justify-start pt-2 sm:pt-3 shadow-xl">
                <span className="text-white font-bold text-2xl sm:text-4xl">1</span>
                <span className="text-white/90 text-xs sm:text-sm">1st</span>
              </div>
            </div>
          )}

          {/* 3rd Place - Right */}
          {third && (
            <div className="flex flex-col items-center">
              <div className="mb-2 sm:mb-3">
                <div className="relative">
                  <Avatar
                    variant="beam"
                    size={window.innerWidth < 640 ? 60 : 80}
                    name={third.username}
                  />
                  <div className="absolute -bottom-1 -right-1 bg-orange-600 rounded-full w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-xl sm:text-2xl shadow-lg">
                    🥉
                  </div>
                </div>
              </div>
              <div className="text-center mb-2">
                <p className="text-white font-bold text-sm sm:text-base truncate max-w-[100px] sm:max-w-[120px]">
                  {third.username}
                </p>
                <p className="text-white/80 text-xs sm:text-sm">{third.score} pts</p>
              </div>
              <div className="w-24 sm:w-32 h-20 sm:h-28 bg-gradient-to-t from-orange-800 to-orange-700 rounded-t-lg flex flex-col items-center justify-start pt-2 sm:pt-3 shadow-xl">
                <span className="text-white font-bold text-xl sm:text-3xl">3</span>
                <span className="text-white/80 text-xs sm:text-sm">3rd</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Other Players */}
      {props.winners.length > 3 && (
        <div className="w-full max-w-2xl mt-4">
          <h2 className="text-white text-lg sm:text-xl font-semibold mb-3 text-center">
            Other Players
          </h2>
          <div className="space-y-2 max-h-40 sm:max-h-48 overflow-y-auto">
            {props.winners.slice(3).map((winner, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-3 px-4 py-2 rounded-lg bg-[#3F3F3F]"
              >
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  <Avatar
                    variant="beam"
                    size={window.innerWidth < 640 ? 32 : 40}
                    name={winner.username}
                  />
                  <span className="text-white/60 text-sm sm:text-base font-semibold flex-shrink-0">
                    #{winner.rank}
                  </span>
                  <p className="text-white text-sm sm:text-base truncate">
                    {winner.username}
                  </p>
                </div>
                <p className="text-white text-base sm:text-lg font-bold flex-shrink-0">
                  {winner.score}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md mt-4">
        {props.isLeader && props.onBackToLobby ? (
          <Button onClick={props.onBackToLobby} className="flex-1 py-3">
            Back to Lobby
          </Button>
        ) : (
          <p className="text-white text-center text-sm sm:text-base px-4">
            Waiting for leader to start new game...
          </p>
        )}
      </div>
    </div>
  );
}
