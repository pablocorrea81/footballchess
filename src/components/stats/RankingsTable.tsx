"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { RankingsEntry } from "@/lib/stats/statsHelpers";

type RankingsTableProps = {
  rankings: RankingsEntry[];
  type: "global" | "hard-bot" | "multiplayer";
  currentPlayerId: string;
};

export function RankingsTable({ rankings, type, currentPlayerId }: RankingsTableProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter rankings by search query
  const filteredRankings = rankings.filter((entry) =>
    entry.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRankingLabel = (index: number): string => {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return `#${index + 1}`;
  };

  if (rankings.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center text-emerald-100">
        <p className="text-lg">No hay estadísticas disponibles aún.</p>
        <p className="mt-2 text-sm text-emerald-100/60">
          ¡Juega partidas para aparecer en el ranking!
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">
          {type === "global"
            ? "🏆 Ranking Global"
            : type === "multiplayer"
              ? "👥 Ranking Multijugador"
              : "🤖 Ranking vs IA Difícil"}
        </h2>
        <input
          type="text"
          placeholder="Buscar jugador..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-emerald-100/50 focus:border-emerald-400 focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 text-left text-sm text-emerald-200">
              <th className="pb-3">Pos.</th>
              <th className="pb-3">Jugador</th>
              <th className="pb-3 text-right">Victorias</th>
              <th className="pb-3 text-right">Partidas</th>
              <th className="pb-3 text-right">% Victoria</th>
              {type === "hard-bot" && (
                <th className="pb-3 text-right">Vs IA Difícil</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filteredRankings.map((entry, index) => {
              const isCurrentPlayer = entry.playerId === currentPlayerId;
              const rank = rankings.indexOf(entry);

              return (
                <tr
                  key={entry.playerId}
                  className={`border-b border-white/5 transition ${
                    isCurrentPlayer
                      ? "bg-emerald-500/20 font-semibold text-white"
                      : "text-emerald-100 hover:bg-white/5"
                  }`}
                >
                  <td className="py-3 text-sm font-medium">
                    {getRankingLabel(rank)}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      {entry.avatarUrl ? (
                        <img
                          src={entry.avatarUrl}
                          alt={entry.username || "Jugador"}
                          className="h-8 w-8 rounded-full object-cover border-2 border-emerald-400/50"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-emerald-400/50 bg-emerald-600 text-xs font-bold text-white">
                          {entry.username?.charAt(0).toUpperCase() ?? "J"}
                        </div>
                      )}
                      <Link
                        href={`/stats/player/${entry.playerId}`}
                        className="hover:text-emerald-200 hover:underline"
                      >
                        {entry.username || "Jugador sin nombre"}
                      </Link>
                      {isCurrentPlayer && (
                        <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs text-white">
                          Tú
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 text-right text-sm font-medium">
                    {entry.totalWins}
                  </td>
                  <td className="py-3 text-right text-sm text-emerald-100/80">
                    {entry.totalGames}
                  </td>
                  <td className="py-3 text-right text-sm font-medium">
                    {entry.winRate.toFixed(1)}%
                  </td>
                  {type === "hard-bot" && (
                    <td className="py-3 text-right text-sm text-emerald-100/80">
                      {entry.hardBotWins}/{entry.hardBotGames}
                    </td>
                  )}
                </tr>
              );
            })}
            {filteredRankings.length === 0 && (
              <tr>
                <td colSpan={type === "hard-bot" ? 6 : 5} className="py-8 text-center text-emerald-100/60">
                  No se encontraron jugadores con ese nombre.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

