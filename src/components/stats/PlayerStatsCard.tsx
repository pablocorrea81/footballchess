"use client";

import { useState, useEffect } from "react";
import type { PlayerStats } from "@/lib/stats/statsHelpers";

type PlayerStatsCardProps = {
  playerId: string;
};

export function PlayerStatsCard({ playerId }: PlayerStatsCardProps) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/stats/player/${playerId}`);
        const data = (await response.json()) as { ok?: boolean; stats?: PlayerStats; error?: string };

        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Error al cargar estadísticas");
        }

        setStats(data.stats || null);
        setError(null);
      } catch (err) {
        console.error("[PlayerStatsCard] Error:", err);
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    };

    void fetchStats();
  }, [playerId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-white">Mis Estadísticas</h3>
        <div className="text-center text-emerald-100/60">Cargando...</div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-white">Mis Estadísticas</h3>
        <div className="text-center text-red-400">{error || "No se pudieron cargar las estadísticas"}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl">
      <h3 className="mb-4 text-lg font-semibold text-white">Mis Estadísticas</h3>

      <div className="space-y-4">
        {/* Total Stats */}
        <div className="rounded-lg bg-emerald-500/20 p-4">
          <div className="text-sm text-emerald-200">Total</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{stats.totalWins}</span>
            <span className="text-sm text-emerald-100/80">
              / {stats.totalGames} partidas
            </span>
          </div>
          <div className="mt-1 text-xs text-emerald-100/60">
            {stats.winRate.toFixed(1)}% de victorias
          </div>
        </div>

        {/* Multiplayer Stats */}
        {stats.multiplayerGames > 0 && (
          <div className="rounded-lg bg-blue-500/20 p-4">
            <div className="text-sm text-blue-200">👥 Multijugador</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{stats.multiplayerWins}</span>
              <span className="text-sm text-blue-100/80">
                / {stats.multiplayerGames} partidas
              </span>
            </div>
            <div className="mt-1 text-xs text-blue-100/60">
              {stats.multiplayerGames > 0
                ? `${Math.round((stats.multiplayerWins / stats.multiplayerGames) * 10000) / 100}% de victorias`
                : "0%"}
            </div>
          </div>
        )}

        {/* Hard Bot Stats */}
        {stats.hardBotGames > 0 && (
          <div className="rounded-lg bg-purple-500/20 p-4">
            <div className="text-sm text-purple-200">🤖 vs IA Difícil</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{stats.hardBotWins}</span>
              <span className="text-sm text-purple-100/80">
                / {stats.hardBotGames} partidas
              </span>
            </div>
            <div className="mt-1 text-xs text-purple-100/60">
              {stats.hardBotGames > 0
                ? `${Math.round((stats.hardBotWins / stats.hardBotGames) * 10000) / 100}% de victorias`
                : "0%"}
            </div>
          </div>
        )}

        {/* All Bot Stats */}
        {stats.botGames > 0 && (
          <div className="rounded-lg bg-gray-500/20 p-4">
            <div className="text-sm text-gray-200">🤖 vs IA (Todas)</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold text-white">{stats.botWins}</span>
              <span className="text-sm text-gray-100/80">
                / {stats.botGames} partidas
              </span>
            </div>
            <div className="mt-1 text-xs text-gray-100/60">
              {stats.botGames > 0
                ? `${Math.round((stats.botWins / stats.botGames) * 10000) / 100}% de victorias`
                : "0%"}
            </div>
          </div>
        )}

        {stats.totalGames === 0 && (
          <div className="rounded-lg bg-white/5 p-4 text-center text-emerald-100/60">
            Aún no has jugado partidas. ¡Crea una partida para empezar!
          </div>
        )}
      </div>
    </div>
  );
}

