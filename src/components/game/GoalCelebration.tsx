"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type GoalCelebrationProps = {
  onComplete: () => void;
  playerName: string;
};

export function GoalCelebration({ onComplete, playerName }: GoalCelebrationProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [shouldRender, setShouldRender] = useState(true);
  const timersRef = useRef<{ hideTimer?: NodeJS.Timeout; completeTimer?: NodeJS.Timeout }>({});
  const onCompleteRef = useRef(onComplete);

  // Update onComplete ref when it changes
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const handleClose = useCallback(() => {
    // Clear any existing timers
    if (timersRef.current.hideTimer) {
      clearTimeout(timersRef.current.hideTimer);
      delete timersRef.current.hideTimer;
    }
    if (timersRef.current.completeTimer) {
      clearTimeout(timersRef.current.completeTimer);
      delete timersRef.current.completeTimer;
    }

    // Immediately hide and close
    setIsVisible(false);
    const closeTimer = setTimeout(() => {
      setShouldRender(false);
      onCompleteRef.current();
    }, 300); // Short fade-out when clicked
    
    // Store close timer in ref for cleanup
    timersRef.current.completeTimer = closeTimer as unknown as NodeJS.Timeout;
  }, []);

  useEffect(() => {
    // Automatically hide celebration after 3 seconds
    timersRef.current.hideTimer = setTimeout(() => {
      setIsVisible(false);
    }, 3000);

    // Unmount component and call onComplete after fade-out (3 seconds + 500ms)
    timersRef.current.completeTimer = setTimeout(() => {
      setShouldRender(false);
      onCompleteRef.current();
    }, 3500);

    return () => {
      if (timersRef.current.hideTimer) {
        clearTimeout(timersRef.current.hideTimer);
        delete timersRef.current.hideTimer;
      }
      if (timersRef.current.completeTimer) {
        clearTimeout(timersRef.current.completeTimer);
        delete timersRef.current.completeTimer;
      }
    };
  }, []); // Only run once on mount

  if (!shouldRender) return null;

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      onClick={handleClose}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClose();
        }
      }}
      aria-label="Cerrar animación de gol"
    >
      <div 
        className={`relative flex flex-col items-center justify-center gap-8 p-12 rounded-3xl bg-gradient-to-br from-emerald-600 via-yellow-500 to-emerald-600 shadow-2xl transition-all duration-500 cursor-pointer ${isVisible ? 'opacity-100 scale-100 animate-bounceIn' : 'opacity-0 scale-95'}`}
        onClick={(e) => e.stopPropagation()}
      >
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

        {/* Team name */}
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

