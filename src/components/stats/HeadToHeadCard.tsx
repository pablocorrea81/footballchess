"use client";

import { useState, useEffect } from "react";
import type { HeadToHeadStats } from "@/lib/stats/statsHelpers";

type HeadToHeadCardProps = {
  currentPlayerId: string;
};

export function HeadToHeadCard({ currentPlayerId }: HeadToHeadCardProps) {
  const [opponentId, setOpponentId] = useState("");
  const [stats, setStats] = useState<HeadToHeadStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!opponentId.trim() || opponentId === currentPlayerId) {
      setError("Ingresa un ID de jugador válido diferente a ti");
      setStats(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        `/api/stats/head-to-head?player1=${currentPlayerId}&player2=${opponentId}`,
      );
      const data = (await response.json()) as {
        ok?: boolean;
        stats?: HeadToHeadStats;
        error?: string;
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Error al cargar estadísticas");
      }

      setStats(data.stats || null);
    } catch (err) {
      console.error("[HeadToHeadCard] Error:", err);
      setError(err instanceof Error ? err.message : "Error desconocido");
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl">
      <h3 className="mb-4 text-lg font-semibold text-white">Head-to-Head</h3>

      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm text-emerald-100">
            ID del oponente:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={opponentId}
              onChange={(e) => setOpponentId(e.target.value)}
              placeholder="UUID del jugador..."
              className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-emerald-100/50 focus:border-emerald-400 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleSearch();
                }
              }}
            />
            <button
              onClick={handleSearch}
              disabled={loading || !opponentId.trim()}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "..." : "Buscar"}
            </button>
          </div>
          <p className="mt-2 text-xs text-emerald-100/60">
            Ingresa el ID del otro jugador para ver las estadísticas de enfrentamientos.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/20 p-3 text-sm text-red-200">{error}</div>
        )}

        {stats && (
          <div className="space-y-3">
            <div className="rounded-lg bg-emerald-500/20 p-4">
              <div className="text-sm text-emerald-200">Partidas jugadas</div>
              <div className="mt-1 text-2xl font-bold text-white">{stats.totalGames}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-blue-500/20 p-3">
                <div className="text-xs text-blue-200">
                  {stats.player1Id === currentPlayerId ? "Tú" : stats.player1Username}
                </div>
                <div className="mt-1 text-xl font-bold text-white">{stats.player1Wins}</div>
                <div className="mt-1 text-xs text-blue-100/60">
                  {stats.totalGames > 0
                    ? `${Math.round((stats.player1Wins / stats.totalGames) * 10000) / 100}%`
                    : "0%"}
                </div>
              </div>

              <div className="rounded-lg bg-purple-500/20 p-3">
                <div className="text-xs text-purple-200">
                  {stats.player2Id === currentPlayerId ? "Tú" : stats.player2Username}
                </div>
                <div className="mt-1 text-xl font-bold text-white">{stats.player2Wins}</div>
                <div className="mt-1 text-xs text-purple-100/60">
                  {stats.totalGames > 0
                    ? `${Math.round((stats.player2Wins / stats.totalGames) * 10000) / 100}%`
                    : "0%"}
                </div>
              </div>
            </div>
          </div>
        )}

        {!stats && !error && !loading && (
          <div className="rounded-lg bg-white/5 p-4 text-center text-sm text-emerald-100/60">
            Busca un jugador para ver las estadísticas de enfrentamientos.
          </div>
        )}
      </div>
    </div>
  );
}

