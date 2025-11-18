"use client";

import { useEffect, useState } from "react";
import type { PlayerTrophy } from "@/lib/trophies/trophyHelpers";

type TrophyStats = {
  totalTrophies: number;
  byCategory: Record<string, number>;
  byRarity: Record<string, number>;
  recentTrophies: PlayerTrophy[];
};

const rarityColors: Record<string, string> = {
  common: "bg-white/10 text-white border-white/20 hover:bg-white/15",
  rare: "bg-blue-500/20 text-blue-100 border-blue-400/40 hover:bg-blue-500/30",
  epic: "bg-purple-500/20 text-purple-100 border-purple-400/40 hover:bg-purple-500/30",
  legendary: "bg-yellow-500/20 text-yellow-100 border-yellow-400/50 hover:bg-yellow-500/30 shadow-lg shadow-yellow-500/20",
};

const categoryLabels: Record<string, string> = {
  victory: "Victorias",
  milestone: "Hitos",
  special: "Especiales",
  streak: "Rachas",
};

export function TrophiesDisplay() {
  const [trophies, setTrophies] = useState<PlayerTrophy[]>([]);
  const [stats, setStats] = useState<TrophyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const fetchTrophies = async () => {
      try {
        const [trophiesRes, statsRes] = await Promise.all([
          fetch("/api/trophies"),
          fetch("/api/trophies?stats=true"),
        ]);

        if (trophiesRes.ok) {
          const { trophies: trophiesData } = await trophiesRes.json();
          setTrophies(trophiesData || []);
        }

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
      } catch (error) {
        console.error("[TrophiesDisplay] Error fetching trophies:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrophies();
  }, []);

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg text-white">
        <div className="text-sm text-emerald-100/80">Cargando trofeos...</div>
      </div>
    );
  }

  if (!stats || stats.totalTrophies === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg text-white">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">🏆</span>
          <h3 className="text-lg font-semibold">Trofeos</h3>
        </div>
        <p className="text-sm text-emerald-100/80">
          Aún no has desbloqueado ningún trofeo. ¡Juega partidas para ganarlos!
        </p>
      </div>
    );
  }

  const displayedTrophies = showAll ? trophies : stats.recentTrophies;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg text-white">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏆</span>
          <h3 className="text-lg font-semibold">
            Trofeos ({stats.totalTrophies})
          </h3>
        </div>
        {trophies.length > 5 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-emerald-200 hover:text-emerald-100 underline transition"
          >
            {showAll ? "Ver menos" : "Ver todos"}
          </button>
        )}
      </div>

      {/* Trophy Statistics */}
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        {Object.entries(stats.byCategory).map(([category, count]) => (
          <span
            key={category}
            className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-100 border border-emerald-400/30"
          >
            {categoryLabels[category] || category}: {count}
          </span>
        ))}
      </div>

      {/* Trophy Grid */}
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
        {displayedTrophies.map((playerTrophy) => {
          const trophy = playerTrophy.trophy;
          return (
            <div
              key={playerTrophy.id}
              className={`relative group cursor-help rounded-xl border-2 p-3 text-center transition-all duration-200 hover:scale-110 hover:shadow-xl ${rarityColors[trophy.rarity] || rarityColors.common}`}
              title={`${trophy.name}: ${trophy.description}`}
            >
              <div className="text-3xl mb-1 drop-shadow-lg">{trophy.icon}</div>
              <div className="text-xs font-semibold truncate leading-tight">
                {trophy.name}
              </div>
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10 w-56 pointer-events-none">
                <div className="bg-gray-900/95 backdrop-blur-sm text-white text-xs rounded-lg py-2 px-3 shadow-2xl border border-white/10">
                  <div className="font-bold mb-1 text-emerald-300">{trophy.name}</div>
                  <div className="text-gray-200 mb-2">{trophy.description}</div>
                  <div className="text-gray-400 text-xs border-t border-white/10 pt-2">
                    Desbloqueado: {new Date(playerTrophy.unlocked_at).toLocaleDateString("es-ES", { 
                      day: "numeric", 
                      month: "short", 
                      year: "numeric" 
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show locked trophies placeholder */}
      {stats.totalTrophies < 20 && (
        <div className="mt-4 text-xs text-emerald-100/60 text-center">
          {20 - stats.totalTrophies} trofeos más por desbloquear
        </div>
      )}
    </div>
  );
}

