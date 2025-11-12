import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  BOARD_ROWS,
  GOAL_COLS,
  RuleEngine,
  type GameState,
  type Move,
  type PlayerId,
} from "@/lib/ruleEngine";
import type { Database } from "@/lib/database.types";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";

export type BotDifficulty = "easy" | "medium" | "hard";

export const FOOTBALL_BOT_DEFAULT_NAME = "FootballBot";
export const FOOTBALL_BOT_DEFAULT_DIFFICULTY: BotDifficulty = "easy";

type GameRow = Database["public"]["Tables"]["games"]["Row"];

const MAX_CHAINED_BOT_MOVES = 3;

const opponent = (player: PlayerId): PlayerId => (player === "home" ? "away" : "home");

const goalRowForPlayer = (player: PlayerId): number =>
  player === "home" ? 0 : BOARD_ROWS - 1;

const forwardProgress = (from: Move["from"], to: Move["to"], player: PlayerId): number =>
  player === "home" ? from.row - to.row : to.row - from.row;

const positionalBonus = (to: Move["to"], player: PlayerId): number => {
  const targetRow = goalRowForPlayer(player);
  const distance = Math.abs(targetRow - to.row);
  // Reward proximity to goal; closer rows yield higher score
  // Extra bonus if in goal columns
  const columnBonus = GOAL_COLS.includes(to.col) ? 5 : 0;
  return Math.max(0, 10 - distance) + columnBonus;
};

const rateMove = (
  state: GameState,
  move: Move,
  difficulty: BotDifficulty,
): { score: number; outcome: ReturnType<typeof RuleEngine.applyMove> } => {
  const simulationState: GameState = {
    ...state,
    turn: move.player,
  };

  const outcome = RuleEngine.applyMove(simulationState, move);
  const goal = outcome.goal?.scoringPlayer === move.player;
  const capture = Boolean(outcome.capture);
  const progress = forwardProgress(move.from, move.to, move.player);
  const positional = positionalBonus(move.to, move.player);

  let score = 0;
  if (goal) {
    score += 1000;
  }

  if (capture) {
    score += 120;
  }

  score += progress * 8;
  score += positional * 4;

  if (difficulty === "easy") {
    score += Math.random() * 25;
  } else if (difficulty === "medium") {
    score += Math.random() * 10;
  }

  return { score, outcome };
};

export const pickBotMove = (
  state: GameState,
  player: PlayerId,
  difficulty: BotDifficulty = FOOTBALL_BOT_DEFAULT_DIFFICULTY,
): Move | null => {
  const legalMoves = RuleEngine.getLegalMoves(state, player);
  if (legalMoves.length === 0) {
    return null;
  }

  const rated = legalMoves.map((move) => ({
    move,
    ...rateMove(state, move, difficulty),
  }));

  rated.sort((a, b) => b.score - a.score);

  if (difficulty === "easy") {
    const sampleCount = Math.max(1, Math.min(5, rated.length));
    const randomIndex = Math.floor(Math.random() * sampleCount);
    return rated[randomIndex]?.move ?? rated[0]?.move ?? null;
  }

  if (difficulty === "medium") {
    const topTierScore = rated[0]?.score ?? 0;
    const threshold = topTierScore - 50;
    const candidates = rated.filter((entry) => entry.score >= threshold);
    if (candidates.length > 0) {
      const randomIndex = Math.floor(Math.random() * candidates.length);
      return candidates[randomIndex]?.move ?? rated[0]?.move ?? null;
    }
  }

  return rated[0]?.move ?? null;
};

const parseGameState = (game: GameRow): GameState => {
  const fallback = RuleEngine.createInitialState();
  const gameStateData = (game.game_state as GameState | null | undefined) ?? fallback;
  
  // Ensure all required properties are present
  return {
    board: gameStateData.board ?? fallback.board,
    turn: gameStateData.turn ?? fallback.turn,
    score: (game.score as GameState["score"]) ?? gameStateData.score ?? fallback.score,
    lastMove: gameStateData.lastMove ?? null,
    history: gameStateData.history ?? [],
    startingPlayer: gameStateData.startingPlayer ?? fallback.startingPlayer,
  };
};

const resolveWinnerId = (
  move: Move,
  outcome: ReturnType<typeof RuleEngine.applyMove>,
  game: GameRow,
): string | null => {
  const goalsForMover = outcome.nextState.score[move.player] ?? 0;
  if (goalsForMover < 3) {
    return game.winner_id;
  }

  if (move.player === "home") {
    return game.player_1_id;
  }
  return game.player_2_id;
};

export const executeBotTurnIfNeeded = async (
  gameId: string,
): Promise<void> => {
  console.log("[bot] executeBotTurnIfNeeded called for game:", gameId);
  
  for (let iteration = 0; iteration < MAX_CHAINED_BOT_MOVES; iteration += 1) {
    console.log("[bot] Iteration:", iteration + 1, "of", MAX_CHAINED_BOT_MOVES);
    
    const { data: game, error } = (await supabaseAdmin
      .from("games")
      .select(
        `id,
         status,
         player_1_id,
         player_2_id,
         game_state,
         score,
         winner_id,
         is_bot_game,
         bot_player,
         bot_difficulty,
         bot_display_name`,
      )
      .eq("id", gameId)
      .single()) as PostgrestSingleResponse<GameRow>;

    if (error) {
      console.error("[bot] Error fetching game:", error);
      return;
    }

    if (!game) {
      console.error("[bot] Game not found:", gameId);
      return;
    }

    if (!game.is_bot_game) {
      console.log("[bot] Game is not a bot game, skipping");
      return;
    }

    console.log("[bot] Game status:", game.status);
    if (game.status !== "in_progress") {
      console.log("[bot] Game is not in progress, skipping. Status:", game.status);
      return;
    }

    const botPlayer = (game.bot_player as PlayerId | null) ?? "away";
    console.log("[bot] Bot player:", botPlayer);

    const currentState = parseGameState(game);
    console.log("[bot] Parsed game state:", {
      turn: currentState.turn,
      score: currentState.score,
      historyLength: currentState.history?.length ?? 0,
      startingPlayer: currentState.startingPlayer,
    });
    console.log("[bot] Current turn:", currentState.turn, "Bot player:", botPlayer);
    console.log("[bot] Raw game_state from DB:", JSON.stringify(game.game_state)?.substring(0, 500));
    console.log("[bot] Game state turn check:", {
      currentTurn: currentState.turn,
      botPlayer: botPlayer,
      isBotTurn: currentState.turn === botPlayer,
      gameStatus: game.status,
      isBotGame: game.is_bot_game,
    });

    if (currentState.turn !== botPlayer) {
      console.log("[bot] ❌ Not bot's turn. Current turn:", currentState.turn, "Expected:", botPlayer);
      console.log("[bot] Bot will not execute. Waiting for turn to change.");
      return;
    }

    console.log("[bot] ✅ Bot's turn confirmed! Proceeding with move selection...");
    const difficulty =
      (game.bot_difficulty as BotDifficulty | null) ??
      FOOTBALL_BOT_DEFAULT_DIFFICULTY;

    const move = pickBotMove(currentState, botPlayer, difficulty);

    if (!move) {
      console.log("[bot] No legal moves found, passing turn");
      const passedState: GameState = {
        ...currentState,
        turn: opponent(botPlayer),
      };

      try {
        const updatePayload = {
          game_state: passedState as unknown as Database["public"]["Tables"]["games"]["Row"]["game_state"],
          score: passedState.score as unknown as Database["public"]["Tables"]["games"]["Row"]["score"],
        };
        
        // Use type assertion to bypass TypeScript's strict type checking for Supabase update
        const { error: updateError } = await (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          supabaseAdmin.from("games") as any
        )
          .update(updatePayload)
          .eq("id", gameId);
        
        if (updateError) {
          console.error("[bot] Failed to update passed state:", updateError);
          console.error("[bot] Update error details:", JSON.stringify(updateError));
        } else {
          console.log("[bot] Successfully passed turn");
        }
      } catch (updateError) {
        console.error("[bot] Exception updating passed state:", updateError);
        if (updateError instanceof Error) {
          console.error("[bot] Exception message:", updateError.message);
        }
      }
      return;
    }

    console.log("[bot] Move selected:", JSON.stringify(move));
    const outcome = RuleEngine.applyMove(currentState, move);
    let nextStatus = game.status;
    let winnerId = game.winner_id;

    if (outcome.goal?.scoringPlayer === botPlayer) {
      console.log("[bot] Bot scored a goal! Score:", outcome.nextState.score);
      nextStatus = outcome.nextState.score[botPlayer] >= 3 ? "finished" : "in_progress";
      if (nextStatus === "finished") {
        winnerId = resolveWinnerId(move, outcome, game);
        console.log("[bot] Game finished! Winner:", winnerId);
      }
    }

    try {
      const updatePayload = {
        game_state: outcome.nextState as unknown as Database["public"]["Tables"]["games"]["Row"]["game_state"],
        score: outcome.nextState.score as unknown as Database["public"]["Tables"]["games"]["Row"]["score"],
        status: nextStatus,
        winner_id: winnerId,
      };
      
      console.log("[bot] Updating game with payload:", JSON.stringify({
        status: nextStatus,
        winner_id: winnerId,
        score: outcome.nextState.score,
        game_state_turn: outcome.nextState.turn,
      }));
      
      // Use type assertion to bypass TypeScript's strict type checking for Supabase update
      const { error: updateError, data: updateData } = await (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabaseAdmin.from("games") as any
      )
        .update(updatePayload)
        .eq("id", gameId)
        .select();
      
      if (updateError) {
        console.error("[bot] Failed to persist move:", updateError);
        console.error("[bot] Update error details:", JSON.stringify(updateError));
        return;
      }
      
      console.log("[bot] Move persisted successfully. Updated rows:", Array.isArray(updateData) ? updateData.length : 0);
      if (updateData && Array.isArray(updateData) && updateData.length > 0) {
        const updatedGame = updateData[0] as GameRow | null;
        if (updatedGame?.game_state) {
          const gameState = updatedGame.game_state as unknown as GameState;
          console.log("[bot] Updated game state turn:", gameState.turn);
        }
      }
    } catch (updateError) {
      console.error("[bot] Exception persisting move:", updateError);
      if (updateError instanceof Error) {
        console.error("[bot] Exception message:", updateError.message);
        console.error("[bot] Exception stack:", updateError.stack);
      }
      return;
    }

    if (nextStatus === "finished") {
      console.log("[bot] Game finished, stopping bot execution");
      return;
    }
    
    // After a successful move, the turn always changes to the opponent
    // According to the rules, after any move (with or without goal), the turn goes to the opponent
    // So we can stop the loop here - the bot will be called again when it's the bot's turn
    console.log("[bot] Move completed successfully. Turn changed to opponent, stopping bot execution");
    return;
  }
  
  console.log("[bot] Reached max iterations, stopping");
};


