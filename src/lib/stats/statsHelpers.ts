"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Database } from "@/lib/database.types";

type GameRow = Database["public"]["Tables"]["games"]["Row"];

export type PlayerStats = {
  playerId: string;
  username: string | null;
  avatarUrl: string | null;
  totalWins: number;
  totalLosses: number;
  totalGames: number;
  winRate: number;
  multiplayerWins: number;
  multiplayerLosses: number;
  multiplayerGames: number;
  botWins: number;
  botLosses: number;
  botGames: number;
  hardBotWins: number;
  hardBotLosses: number;
  hardBotGames: number;
};

export type HeadToHeadStats = {
  player1Id: string;
  player1Username: string | null;
  player2Id: string;
  player2Username: string | null;
  player1Wins: number;
  player2Wins: number;
  totalGames: number;
};

export type RankingsEntry = {
  playerId: string;
  username: string | null;
  avatarUrl: string | null;
  totalWins: number;
  totalGames: number;
  winRate: number;
  multiplayerWins: number;
  multiplayerGames: number;
  hardBotWins: number;
  hardBotGames: number;
};

/**
 * Get comprehensive stats for a specific player
 */
export async function getPlayerStats(playerId: string): Promise<PlayerStats | null> {
  try {
    // Get player profile
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, username, avatar_url")
      .eq("id", playerId)
      .single();

    if (profileError || !profileData) {
      return null;
    }

    const profile = profileData as { id: string; username: string | null; avatar_url: string | null };

    // Get all finished games where player participated
    const { data: finishedGamesData, error } = await supabaseAdmin
      .from("games")
      .select("id, player_1_id, player_2_id, winner_id, is_bot_game, bot_difficulty")
      .eq("status", "finished")
      .or(`player_1_id.eq.${playerId},player_2_id.eq.${playerId}`);

    if (error) {
      console.error("[stats] Error fetching finished games:", error);
      throw error;
    }

    type FinishedGame = {
      id: string;
      player_1_id: string;
      player_2_id: string | null;
      winner_id: string | null;
      is_bot_game: boolean;
      bot_difficulty: string | null;
    };

    const finishedGames = (finishedGamesData as FinishedGame[]) ?? [];

    if (finishedGames.length === 0) {
      return {
        playerId,
        username: profile.username,
        avatarUrl: profile.avatar_url,
        totalWins: 0,
        totalLosses: 0,
        totalGames: 0,
        winRate: 0,
        multiplayerWins: 0,
        multiplayerLosses: 0,
        multiplayerGames: 0,
        botWins: 0,
        botLosses: 0,
        botGames: 0,
        hardBotWins: 0,
        hardBotLosses: 0,
        hardBotGames: 0,
      };
    }

    let totalWins = 0;
    let totalLosses = 0;
    let multiplayerWins = 0;
    let multiplayerLosses = 0;
    let multiplayerGames = 0;
    let botWins = 0;
    let botLosses = 0;
    let botGames = 0;
    let hardBotWins = 0;
    let hardBotLosses = 0;
    let hardBotGames = 0;

    for (const game of finishedGames) {
      const isPlayer1 = game.player_1_id === playerId;
      const isPlayer2 = game.player_2_id === playerId;
      const isMultiplayer = !game.is_bot_game && game.player_2_id !== null;
      const isBotGame = game.is_bot_game;
      const isHardBot = game.bot_difficulty === "hard";
      const isWinner = game.winner_id === playerId;
      const isLoser = !isWinner && (isPlayer1 || isPlayer2);

      // Count total wins/losses
      if (isWinner) {
        totalWins++;
      } else if (isLoser) {
        totalLosses++;
      }

      // Count multiplayer games
      if (isMultiplayer) {
        multiplayerGames++;
        if (isWinner) {
          multiplayerWins++;
        } else if (isLoser) {
          multiplayerLosses++;
        }
      }

      // Count bot games
      if (isBotGame) {
        botGames++;
        if (isWinner) {
          botWins++;
        } else if (isLoser) {
          botLosses++;
        }

        // Count hard bot games
        if (isHardBot) {
          hardBotGames++;
          if (isWinner) {
            hardBotWins++;
          } else if (isLoser) {
            hardBotLosses++;
          }
        }
      }
    }

    const totalGames = totalWins + totalLosses;
    const winRate = totalGames > 0 ? (totalWins / totalGames) * 100 : 0;

    return {
      playerId,
      username: profile.username,
      avatarUrl: profile.avatar_url,
      totalWins,
      totalLosses,
      totalGames,
      winRate: Math.round(winRate * 100) / 100, // Round to 2 decimals
      multiplayerWins,
      multiplayerLosses,
      multiplayerGames,
      botWins,
      botLosses,
      botGames,
      hardBotWins,
      hardBotLosses,
      hardBotGames,
    };
  } catch (error) {
    console.error("[stats] Error in getPlayerStats:", error);
    throw error;
  }
}

/**
 * Get head-to-head statistics between two players
 */
export async function getHeadToHeadStats(
  player1Id: string,
  player2Id: string,
): Promise<HeadToHeadStats | null> {
  try {
    // Get player profiles
    const { data: profilesData, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .in("id", [player1Id, player2Id]);

    if (profilesError || !profilesData || profilesData.length !== 2) {
      return null;
    }

    const profiles = profilesData as { id: string; username: string | null }[];
    const player1Profile = profiles.find((p) => p.id === player1Id);
    const player2Profile = profiles.find((p) => p.id === player2Id);

    if (!player1Profile || !player2Profile) {
      return null;
    }

    // Get finished games between these two players
    const { data: finishedGamesData, error } = await supabaseAdmin
      .from("games")
      .select("id, player_1_id, player_2_id, winner_id")
      .eq("status", "finished")
      .eq("is_bot_game", false)
      .or(`and(player_1_id.eq.${player1Id},player_2_id.eq.${player2Id}),and(player_1_id.eq.${player2Id},player_2_id.eq.${player1Id})`);

    if (error) {
      console.error("[stats] Error fetching head-to-head games:", error);
      throw error;
    }

    type HeadToHeadGame = {
      id: string;
      player_1_id: string;
      player_2_id: string | null;
      winner_id: string | null;
    };

    const finishedGames = (finishedGamesData as HeadToHeadGame[]) ?? [];

    if (finishedGames.length === 0) {
      return {
        player1Id,
        player1Username: player1Profile.username,
        player2Id,
        player2Username: player2Profile.username,
        player1Wins: 0,
        player2Wins: 0,
        totalGames: 0,
      };
    }

    let player1Wins = 0;
    let player2Wins = 0;

    for (const game of finishedGames) {
      if (game.winner_id === player1Id) {
        player1Wins++;
      } else if (game.winner_id === player2Id) {
        player2Wins++;
      }
    }

    return {
      player1Id,
      player1Username: player1Profile.username,
      player2Id,
      player2Username: player2Profile.username,
      player1Wins,
      player2Wins,
      totalGames: finishedGames.length,
    };
  } catch (error) {
    console.error("[stats] Error in getHeadToHeadStats:", error);
    throw error;
  }
}

/**
 * Get global rankings sorted by total wins
 */
export async function getGlobalRankings(limit: number = 100): Promise<RankingsEntry[]> {
  try {
    // Get all finished games
    const { data: finishedGamesData, error } = await supabaseAdmin
      .from("games")
      .select(`
        id,
        player_1_id,
        player_2_id,
        winner_id,
        is_bot_game,
        bot_difficulty,
        player1:profiles!games_player_1_id_fkey(id, username, avatar_url),
        player2:profiles!games_player_2_id_fkey(id, username, avatar_url)
      `)
      .eq("status", "finished");

    if (error) {
      console.error("[stats] Error fetching finished games for rankings:", error);
      throw error;
    }

    if (!finishedGamesData || finishedGamesData.length === 0) {
      return [];
    }

    type GameWithProfiles = {
      id: string;
      player_1_id: string;
      player_2_id: string | null;
      winner_id: string | null;
      is_bot_game: boolean;
      bot_difficulty: string | null;
      player1: { id: string; username: string | null; avatar_url: string | null } | { id: string; username: string | null; avatar_url: string | null }[];
      player2: { id: string; username: string | null; avatar_url: string | null } | { id: string; username: string | null; avatar_url: string | null }[] | null;
    };

    const finishedGames = finishedGamesData as GameWithProfiles[];

    // Aggregate stats by player
    const playerStatsMap = new Map<string, RankingsEntry>();

    for (const game of finishedGames) {
      const player1 = Array.isArray(game.player1) ? game.player1[0] : game.player1;
      const player2 = game.player2 ? (Array.isArray(game.player2) ? game.player2[0] : game.player2) : null;

      // Process player 1
      if (player1) {
        const playerId = player1.id;
        if (!playerStatsMap.has(playerId)) {
          playerStatsMap.set(playerId, {
            playerId,
            username: player1.username,
            avatarUrl: player1.avatar_url,
            totalWins: 0,
            totalGames: 0,
            winRate: 0,
            multiplayerWins: 0,
            multiplayerGames: 0,
            hardBotWins: 0,
            hardBotGames: 0,
          });
        }

        const stats = playerStatsMap.get(playerId)!;
        stats.totalGames++;
        if (game.winner_id === playerId) {
          stats.totalWins++;
        }

        // Count multiplayer games
        if (!game.is_bot_game && game.player_2_id !== null) {
          stats.multiplayerGames++;
          if (game.winner_id === playerId) {
            stats.multiplayerWins++;
          }
        }

        // Count hard bot games
        if (game.is_bot_game && game.bot_difficulty === "hard") {
          stats.hardBotGames++;
          if (game.winner_id === playerId) {
            stats.hardBotWins++;
          }
        }
      }

      // Process player 2 (if exists and not bot)
      if (player2 && !game.is_bot_game && game.player_2_id) {
        const playerId = player2.id;
        if (!playerStatsMap.has(playerId)) {
          playerStatsMap.set(playerId, {
            playerId,
            username: player2.username,
            avatarUrl: player2.avatar_url,
            totalWins: 0,
            totalGames: 0,
            winRate: 0,
            multiplayerWins: 0,
            multiplayerGames: 0,
            hardBotWins: 0,
            hardBotGames: 0,
          });
        }

        const stats = playerStatsMap.get(playerId)!;
        stats.totalGames++;
        if (game.winner_id === playerId) {
          stats.totalWins++;
        }

        // Count multiplayer games
        stats.multiplayerGames++;
        if (game.winner_id === playerId) {
          stats.multiplayerWins++;
        }
      }
    }

    // Calculate win rates and sort
    const rankings: RankingsEntry[] = Array.from(playerStatsMap.values())
      .map((stats) => ({
        ...stats,
        winRate: stats.totalGames > 0 ? Math.round((stats.totalWins / stats.totalGames) * 10000) / 100 : 0,
      }))
      .sort((a, b) => {
        // Sort by total wins (descending), then by win rate (descending), then by total games (ascending)
        if (b.totalWins !== a.totalWins) {
          return b.totalWins - a.totalWins;
        }
        if (b.winRate !== a.winRate) {
          return b.winRate - a.winRate;
        }
        return a.totalGames - b.totalGames;
      })
      .slice(0, limit);

    return rankings;
  } catch (error) {
    console.error("[stats] Error in getGlobalRankings:", error);
    throw error;
  }
}

/**
 * Get rankings for hard bot games only (players vs bot difficulty hard)
 */
export async function getHardBotRankings(limit: number = 100): Promise<RankingsEntry[]> {
  try {
    // Get all finished games vs hard bot
    const { data: finishedGamesData, error } = await supabaseAdmin
      .from("games")
      .select(`
        id,
        player_1_id,
        winner_id,
        player1:profiles!games_player_1_id_fkey(id, username, avatar_url)
      `)
      .eq("status", "finished")
      .eq("is_bot_game", true)
      .eq("bot_difficulty", "hard");

    if (error) {
      console.error("[stats] Error fetching hard bot games:", error);
      throw error;
    }

    if (!finishedGamesData || finishedGamesData.length === 0) {
      return [];
    }

    type HardBotGame = {
      id: string;
      player_1_id: string;
      winner_id: string | null;
      player1: { id: string; username: string | null; avatar_url: string | null } | { id: string; username: string | null; avatar_url: string | null }[];
    };

    const finishedGames = finishedGamesData as HardBotGame[];

    // Aggregate stats by player
    const playerStatsMap = new Map<string, RankingsEntry>();

    for (const game of finishedGames) {
      const player1 = Array.isArray(game.player1) ? game.player1[0] : game.player1;
      if (!player1) continue;

      const playerId = player1.id;
      if (!playerStatsMap.has(playerId)) {
        playerStatsMap.set(playerId, {
          playerId,
          username: player1.username,
          avatarUrl: player1.avatar_url,
          totalWins: 0,
          totalGames: 0,
          winRate: 0,
          multiplayerWins: 0,
          multiplayerGames: 0,
          hardBotWins: 0,
          hardBotGames: 0,
        });
      }

      const stats = playerStatsMap.get(playerId)!;
      stats.hardBotGames++;
      stats.totalGames++;
      if (game.winner_id === playerId) {
        stats.hardBotWins++;
        stats.totalWins++;
      }
    }

    // Calculate win rates and sort
    const rankings: RankingsEntry[] = Array.from(playerStatsMap.values())
      .map((stats) => ({
        ...stats,
        winRate: stats.hardBotGames > 0 ? Math.round((stats.hardBotWins / stats.hardBotGames) * 10000) / 100 : 0,
      }))
      .sort((a, b) => {
        // Sort by hard bot wins (descending), then by win rate (descending)
        if (b.hardBotWins !== a.hardBotWins) {
          return b.hardBotWins - a.hardBotWins;
        }
        return b.winRate - a.winRate;
      })
      .slice(0, limit);

    return rankings;
  } catch (error) {
    console.error("[stats] Error in getHardBotRankings:", error);
    throw error;
  }
}

