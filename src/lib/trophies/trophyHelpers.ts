"use server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Database } from "@/lib/database.types";

type GameRow = Database["public"]["Tables"]["games"]["Row"];

export type Trophy = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "victory" | "milestone" | "special" | "streak";
  rarity: "common" | "rare" | "epic" | "legendary";
  condition_type: string;
  condition_value: Record<string, unknown>;
};

export type PlayerTrophy = {
  id: string;
  player_id: string;
  trophy_id: string;
  unlocked_at: string;
  game_id: string | null;
  trophy: Trophy;
};

/**
 * Check and unlock trophies for a player after a game finishes
 */
export async function checkAndUnlockTrophies(
  playerId: string,
  gameId: string,
  game: GameRow,
): Promise<string[]> {
  const unlockedTrophyIds: string[] = [];

  try {
    // Get player's existing trophies
    const { data: existingTrophies } = await supabaseAdmin
      .from("player_trophies")
      .select("trophy_id")
      .eq("player_id", playerId);

    const existingTrophyIds = new Set(
      (existingTrophies as { trophy_id: string }[] | null)?.map((t) => t.trophy_id) || [],
    );

    // Get all trophies
    const { data: allTrophies } = await supabaseAdmin
      .from("trophies")
      .select("*");

    if (!allTrophies || allTrophies.length === 0) {
      return unlockedTrophyIds;
    }

    // Type assertion for trophies
    const trophies = allTrophies as Trophy[];

    // Get player's game history for milestone checks
    const { data: playerGames } = await supabaseAdmin
      .from("games")
      .select("id, player_1_id, player_2_id, winner_id, is_bot_game, bot_difficulty, game_state, score")
      .eq("status", "finished")
      .or(`player_1_id.eq.${playerId},player_2_id.eq.${playerId}`)
      .order("finished_at", { ascending: false });

    if (!playerGames) {
      return unlockedTrophyIds;
    }

    // Check if player won this game
    const playerWon = game.winner_id === playerId;
    
    // Some trophies can be unlocked even if player didn't win (e.g., goal_with_piece)
    // We'll check those separately

    // Get game details
    const isBotGame = game.is_bot_game ?? false;
    const botDifficulty = game.bot_difficulty as string | null;
    const gameState = game.game_state as
      | { 
          score?: { home: number; away: number };
          history?: Array<{ 
            player: string; 
            pieceId: string; 
            goal?: { scoringPlayer: string };
            moveNumber: number;
          }>;
        }
      | null;
    const score = gameState?.score || { home: 0, away: 0 };

    // Determine player role (home or away)
    const playerRole = game.player_1_id === playerId ? "home" : "away";
    const playerScore = score[playerRole] || 0;
    const opponentScore = score[playerRole === "home" ? "away" : "home"] || 0;

    // Find all goals scored by this player in this game (for piece-specific trophies)
    // Track which piece types have scored goals
    const goalsByPieceType = new Set<string>();
    if (gameState?.history) {
      // Find all goals by this player
      for (const move of gameState.history) {
        if (move.goal) {
          // Check if this goal was scored by the current player
          // The scoringPlayer in goal is "home" or "away", not the playerId
          const goalScorerRole = move.goal.scoringPlayer as "home" | "away";
          if (goalScorerRole === playerRole) {
            // Extract piece type from pieceId
            const pieceIdParts = move.pieceId.split("-");
            if (pieceIdParts.length >= 2) {
              const pieceType = pieceIdParts[1]; // "defensa", "delantero", etc.
              goalsByPieceType.add(pieceType);
            }
          }
        }
      }
    }

    // Check each trophy condition
    for (const trophy of trophies) {
      // Skip if already unlocked
      if (existingTrophyIds.has(trophy.id)) {
        continue;
      }

      // Some trophies don't require winning (e.g., goal_with_piece)
      const condition = trophy.condition_value as Record<string, unknown>;
      const requiresWin = trophy.condition_type !== "special" || 
                         (condition.type as string) !== "goal_with_piece";

      // Skip win-required trophies if player didn't win
      if (requiresWin && !playerWon) {
        continue;
      }

      // For goal_with_piece, we need at least one goal scored
      if (!requiresWin && goalsByPieceType.size === 0) {
        continue;
      }

      const shouldUnlock = checkTrophyCondition(
        trophy,
        playerId,
        game,
        playerGames,
        playerRole,
        playerScore,
        opponentScore,
        isBotGame,
        botDifficulty,
        goalsByPieceType,
      );

      if (shouldUnlock) {
        // Unlock the trophy
        const { error: insertError } = await (supabaseAdmin.from("player_trophies") as any)
          .insert({
            player_id: playerId,
            trophy_id: trophy.id,
            game_id: gameId,
          });

        if (!insertError) {
          unlockedTrophyIds.push(trophy.id);
          console.log(`[trophies] Unlocked trophy: ${trophy.name} for player ${playerId}`);
        }
      }
    }

    return unlockedTrophyIds;
  } catch (error) {
    console.error("[trophies] Error checking trophies:", error);
    return unlockedTrophyIds;
  }
}

/**
 * Check if a trophy condition is met
 */
function checkTrophyCondition(
  trophy: Trophy,
  playerId: string,
  currentGame: GameRow,
  playerGames: GameRow[],
  playerRole: "home" | "away",
  playerScore: number,
  opponentScore: number,
  isBotGame: boolean,
  botDifficulty: string | null,
  goalsByPieceType: Set<string>,
): boolean {
  const condition = trophy.condition_value as Record<string, unknown>;

  switch (trophy.condition_type) {
    case "first_win": {
      const type = condition.type as string;
      if (type === "any") {
        // First win ever - check if this is the first win
        return playerGames.filter((g) => g.winner_id === playerId).length === 1;
      }
      if (type === "bot") {
        const difficulty = condition.difficulty as string | undefined;
        if (difficulty) {
          // First win against specific bot difficulty
          const winsAgainstDifficulty = playerGames.filter(
            (g) =>
              g.winner_id === playerId &&
              g.is_bot_game &&
              g.bot_difficulty === difficulty,
          );
          return winsAgainstDifficulty.length === 1;
        }
        // First win against any bot
        const botWins = playerGames.filter(
          (g) => g.winner_id === playerId && g.is_bot_game,
        );
        return botWins.length === 1;
      }
      if (type === "multiplayer") {
        // First win against another player
        const multiplayerWins = playerGames.filter(
          (g) => g.winner_id === playerId && !g.is_bot_game,
        );
        return multiplayerWins.length === 1;
      }
      return false;
    }

    case "win_count": {
      const count = condition.count as number;
      const type = condition.type as string | undefined;
      const difficulty = condition.difficulty as string | undefined;

      let relevantGames = playerGames.filter((g) => g.winner_id === playerId);

      if (type === "multiplayer") {
        relevantGames = relevantGames.filter((g) => !g.is_bot_game);
      } else if (type === "bot") {
        relevantGames = relevantGames.filter((g) => g.is_bot_game);
        if (difficulty) {
          relevantGames = relevantGames.filter(
            (g) => g.bot_difficulty === difficulty,
          );
        }
      }

      return relevantGames.length >= count;
    }

    case "win_streak": {
      const streak = condition.streak as number;
      // Check last N games - all should be wins
      const recentGames = playerGames.slice(0, streak);
      return (
        recentGames.length === streak &&
        recentGames.every((g) => g.winner_id === playerId)
      );
    }

    case "special": {
      const specialType = condition.type as string;

      if (specialType === "perfect_game" || specialType === "clean_sheet") {
        // Win without conceding goals
        return opponentScore === 0 && playerScore > 0;
      }

      if (specialType === "comeback") {
        const deficit = condition.deficit as number;
        // Check game history to see if player was losing by deficit
        // This is simplified - would need to check game_state history
        return playerScore > opponentScore;
      }

      if (specialType === "hat_trick") {
        // Score 3+ goals in a single game
        return playerScore >= 3;
      }

      if (specialType === "goal_with_piece") {
        const pieceType = condition.piece_type as string;
        
        // Check if player scored a goal with this piece type in this game
        if (!goalsByPieceType.has(pieceType)) {
          return false;
        }

        // Check if this is the first time the player has scored with this piece type
        // Look through all previous games to see if they've scored with this piece before
        let hasScoredWithPieceBefore = false;
        for (const g of playerGames) {
          if (g.id === currentGame.id) continue; // Skip current game
          const gState = g.game_state as
            | { history?: Array<{ 
                player: string; 
                pieceId: string; 
                goal?: { scoringPlayer: string } 
              }> }
            | null;
          if (gState?.history) {
            for (const m of gState.history) {
              if (m.goal) {
                // Check if this goal was scored by the current player
                const goalScorerRole = m.goal.scoringPlayer as "home" | "away";
                if (goalScorerRole === playerRole) {
                  const mPieceIdParts = m.pieceId.split("-");
                  if (mPieceIdParts.length >= 2 && mPieceIdParts[1] === pieceType) {
                    hasScoredWithPieceBefore = true;
                    break;
                  }
                }
              }
            }
          }
          if (hasScoredWithPieceBefore) break;
        }
        
        // Unlock trophy if this is the first goal with this piece type
        return !hasScoredWithPieceBefore;
      }

      return false;
    }

    default:
      return false;
  }
}

/**
 * Get all trophies unlocked by a player
 */
export async function getPlayerTrophies(
  playerId: string,
): Promise<PlayerTrophy[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("player_trophies")
      .select(
        `
        id,
        player_id,
        trophy_id,
        unlocked_at,
        game_id,
        trophy:trophies(*)
      `,
      )
      .eq("player_id", playerId)
      .order("unlocked_at", { ascending: false });

    if (error) {
      console.error("[trophies] Error fetching player trophies:", error);
      return [];
    }

    return ((data || []) as Array<{
      id: string;
      player_id: string;
      trophy_id: string;
      unlocked_at: string;
      game_id: string | null;
      trophy: Trophy;
    }>).map((pt) => ({
      id: pt.id,
      player_id: pt.player_id,
      trophy_id: pt.trophy_id,
      unlocked_at: pt.unlocked_at,
      game_id: pt.game_id,
      trophy: pt.trophy,
    }));
  } catch (error) {
    console.error("[trophies] Error in getPlayerTrophies:", error);
    return [];
  }
}

/**
 * Get trophy statistics for a player
 */
export async function getPlayerTrophyStats(playerId: string): Promise<{
  totalTrophies: number;
  byCategory: Record<string, number>;
  byRarity: Record<string, number>;
  recentTrophies: PlayerTrophy[];
}> {
  const trophies = await getPlayerTrophies(playerId);

  const byCategory: Record<string, number> = {};
  const byRarity: Record<string, number> = {};

  for (const pt of trophies) {
    byCategory[pt.trophy.category] = (byCategory[pt.trophy.category] || 0) + 1;
    byRarity[pt.trophy.rarity] = (byRarity[pt.trophy.rarity] || 0) + 1;
  }

  return {
    totalTrophies: trophies.length,
    byCategory,
    byRarity,
    recentTrophies: trophies.slice(0, 5),
  };
}

