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
  common: "bg-gray-200 text-gray-800 border-gray-300",
  rare: "bg-blue-200 text-blue-800 border-blue-300",
  epic: "bg-purple-200 text-purple-800 border-purple-300",
  legendary: "bg-yellow-200 text-yellow-800 border-yellow-400",
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
      <div className="rounded-xl border border-emerald-200 bg-white/90 p-4 shadow-md">
        <div className="text-sm text-emerald-700">Cargando trofeos...</div>
      </div>
    );
  }

  if (!stats || stats.totalTrophies === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-white/90 p-4 shadow-md">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">🏆</span>
          <h3 className="text-lg font-semibold text-emerald-950">Trofeos</h3>
        </div>
        <p className="text-sm text-emerald-700/70">
          Aún no has desbloqueado ningún trofeo. ¡Juega partidas para ganarlos!
        </p>
      </div>
    );
  }

  const displayedTrophies = showAll ? trophies : stats.recentTrophies;

  return (
    <div className="rounded-xl border border-emerald-200 bg-white/90 p-4 shadow-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏆</span>
          <h3 className="text-lg font-semibold text-emerald-950">
            Trofeos ({stats.totalTrophies})
          </h3>
        </div>
        {trophies.length > 5 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-emerald-600 hover:text-emerald-800 underline"
          >
            {showAll ? "Ver menos" : "Ver todos"}
          </button>
        )}
      </div>

      {/* Trophy Statistics */}
      <div className="flex flex-wrap gap-2 mb-3 text-xs">
        {Object.entries(stats.byCategory).map(([category, count]) => (
          <span
            key={category}
            className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700"
          >
            {categoryLabels[category] || category}: {count}
          </span>
        ))}
      </div>

      {/* Trophy Grid */}
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
        {displayedTrophies.map((playerTrophy) => {
          const trophy = playerTrophy.trophy;
          return (
            <div
              key={playerTrophy.id}
              className={`relative group cursor-help rounded-lg border-2 p-2 text-center transition hover:scale-110 hover:shadow-lg ${rarityColors[trophy.rarity] || rarityColors.common}`}
              title={`${trophy.name}: ${trophy.description}`}
            >
              <div className="text-2xl mb-1">{trophy.icon}</div>
              <div className="text-xs font-semibold truncate">
                {trophy.name}
              </div>
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10 w-48">
                <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 shadow-xl">
                  <div className="font-bold mb-1">{trophy.name}</div>
                  <div className="text-gray-300">{trophy.description}</div>
                  <div className="text-gray-400 mt-1 text-xs">
                    Desbloqueado: {new Date(playerTrophy.unlocked_at).toLocaleDateString("es-ES")}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show locked trophies placeholder */}
      {stats.totalTrophies < 20 && (
        <div className="mt-3 text-xs text-emerald-700/70 text-center">
          {20 - stats.totalTrophies} trofeos más por desbloquear
        </div>
      )}
    </div>
  );
}

