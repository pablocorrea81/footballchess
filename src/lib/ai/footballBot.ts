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
  return {
    ...fallback,
    ...(game.game_state as Partial<GameState> | null | undefined),
    score: (game.score as GameState["score"]) ?? fallback.score,
    lastMove: (game.game_state as GameState | null | undefined)?.lastMove ?? null,
    history: (game.game_state as GameState | null | undefined)?.history ?? [],
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
  for (let iteration = 0; iteration < MAX_CHAINED_BOT_MOVES; iteration += 1) {
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

    if (error || !game || !game.is_bot_game) {
      return;
    }

    if (game.status !== "in_progress") {
      return;
    }

    const botPlayer = (game.bot_player as PlayerId | null) ?? "away";

    const currentState = parseGameState(game);

    if (currentState.turn !== botPlayer) {
      return;
    }

    const difficulty =
      (game.bot_difficulty as BotDifficulty | null) ??
      FOOTBALL_BOT_DEFAULT_DIFFICULTY;

    const move = pickBotMove(currentState, botPlayer, difficulty);

    if (!move) {
      const passedState: GameState = {
        ...currentState,
        turn: opponent(botPlayer),
      };

      try {
        await (supabaseAdmin.from("games") as unknown as {
          update: (
            values: Record<string, unknown>,
          ) => ReturnType<typeof supabaseAdmin.from>;
        })
          .update({
            game_state: passedState,
            score: passedState.score,
          } as Record<string, unknown>)
          .eq("id", gameId);
      } catch (updateError) {
        console.error("[bot] failed to update passed state", updateError);
      }
      return;
    }

    const outcome = RuleEngine.applyMove(currentState, move);
    let nextStatus = game.status;
    let winnerId = game.winner_id;

    if (outcome.goal?.scoringPlayer === botPlayer) {
      nextStatus = outcome.nextState.score[botPlayer] >= 3 ? "finished" : "in_progress";
      if (nextStatus === "finished") {
        winnerId = resolveWinnerId(move, outcome, game);
      }
    }

    try {
      await (supabaseAdmin.from("games") as unknown as {
        update: (
          values: Record<string, unknown>,
        ) => ReturnType<typeof supabaseAdmin.from>;
      })
        .update({
          game_state: outcome.nextState,
          score: outcome.nextState.score,
          status: nextStatus,
          winner_id: winnerId,
        } as Record<string, unknown>)
        .eq("id", gameId);
    } catch (updateError) {
      console.error("[bot] failed to persist move", updateError);
      return;
    }

    if (nextStatus === "finished") {
      return;
    }
  }
};


