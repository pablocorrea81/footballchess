"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RankingsTable } from "./RankingsTable";
import { PlayerStatsCard } from "./PlayerStatsCard";
import { HeadToHeadCard } from "./HeadToHeadCard";
import type { RankingsEntry } from "@/lib/stats/statsHelpers";

type StatsViewProps = {
  profileId: string;
  initialGlobalRankings: RankingsEntry[];
  initialHardBotRankings: RankingsEntry[];
};

type RankingsType = "global" | "hard-bot" | "multiplayer";

export function StatsView({
  profileId,
  initialGlobalRankings,
  initialHardBotRankings,
}: StatsViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<RankingsType>("global");
  const [globalRankings, setGlobalRankings] = useState<RankingsEntry[]>(initialGlobalRankings);
  const [hardBotRankings, setHardBotRankings] = useState<RankingsEntry[]>(initialHardBotRankings);
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  // Filter multiplayer rankings from global (exclude bot games)
  const multiplayerRankings = globalRankings
    .filter((player) => player.multiplayerGames > 0)
    .map((player) => ({
      ...player,
      totalWins: player.multiplayerWins,
      totalGames: player.multiplayerGames,
      winRate: player.multiplayerGames > 0
        ? Math.round((player.multiplayerWins / player.multiplayerGames) * 10000) / 100
        : 0,
    }))
    .sort((a, b) => {
      if (b.totalWins !== a.totalWins) {
        return b.totalWins - a.totalWins;
      }
      return b.winRate - a.winRate;
    });

  const getCurrentRankings = (): RankingsEntry[] => {
    switch (activeTab) {
      case "hard-bot":
        return hardBotRankings;
      case "multiplayer":
        return multiplayerRankings;
      default:
        return globalRankings;
    }
  };

  const getTabLabel = (tab: RankingsType): string => {
    switch (tab) {
      case "global":
        return "🏆 Global";
      case "multiplayer":
        return "👥 Multijugador";
      case "hard-bot":
        return "🤖 vs IA Difícil";
      default:
        return tab;
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/5 p-2">
        {(["global", "multiplayer", "hard-bot"] as RankingsType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            disabled={isPending}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              activeTab === tab
                ? "bg-emerald-500 text-white shadow-lg"
                : "bg-white/5 text-emerald-100 hover:bg-white/10"
            } disabled:opacity-60`}
          >
            {getTabLabel(tab)}
          </button>
        ))}
        <button
          onClick={handleRefresh}
          disabled={isPending}
          className="ml-auto rounded-xl border border-emerald-400/40 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:border-emerald-200 hover:text-white disabled:opacity-60"
        >
          {isPending ? "Actualizando..." : "🔄 Actualizar"}
        </button>
      </div>

      {/* Rankings Table */}
      <RankingsTable
        rankings={getCurrentRankings()}
        type={activeTab}
        currentPlayerId={profileId}
      />

      {/* Player Stats and Head-to-Head */}
      <div className="grid gap-6 md:grid-cols-2">
        <PlayerStatsCard playerId={profileId} />
        <HeadToHeadCard currentPlayerId={profileId} />
      </div>
    </div>
  );
}

