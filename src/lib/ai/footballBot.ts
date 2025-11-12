import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  BOARD_ROWS,
  BOARD_COLS,
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
  const columnBonus = GOAL_COLS.includes(to.col) ? 10 : 0;
  // Bonus for controlling center columns (better strategic position)
  const centerBonus = to.col >= 2 && to.col <= 5 ? 3 : 0;
  return Math.max(0, 15 - distance) + columnBonus + centerBonus;
};

// Evaluate defensive threat (opponent pieces threatening our goal)
const defensiveThreat = (state: GameState, player: PlayerId): number => {
  const goalRow = goalRowForPlayer(player);
  let threatScore = 0;
  
  // Check for opponent pieces near our goal
  for (let row = Math.max(0, goalRow - 3); row <= Math.min(BOARD_ROWS - 1, goalRow + 3); row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const piece = state.board[row]?.[col];
      if (piece && piece.owner !== player) {
        // Check if this piece can reach our goal
        const distanceToGoal = Math.abs(row - goalRow);
        if (distanceToGoal <= 3 && GOAL_COLS.includes(col)) {
          threatScore += 50 * (4 - distanceToGoal);
        } else if (distanceToGoal <= 5) {
          threatScore += 20 * (6 - distanceToGoal);
        }
      }
    }
  }
  
  return threatScore;
};

// Evaluate piece safety (how well protected are our pieces)
const pieceSafety = (state: GameState, move: Move, outcome: ReturnType<typeof RuleEngine.applyMove>): number => {
  const movedPiece = outcome.nextState.board[move.to.row]?.[move.to.col];
  if (!movedPiece) return 0;
  
  let safetyScore = 0;
  // Check if piece is protected by nearby friendly pieces
  for (let dRow = -2; dRow <= 2; dRow += 1) {
    for (let dCol = -2; dCol <= 2; dCol += 1) {
      if (dRow === 0 && dCol === 0) continue;
      const checkRow = move.to.row + dRow;
      const checkCol = move.to.col + dCol;
      if (checkRow >= 0 && checkRow < BOARD_ROWS && checkCol >= 0 && checkCol < BOARD_COLS) {
        const nearbyPiece = outcome.nextState.board[checkRow]?.[checkCol];
        if (nearbyPiece && nearbyPiece.owner === move.player) {
          safetyScore += 5;
        }
      }
    }
  }
  
  return safetyScore;
};

// Evaluate piece value (different pieces have different strategic importance)
const pieceValue = (pieceType: string): number => {
  switch (pieceType) {
    case "delantero":
      return 30; // Most valuable for scoring
    case "mediocampista":
      return 20; // Good for control and scoring
    case "carrilero":
      return 15; // Versatile
    case "defensa":
      return 10; // Defensive value
    default:
      return 10;
  }
};

// Evaluate board control (how well we control key areas)
const boardControl = (state: GameState, player: PlayerId): number => {
  let controlScore = 0;
  const centerRows = [5, 6]; // Middle rows
  const centerCols = [3, 4]; // Center columns
  
  // Count pieces in center
  for (const row of centerRows) {
    for (const col of centerCols) {
      const piece = state.board[row]?.[col];
      if (piece && piece.owner === player) {
        controlScore += 10;
      }
    }
  }
  
  // Count pieces in opponent's half
  const opponentGoalRow = goalRowForPlayer(opponent(player));
  const playerGoalRow = goalRowForPlayer(player);
  const midfieldRow = Math.floor((opponentGoalRow + playerGoalRow) / 2);
  
  for (let row = player === "home" ? 0 : midfieldRow + 1; 
       row < (player === "home" ? midfieldRow : BOARD_ROWS); 
       row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const piece = state.board[row]?.[col];
      if (piece && piece.owner === player) {
        controlScore += 5;
      }
    }
  }
  
  return controlScore;
};

const rateMove = (
  state: GameState,
  move: Move,
  difficulty: BotDifficulty,
  lookAhead: boolean = false,
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
  
  // Get piece type for value calculation
  const piece = state.board[move.from.row]?.[move.from.col];
  const pieceVal = piece ? pieceValue(piece.type) : 10;

  let score = 0;
  
  // Goal is always the highest priority
  if (goal) {
    score += 10000;
  }

  // Capture with piece value consideration
  if (capture && outcome.capture) {
    const capturedValue = pieceValue(outcome.capture.type);
    score += 150 + capturedValue * 2; // More valuable captures are better
  }

  // Progress towards goal (more important for forwards)
  if (progress > 0) {
    score += progress * (pieceVal / 2);
  }

  // Positional bonus (being close to goal)
  score += positional * 3;

  // Defensive considerations (medium and hard only)
  if (difficulty !== "easy") {
    const threatBefore = defensiveThreat(state, move.player);
    const threatAfter = defensiveThreat(outcome.nextState, move.player);
    const threatReduction = threatBefore - threatAfter;
    score += threatReduction * (difficulty === "hard" ? 3 : 2); // Hard considers threats more heavily
    
    // Piece safety (protecting our pieces)
    const safety = pieceSafety(state, move, outcome);
    score += safety * (difficulty === "hard" ? 1.5 : 1);
  }

  // Board control (medium and hard only)
  if (difficulty !== "easy") {
    const controlBefore = boardControl(state, move.player);
    const controlAfter = boardControl(outcome.nextState, move.player);
    const controlGain = controlAfter - controlBefore;
    score += controlGain * 2;
  }

  // Calculate score difference for adaptive strategy
  const scoreDiff = state.score[move.player] - state.score[opponent(move.player)];
  
  // Penalize moving defenders too far forward (they can't score)
  // But allow it if we're losing (need to take risks)
  if (piece?.type === "defensa" && progress > 3) {
    if (scoreDiff >= 0) {
      score -= 25; // Penalty for moving defenders too aggressively when not losing
    } else {
      score -= 5; // Smaller penalty when losing (defenders can help create space)
    }
  }
  
  // Bonus for keeping defenders near goal when we're winning
  if (piece?.type === "defensa" && scoreDiff >= 1 && progress < 0) {
    score += 10; // Reward defensive positioning
  }

  // Look-ahead for medium and hard: evaluate opponent's best response
  if (lookAhead && difficulty !== "easy") {
    const opponentPlayer = opponent(move.player);
    const opponentMoves = RuleEngine.getLegalMoves(outcome.nextState, opponentPlayer);
    
    if (opponentMoves.length > 0) {
      // Find opponent's best move
      let bestOpponentScore = -Infinity;
      let opponentCanScore = false;
      let opponentCanCapture = false;
      
      for (const opponentMove of opponentMoves) {
        const opponentOutcome = RuleEngine.applyMove(outcome.nextState, opponentMove);
        const opponentGoal = opponentOutcome.goal?.scoringPlayer === opponentPlayer;
        const opponentCapture = Boolean(opponentOutcome.capture);
        const opponentProgress = forwardProgress(
          opponentMove.from,
          opponentMove.to,
          opponentPlayer,
        );
        const opponentPiece = outcome.nextState.board[opponentMove.from.row]?.[opponentMove.from.col];
        const opponentPieceVal = opponentPiece ? pieceValue(opponentPiece.type) : 10;
        
        let opponentScore = 0;
        if (opponentGoal) {
          opponentScore += 8000; // Threat of opponent goal (very dangerous)
          opponentCanScore = true;
        }
        if (opponentCapture && opponentOutcome.capture) {
          const capturedVal = pieceValue(opponentOutcome.capture.type);
          opponentScore += 150 + capturedVal * 2;
          opponentCanCapture = true;
        }
        opponentScore += opponentProgress * (opponentPieceVal / 2);
        opponentScore += positionalBonus(opponentMove.to, opponentPlayer) * 2;
        
        bestOpponentScore = Math.max(bestOpponentScore, opponentScore);
      }
      
      // Heavy penalty if opponent can score on next move
      if (opponentCanScore) {
        score -= 3000; // Very bad move if it allows opponent to score
      }
      
      // Penalty if opponent can capture valuable pieces
      if (opponentCanCapture) {
        score -= 200;
      }
      
      // Subtract opponent's best response from our score
      // Hard difficulty considers this more heavily
      score -= bestOpponentScore * (difficulty === "hard" ? 0.6 : 0.3);
    }
  }
  
  // Adaptive strategy based on score
  if (scoreDiff < 0) {
    // Losing: be more aggressive
    if (progress > 0) {
      score += progress * 5; // Extra bonus for forward movement
    }
    if (capture) {
      score += 30; // Extra bonus for captures
    }
  } else if (scoreDiff >= 2) {
    // Winning by 2 or more: be more defensive
    const threatReduction = defensiveThreat(state, move.player) - defensiveThreat(outcome.nextState, move.player);
    score += threatReduction * 3; // Higher reward for defensive moves
    if (progress > 2) {
      score -= 15; // Penalty for being too aggressive when winning
    }
  }

  // Add randomness based on difficulty (less for harder difficulties)
  if (difficulty === "easy") {
    score += Math.random() * 30;
  } else if (difficulty === "medium") {
    score += Math.random() * 8;
  }
  // Hard has no randomness

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

  // Use look-ahead for medium and hard difficulties
  const useLookAhead = difficulty !== "easy";
  
  const rated = legalMoves.map((move) => ({
    move,
    ...rateMove(state, move, difficulty, useLookAhead),
  }));

  rated.sort((a, b) => b.score - a.score);

  if (difficulty === "easy") {
    // Easy: pick randomly from top 5 moves (or fewer if less available)
    const sampleCount = Math.max(1, Math.min(5, rated.length));
    const randomIndex = Math.floor(Math.random() * sampleCount);
    return rated[randomIndex]?.move ?? rated[0]?.move ?? null;
  }

  if (difficulty === "medium") {
    // Medium: pick from top tier moves (within 40 points of best)
    const topTierScore = rated[0]?.score ?? 0;
    const threshold = topTierScore - 40;
    const candidates = rated.filter((entry) => entry.score >= threshold);
    if (candidates.length > 0) {
      // Prefer higher scored moves, but add some randomness
      const topCandidates = candidates.slice(0, Math.min(3, candidates.length));
      const randomIndex = Math.floor(Math.random() * topCandidates.length);
      return topCandidates[randomIndex]?.move ?? rated[0]?.move ?? null;
    }
    return rated[0]?.move ?? null;
  }

  // Hard: always pick the best move (no randomness)
  // If multiple moves have the same score, pick the first one
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


