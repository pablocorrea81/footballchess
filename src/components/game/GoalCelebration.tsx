"use client";

import { useEffect, useState } from "react";

type GoalCelebrationProps = {
  onComplete: () => void;
  playerName: string;
};

export function GoalCelebration({ onComplete, playerName }: GoalCelebrationProps) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShow(false);
      setTimeout(onComplete, 500);
    }, 3000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative flex flex-col items-center justify-center gap-8 p-12 rounded-3xl bg-gradient-to-br from-emerald-600 via-yellow-500 to-emerald-600 shadow-2xl animate-bounceIn">
        {/* Animated soccer ball */}
        <div className="relative">
          <div className="text-9xl sm:text-[12rem] md:text-[15rem] animate-spin-slow">
            ⚽
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-6xl sm:text-8xl md:text-9xl font-black text-white animate-pulse drop-shadow-2xl">
              GOAL!
            </div>
          </div>
        </div>

        {/* Player name */}
        <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-white text-center drop-shadow-lg">
          ¡Gol de {playerName}!
        </div>

        {/* Confetti effect */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute text-2xl sm:text-3xl md:text-4xl animate-confetti"
              style={{
                left: `${(i * 5) % 100}%`,
                top: "-10%",
                animationDelay: `${i * 0.1}s`,
                animationDuration: `${2 + Math.random()}s`,
              }}
            >
              {["🎉", "✨", "🎊", "⭐", "🏆"][i % 5]}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

