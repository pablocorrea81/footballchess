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
import { evaluateMoveWithGemini, getGeminiRecommendation } from "@/lib/ai/geminiAI";

export type BotDifficulty = "easy" | "medium" | "hard";

export const FOOTBALL_BOT_DEFAULT_NAME = "FootballBot";
export const FOOTBALL_BOT_DEFAULT_DIFFICULTY: BotDifficulty = "easy";

type GameRow = Database["public"]["Tables"]["games"]["Row"];

const MAX_CHAINED_BOT_MOVES = 3;

const opponent = (player: PlayerId): PlayerId => (player === "home" ? "away" : "home");

const goalRowForPlayer = (player: PlayerId): number =>
  player === "home" ? 0 : BOARD_ROWS - 1;

// Adaptive learning: Track attack patterns that lead to goals
type AttackPattern = {
  goalColumn: number; // Which goal column was attacked
  piecesUsed: string[]; // What pieces were involved
  attackPositions: Array<{ row: number; col: number }>; // Positions from which attacks came
  frequency: number; // How many times this pattern led to a goal
};

// Analyze game history to learn from opponent's successful attacks
const learnFromOpponentGoals = (
  state: GameState,
  botPlayer: PlayerId,
): Map<number, AttackPattern> => {
  const patterns = new Map<number, AttackPattern>();
  const opponentPlayer = opponent(botPlayer);
  const goalRow = goalRowForPlayer(botPlayer);
  
  if (!state.history || state.history.length === 0) {
    return patterns;
  }
  
  // Analyze history to find goals scored by opponent
  // Look at the last 20-30 moves to find attack patterns
  const recentMoves = state.history.slice(-30);
  
  for (let i = 0; i < recentMoves.length; i++) {
    const move = recentMoves[i];
    
    // Check if this move resulted in a goal for the opponent
    // MoveRecord includes a 'goal' property if the move resulted in a goal
    const moveResultedInGoal = move.goal?.scoringPlayer === opponentPlayer;
    
    // Also check if move reaches goal row in goal columns (might be a goal)
    const moveReachesGoal = move.player === opponentPlayer && 
                           move.to.row === goalRow && 
                           GOAL_COLS.includes(move.to.col);
    
    if (moveResultedInGoal || moveReachesGoal) {
      const goalCol = move.to.col;
      
      // Find the attack pattern leading to this goal
      // Look at the last 3-5 moves before this goal
      const attackSequence = [];
      const piecesUsed = new Set<string>();
      
      // Trace back to find the attack buildup
      for (let j = Math.max(0, i - 5); j < i; j++) {
        const prevMove = recentMoves[j];
        if (prevMove.player === opponentPlayer) {
          attackSequence.push({ row: prevMove.from.row, col: prevMove.from.col });
          // Try to infer piece type from move pattern (approximate)
          const distance = Math.abs(prevMove.to.row - prevMove.from.row) + Math.abs(prevMove.to.col - prevMove.from.col);
          if (distance <= 2) {
            piecesUsed.add("delantero"); // Likely a forward if short move
          } else if (distance <= 4) {
            piecesUsed.add("mediocampista"); // Likely midfielder if medium move
          }
        }
      }
      
      // Record this pattern
      const existingPattern = patterns.get(goalCol);
      if (existingPattern) {
        existingPattern.frequency += 1;
        // Merge pieces used
        piecesUsed.forEach((piece) => existingPattern.piecesUsed.push(piece));
      } else {
        patterns.set(goalCol, {
          goalColumn: goalCol,
          piecesUsed: Array.from(piecesUsed),
          attackPositions: attackSequence,
          frequency: 1,
        });
      }
    }
  }
  
  return patterns;
};

// Adjust defensive threat based on learned patterns
const adjustDefensiveThreatForPatterns = (
  state: GameState,
  player: PlayerId,
  patterns: Map<number, AttackPattern>,
  baseThreatScore: number,
): number => {
  const goalRow = goalRowForPlayer(player);
  let adjustedThreat = baseThreatScore;
  
  // For each learned pattern, check if opponent is using similar tactics
  for (const [goalCol, pattern] of patterns.entries()) {
    if (pattern.frequency < 1) continue; // Only consider patterns that led to at least one goal
    
    // Check if opponent has pieces in similar positions
    const opponentPlayer = opponent(player);
    let patternMatchScore = 0;
    
    // Check if opponent has pieces in attack positions similar to learned pattern
    for (const attackPos of pattern.attackPositions) {
      const piece = state.board[attackPos.row]?.[attackPos.col];
      if (piece && piece.owner === opponentPlayer) {
        // This position is being used by opponent - potential threat!
        patternMatchScore += 1000 * pattern.frequency; // More frequent patterns = higher threat
      }
    }
    
    // Check if opponent has pieces near the goal column from the pattern
    for (let row = Math.max(0, goalRow - 4); row <= Math.min(BOARD_ROWS - 1, goalRow + 4); row++) {
      const piece = state.board[row]?.[goalCol];
      if (piece && piece.owner === opponentPlayer) {
        // Opponent has a piece in the same goal column that led to previous goals
        patternMatchScore += 1500 * pattern.frequency;
      }
    }
    
    adjustedThreat += patternMatchScore;
  }
  
  return adjustedThreat;
};

const forwardProgress = (from: Move["from"], to: Move["to"], player: PlayerId): number =>
  player === "home" ? from.row - to.row : to.row - from.row;

const positionalBonus = (to: Move["to"], player: PlayerId, pieceType?: string): number => {
  const targetRow = goalRowForPlayer(player);
  const distance = Math.abs(targetRow - to.row);
  // Reward proximity to goal; closer rows yield higher score
  // Extra bonus if in goal columns (critical for scoring)
  const columnBonus = GOAL_COLS.includes(to.col) ? 25 : 0; // Increased from 10 to 25
  // Bonus for controlling center columns (better strategic position)
  const centerBonus = to.col >= 2 && to.col <= 5 ? 3 : 0;
  
  // Extra bonus for forwards near the goal (they are the only ones that can score)
  const isDelantero = pieceType === "delantero";
  const forwardBonus = isDelantero && distance <= 3 ? (4 - distance) * 15 : 0; // Up to 45 bonus for forwards very close to goal
  
  return Math.max(0, 15 - distance) + columnBonus + centerBonus + forwardBonus;
};

// Detect if multiple opponent forwards are targeting the same goal column (CRITICAL threat)
// This is extremely dangerous because the opponent can move one forward, and if blocked, move the other
const detectMultipleForwardsThreat = (state: GameState, player: PlayerId): number => {
  const goalRow = goalRowForPlayer(player);
  const opponentPlayer = opponent(player);
  const opponentMoves = RuleEngine.getLegalMoves(state, opponentPlayer);
  
  // Map to track how many forwards can reach each goal column
  const forwardsPerGoalColumn: Record<number, number> = {};
  
  // CRITICAL: Create a simulation state with opponent's turn to apply their moves
  const simulationState: GameState = {
    ...state,
    turn: opponentPlayer,
  };
  
  // First pass: Count forwards that can reach each goal column in their next move
  for (const oppMove of opponentMoves) {
    // Ensure move player matches simulation state turn
    if (oppMove.player !== simulationState.turn) {
      continue;
    }
    
    const piece = state.board[oppMove.from.row]?.[oppMove.from.col];
    
    // Only count forwards
    if (!piece || piece.type !== "delantero") {
      continue;
    }
    
    // Check if this forward can reach a goal column directly
    if (oppMove.to.row === goalRow && GOAL_COLS.includes(oppMove.to.col)) {
      const goalCol = oppMove.to.col;
      forwardsPerGoalColumn[goalCol] = (forwardsPerGoalColumn[goalCol] || 0) + 1;
    }
  }
  
  // Second pass: Check forwards that are close and can potentially reach goal columns
  // This helps detect developing threats before they become immediate
  for (let row = 0; row < BOARD_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      const piece = state.board[row]?.[col];
      if (!piece || piece.type !== "delantero" || piece.owner !== opponentPlayer) {
        continue;
      }
      
      // Check if this forward is already counted in the first pass
      // (i.e., it has a move that reaches a goal column)
      let alreadyCounted = false;
      for (const oppMove of opponentMoves) {
        if (oppMove.player !== simulationState.turn) continue;
        if (oppMove.from.row === row && oppMove.from.col === col) {
          if (oppMove.to.row === goalRow && GOAL_COLS.includes(oppMove.to.col)) {
            alreadyCounted = true;
            break;
          }
        }
      }
      
      if (alreadyCounted) continue;
      
      // Check if forward is close to goal columns (within 3 rows)
      const distanceToGoal = Math.abs(row - goalRow);
      if (distanceToGoal <= 3 && GOAL_COLS.includes(col)) {
        // This forward is in a goal column and close - potential threat
        // Check if it has any move that gets closer to the goal
        for (const oppMove of opponentMoves) {
          if (oppMove.player !== simulationState.turn) continue;
          if (oppMove.from.row === row && oppMove.from.col === col) {
            const newDistanceToGoal = Math.abs(oppMove.to.row - goalRow);
            if (newDistanceToGoal < distanceToGoal && GOAL_COLS.includes(oppMove.to.col)) {
              // This forward can move closer to goal in a goal column - count as developing threat
              forwardsPerGoalColumn[col] = (forwardsPerGoalColumn[col] || 0) + 0.7;
              break;
            }
          }
        }
      }
    }
  }
  
  // Calculate threat score based on multiple forwards targeting same column
  let multipleThreatScore = 0;
  for (const [col, forwardCount] of Object.entries(forwardsPerGoalColumn)) {
    const count = Number(forwardCount);
    if (count >= 2) {
      // Two or more forwards targeting the same column - EXTREMELY DANGEROUS!
      // The threat multiplies because we can only block one at a time
      // Use exponential scaling: 2 forwards = 2x danger, 3 forwards = 4x danger, etc.
      const threatMultiplier = count * count; // Exponential: count^2
      multipleThreatScore += threatMultiplier * 15000; // Massive threat
      console.log(`[bot] CRITICAL THREAT: ${count.toFixed(1)} forwards targeting goal column ${col}! Score: ${threatMultiplier * 15000}`);
    } else if (count >= 1.5) {
      // One forward very close, another approaching - very dangerous
      multipleThreatScore += 10000; // Increased from 8000
      console.log(`[bot] DEVELOPING THREAT: ${count.toFixed(1)} forwards approaching goal column ${col}`);
    } else if (count >= 1.0) {
      // At least one forward can reach this column - still a threat
      multipleThreatScore += 3000; // Moderate threat
    }
  }
  
  return multipleThreatScore;
};

// Check if opponent can score a goal in their next move (CRITICAL threat)
const canOpponentScoreNextMove = (state: GameState, player: PlayerId): boolean => {
  const opponentPlayer = opponent(player);
  const opponentMoves = RuleEngine.getLegalMoves(state, opponentPlayer);
  
  // Check if any opponent move would result in a goal
  // CRITICAL: Create a simulation state with opponent's turn to apply their moves
  const simulationState: GameState = {
    ...state,
    turn: opponentPlayer,
  };
  
  for (const oppMove of opponentMoves) {
    // Ensure move player matches simulation state turn
    if (oppMove.player !== simulationState.turn) {
      console.error("[bot] ERROR in canOpponentScoreNextMove: Move player doesn't match simulation state turn!", {
        movePlayer: oppMove.player,
        simulationStateTurn: simulationState.turn,
        opponentPlayer: opponentPlayer,
      });
      continue; // Skip this move
    }
    
    const outcome = RuleEngine.applyMove(simulationState, oppMove);
    if (outcome.goal?.scoringPlayer === opponentPlayer) {
      return true; // Opponent can score on their next move!
    }
  }
  
  return false;
};

// Evaluate defensive threat (opponent pieces threatening our goal)
const defensiveThreat = (state: GameState, player: PlayerId): number => {
  const goalRow = goalRowForPlayer(player);
  let threatScore = 0;
  
  // CRITICAL: If opponent can score next move, return maximum threat score
  if (canOpponentScoreNextMove(state, player)) {
    return 100000; // Maximum threat - must be blocked!
  }
  
  // CRITICAL: Detect multiple forwards targeting same goal column - EXTREMELY DANGEROUS
  const multipleForwardsThreat = detectMultipleForwardsThreat(state, player);
  if (multipleForwardsThreat > 0) {
    threatScore += multipleForwardsThreat;
    // This is so dangerous that we should prioritize it almost as much as immediate goal threat
    // But we still check other threats below
  }
  
  // Check for opponent pieces near our goal
  const opponentPlayer = opponent(player);
  const opponentMoves = RuleEngine.getLegalMoves(state, opponentPlayer);
  
  // CRITICAL: Create a simulation state with opponent's turn to apply their moves
  const simulationState: GameState = {
    ...state,
    turn: opponentPlayer,
  };
  
  // Check if any opponent move can reach our goal row in goal columns
  for (const oppMove of opponentMoves) {
    // Ensure move player matches simulation state turn
    if (oppMove.player !== simulationState.turn) {
      console.error("[bot] ERROR in defensiveThreat: Move player doesn't match simulation state turn!", {
        movePlayer: oppMove.player,
        simulationStateTurn: simulationState.turn,
        opponentPlayer: opponentPlayer,
      });
      continue; // Skip this move
    }
    
    const outcome = RuleEngine.applyMove(simulationState, oppMove);
    // Check if move gets opponent piece to goal position
    if (oppMove.to.row === goalRow && GOAL_COLS.includes(oppMove.to.col)) {
      const piece = state.board[oppMove.from.row]?.[oppMove.from.col];
      if (piece && piece.type === "delantero") {
        // Forward in goal position - extremely dangerous!
        threatScore += 5000; // Very high threat
      } else {
        threatScore += 2000; // Still dangerous but less so
      }
    }
    // Check if opponent can get within 1 move of scoring
    const distanceToGoal = Math.abs(oppMove.to.row - goalRow);
    if (distanceToGoal <= 1 && GOAL_COLS.includes(oppMove.to.col)) {
      const piece = state.board[oppMove.from.row]?.[oppMove.from.col];
      if (piece && piece.type === "delantero") {
        threatScore += 2000; // Forward very close to goal - very dangerous
      } else if (distanceToGoal === 1) {
        threatScore += 800; // Other piece close to goal
      }
    }
  }
  
  // Also check for opponent pieces already near our goal
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
// Delanteros are MUCH more valuable - they are the only pieces that can score
const pieceValue = (pieceType: string): number => {
  switch (pieceType) {
    case "delantero":
      return 80; // Most valuable for scoring - significantly increased
    case "mediocampista":
      return 25; // Good for control and supporting forwards
    case "carrilero":
      return 18; // Versatile, can help in attack and defense
    case "defensa":
      return 12; // Defensive value
    default:
      return 12;
  }
};

// Evaluate board control (how well we control key areas)
// Forwards are especially valuable in offensive positions
const boardControl = (state: GameState, player: PlayerId): number => {
  let controlScore = 0;
  const centerRows = [5, 6]; // Middle rows
  const centerCols = [3, 4]; // Center columns
  
  // Count pieces in center (use piece values)
  for (const row of centerRows) {
    for (const col of centerCols) {
      const piece = state.board[row]?.[col];
      if (piece && piece.owner === player) {
        const pieceVal = pieceValue(piece.type);
        controlScore += pieceVal; // Use piece value instead of fixed 10
      }
    }
  }
  
  // Count pieces in opponent's half (forwards are especially valuable here)
  const opponentGoalRow = goalRowForPlayer(opponent(player));
  const playerGoalRow = goalRowForPlayer(player);
  const midfieldRow = Math.floor((opponentGoalRow + playerGoalRow) / 2);
  
  for (let row = player === "home" ? 0 : midfieldRow + 1; 
       row < (player === "home" ? midfieldRow : BOARD_ROWS); 
       row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const piece = state.board[row]?.[col];
      if (piece && piece.owner === player) {
        const pieceVal = pieceValue(piece.type);
        // Forwards in opponent's half are extremely valuable (they can score)
        const forwardBonus = piece.type === "delantero" ? 20 : 0;
        controlScore += pieceVal / 2 + forwardBonus; // Base value + forward bonus
        // Extra bonus if forward is in goal columns
        if (piece.type === "delantero" && GOAL_COLS.includes(col)) {
          controlScore += 15; // Even more valuable in goal columns
        }
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
  // Ensure state turn matches move player for simulation
  // This is important because we're rating moves for a specific player
  const simulationState: GameState = {
    ...state,
    turn: move.player,
  };
  
  // Validate that the move player matches the state turn (after setting it)
  if (simulationState.turn !== move.player) {
    console.error("[bot] ERROR in rateMove: State turn doesn't match move player after setting!", {
      stateTurn: simulationState.turn,
      movePlayer: move.player,
      originalStateTurn: state.turn,
    });
    // This should never happen, but if it does, fix it
    simulationState.turn = move.player;
  }

  const outcome = RuleEngine.applyMove(simulationState, move);
  const goal = outcome.goal?.scoringPlayer === move.player;
  const capture = Boolean(outcome.capture);
  const progress = forwardProgress(move.from, move.to, move.player);
  
  // Get piece type for value calculation
  const piece = state.board[move.from.row]?.[move.from.col];
  const pieceType = piece?.type ?? "defensa";
  const pieceVal = pieceValue(pieceType);
  const positional = positionalBonus(move.to, move.player, pieceType);

  let score = 0;
  
  // Goal is always the highest priority
  if (goal) {
    score += 10000;
  }

  // Capture with piece value consideration
  // Capturing a forward is extremely valuable (they can score)
  if (capture && outcome.capture) {
    const capturedValue = pieceValue(outcome.capture.type);
    const captureBonus = outcome.capture.type === "delantero" ? 300 : 0; // Huge bonus for capturing forwards
    score += 150 + capturedValue * 3 + captureBonus; // Increased multiplier and added forward bonus
  }

  // Progress towards goal (MUCH more important for forwards)
  if (progress > 0) {
    if (pieceType === "delantero") {
      // Forwards get massive bonus for forward progress, especially in goal columns
      const goalColumnBonus = GOAL_COLS.includes(move.to.col) ? progress * 20 : 0;
      score += progress * pieceVal + goalColumnBonus; // Full value, not divided
    } else {
      score += progress * (pieceVal / 3); // Reduced for other pieces
    }
  }

  // Positional bonus (being close to goal) - multiplied by piece value
  // Forwards get significantly more weight
  if (pieceType === "delantero") {
    score += positional * 5; // Increased multiplier for forwards
  } else {
    score += positional * 2; // Reduced for other pieces
  }

  // Defensive considerations (all difficulties now use this)
  {
    const threatBefore = defensiveThreat(state, move.player);
    const threatAfter = defensiveThreat(outcome.nextState, move.player);
    const threatReduction = threatBefore - threatAfter;
    
    // CRITICAL: If opponent can score next move, prioritize defensive moves MUCH more
    const canOpponentScoreBefore = canOpponentScoreNextMove(state, move.player);
    const canOpponentScoreAfter = canOpponentScoreNextMove(outcome.nextState, move.player);
    
    if (canOpponentScoreBefore && !canOpponentScoreAfter) {
      // This move blocks an immediate goal threat - EXTREMELY valuable!
      score += difficulty === "hard" ? 50000 : difficulty === "medium" ? 30000 : 20000;
    } else if (canOpponentScoreBefore && canOpponentScoreAfter) {
      // This move doesn't block the threat - VERY bad unless we also score
      if (!goal) {
        score -= difficulty === "hard" ? 50000 : difficulty === "medium" ? 30000 : 20000;
      }
    } else if (!canOpponentScoreBefore && canOpponentScoreAfter) {
      // This move creates a goal threat for opponent - VERY bad
      if (!goal) {
        score -= difficulty === "hard" ? 30000 : difficulty === "medium" ? 20000 : 10000;
      }
    }
    
    // Check if there's a multiple forwards threat before this move
    const multipleForwardsThreatBefore = detectMultipleForwardsThreat(state, move.player);
    const multipleForwardsThreatAfter = detectMultipleForwardsThreat(outcome.nextState, move.player);
    const multipleForwardsThreatReduction = multipleForwardsThreatBefore - multipleForwardsThreatAfter;
    
    // CRITICAL: If we're blocking a multiple forwards threat, give MASSIVE bonus
    if (multipleForwardsThreatBefore > 0 && multipleForwardsThreatReduction > 0) {
      // This move is blocking/capturing a forward that's part of a multiple threat - EXTREMELY valuable!
      // The more forwards were threatening, the more valuable this block is
      const blockBonus = multipleForwardsThreatReduction * (difficulty === "hard" ? 2 : difficulty === "medium" ? 1.5 : 1);
      score += blockBonus;
      console.log(`[bot] BLOCKING MULTIPLE FORWARDS THREAT: reduction=${multipleForwardsThreatReduction}, bonus=${blockBonus}`);
      
      // Also check if this move captures a forward that was part of the threat
      if (capture && outcome.capture && outcome.capture.type === "delantero") {
        score += difficulty === "hard" ? 20000 : difficulty === "medium" ? 15000 : 10000; // Huge bonus for capturing threatening forward
      }
    } else if (multipleForwardsThreatBefore > 0 && multipleForwardsThreatReduction <= 0) {
      // We still have the multiple forwards threat and didn't reduce it - BAD unless we scored
      if (!goal) {
        score -= difficulty === "hard" ? 25000 : difficulty === "medium" ? 15000 : 10000; // Penalty for ignoring multiple forwards threat
      }
    }
    
    // Regular threat reduction (multiplied more heavily for hard difficulty)
    // Increase multiplier if there was a multiple forwards threat
    const baseMultiplier = difficulty === "hard" ? 10 : difficulty === "medium" ? 5 : 3;
    const multiplier = multipleForwardsThreatBefore > 0 ? baseMultiplier * 1.5 : baseMultiplier;
    score += threatReduction * multiplier;
    
    // Piece safety (protecting our pieces)
    // Forwards are especially important to protect
    const safety = pieceSafety(state, move, outcome);
    const safetyMultiplier = pieceType === "delantero" 
      ? (difficulty === "hard" ? 3 : 2) // Much higher safety for forwards
      : (difficulty === "hard" ? 1.5 : 1);
    score += safety * safetyMultiplier;
    
    // Extra penalty if we're exposing ANY forward to capture (not just the one we moved)
    // Check all our forwards after the move
    const opponentPlayer = opponent(move.player);
    const opponentMoves = RuleEngine.getLegalMoves(outcome.nextState, opponentPlayer);
    
    // Find all our forwards on the board after our move
    const ourForwards: Array<{ row: number; col: number }> = [];
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        const cell = outcome.nextState.board[row]?.[col];
        if (cell && cell.owner === move.player && cell.type === "delantero") {
          ourForwards.push({ row, col });
        }
      }
    }
    
    // Check if any forward can be captured by opponent
    for (const forward of ourForwards) {
      const canBeCaptured = opponentMoves.some((oppMove) => 
        oppMove.to.row === forward.row && oppMove.to.col === forward.col
      );
      if (canBeCaptured && !goal) {
        // CRITICAL: Exposing a forward to capture is extremely bad
        // This penalty should be so high that it's almost never worth it
        score -= difficulty === "hard" ? 10000 : difficulty === "medium" ? 7500 : 5000; // Massive penalty - should prevent this move
        // Note: This will be further checked in look-ahead, but this provides immediate feedback
      }
    }
  }

  // Board control (all difficulties now use this)
  // Especially important for forwards - they should control offensive areas
  {
    const controlBefore = boardControl(state, move.player);
    const controlAfter = boardControl(outcome.nextState, move.player);
    const controlGain = controlAfter - controlBefore;
    // Forwards controlling offensive areas is more valuable
    const controlMultiplier = pieceType === "delantero" ? 3 : 2;
    score += controlGain * controlMultiplier;
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

  // Look-ahead: evaluate opponent's best response (all difficulties now use this)
  // CRITICAL: Never allow losing a forward unless it results in an immediate goal
  if (lookAhead) {
    const opponentPlayer = opponent(move.player);
    const opponentMoves = RuleEngine.getLegalMoves(outcome.nextState, opponentPlayer);
    
    if (opponentMoves.length > 0) {
      // Check all our pieces on the board after our move
      const ourPiecesAfterMove: Array<{ row: number; col: number; type: string }> = [];
      for (let row = 0; row < BOARD_ROWS; row += 1) {
        for (let col = 0; col < BOARD_COLS; col += 1) {
          const piece = outcome.nextState.board[row]?.[col];
          if (piece && piece.owner === move.player) {
            ourPiecesAfterMove.push({ row, col, type: piece.type });
          }
        }
      }
      
      // Find opponent's best move and check what they can capture
      let bestOpponentScore = -Infinity;
      let opponentCanScore = false;
      let opponentCanCapture = false;
      let opponentCanCaptureForward = false;
      let capturedForwardValue = 0;
      
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
        
        // Check if this opponent move would capture one of our forwards
        if (opponentCapture && opponentOutcome.capture) {
          const capturedPiece = ourPiecesAfterMove.find(
            (p) => p.row === opponentMove.to.row && p.col === opponentMove.to.col
          );
          if (capturedPiece && capturedPiece.type === "delantero") {
            opponentCanCaptureForward = true;
            capturedForwardValue = Math.max(capturedForwardValue, pieceValue("delantero"));
          }
        }
        
        let opponentScore = 0;
        if (opponentGoal) {
          opponentScore += 8000; // Threat of opponent goal (very dangerous)
          opponentCanScore = true;
        }
        if (opponentCapture && opponentOutcome.capture) {
          const capturedVal = pieceValue(opponentOutcome.capture.type);
          opponentScore += 150 + capturedVal * 3; // Increased multiplier
          opponentCanCapture = true;
        }
        opponentScore += opponentProgress * (opponentPieceVal / 2);
        opponentScore += positionalBonus(opponentMove.to, opponentPlayer, opponentPiece?.type) * 2;
        
        bestOpponentScore = Math.max(bestOpponentScore, opponentScore);
      }
      
      // CRITICAL: If opponent can capture a forward, this move is ALMOST ALWAYS bad
      // Exception: Only allow it if our move scored a goal (we already checked goal above)
      // But if we didn't score, this move should be heavily penalized or eliminated
      if (opponentCanCaptureForward && !goal) {
        // For hard difficulty, this should be almost impossible to overcome
        // Set score to negative infinity effectively (make it extremely negative)
        score -= difficulty === "hard" ? 50000 : difficulty === "medium" ? 30000 : 20000; // Massive penalty - should never be chosen unless absolutely necessary
        // Additionally, check if this is the ONLY move that doesn't lose (in which case we have no choice)
        // But for now, penalize it so heavily that other moves will be preferred
      } else if (opponentCanCaptureForward && goal) {
        // If we scored a goal, losing a forward might be acceptable (game resets anyway)
        // But still penalize it somewhat
        score -= 1000; // Smaller penalty since we scored
      }
      
      // CRITICAL: Heavy penalty if opponent can score on next move (unless we also scored)
      if (opponentCanScore && !goal) {
        // This is EXTREMELY bad - must be avoided at all costs
        score -= difficulty === "hard" ? 50000 : difficulty === "medium" ? 30000 : 20000;
      } else if (opponentCanScore && goal) {
        // Less bad if we also scored (game resets), but still not ideal
        score -= difficulty === "hard" ? 5000 : difficulty === "medium" ? 3000 : 2000;
      }
      
      // Penalty if opponent can capture other valuable pieces (but not forwards - handled above)
      if (opponentCanCapture && !opponentCanCaptureForward) {
        // Check what piece they can capture
        for (const opponentMove of opponentMoves) {
          const opponentOutcome = RuleEngine.applyMove(outcome.nextState, opponentMove);
          if (opponentOutcome.capture) {
            const capturedVal = pieceValue(opponentOutcome.capture.type);
            if (capturedVal >= 25) { // Mediocampista or more valuable
              score -= 500; // Penalty for losing valuable pieces
            } else {
              score -= 200; // Standard penalty for other captures
            }
          }
        }
      }
      
      // Subtract opponent's best response from our score
      // But reduce this penalty if we scored a goal (game resets)
      const opponentResponseWeight = difficulty === "hard" ? 0.8 : difficulty === "medium" ? 0.6 : 0.5;
      const adjustedWeight = goal ? opponentResponseWeight * 0.3 : opponentResponseWeight; // Less important if we scored
      score -= bestOpponentScore * adjustedWeight;
    }
  }
  
  // Deep look-ahead for medium and hard: evaluate 2 moves ahead
  // This helps the AI see deeper into the game and make better strategic decisions
  if (lookAhead && (difficulty === "medium" || difficulty === "hard")) {
    const opponentPlayer = opponent(move.player);
    const opponentMoves = RuleEngine.getLegalMoves(outcome.nextState, opponentPlayer);
    
    if (opponentMoves.length > 0) {
      // Find opponent's best move (similar to above but we'll use it for deeper analysis)
      let bestOpponentMove: Move | null = null;
      let bestOpponentScore2 = -Infinity;
      
      for (const opponentMove of opponentMoves) {
        const opponentOutcome = RuleEngine.applyMove(outcome.nextState, opponentMove);
        const opponentGoal = opponentOutcome.goal?.scoringPlayer === opponentPlayer;
        
        // Basic scoring for opponent move
        let opponentScore2 = 0;
        if (opponentGoal) {
          opponentScore2 += 8000;
        }
        if (opponentOutcome.capture) {
          const capturedVal = pieceValue(opponentOutcome.capture.type);
          opponentScore2 += 150 + capturedVal * 3;
        }
        
        if (opponentScore2 > bestOpponentScore2) {
          bestOpponentScore2 = opponentScore2;
          bestOpponentMove = opponentMove;
        }
      }
      
      // Now evaluate our best response to opponent's best move
      if (bestOpponentMove) {
        const opponentOutcome = RuleEngine.applyMove(outcome.nextState, bestOpponentMove);
        const ourMovesAfterOpponent = RuleEngine.getLegalMoves(opponentOutcome.nextState, move.player);
        
        if (ourMovesAfterOpponent.length > 0) {
          let bestOurResponse = -Infinity;
          
          for (const ourResponseMove of ourMovesAfterOpponent) {
            const ourResponseOutcome = RuleEngine.applyMove(opponentOutcome.nextState, ourResponseMove);
            const ourResponseGoal = ourResponseOutcome.goal?.scoringPlayer === move.player;
            const ourResponseCapture = Boolean(ourResponseOutcome.capture);
            const ourResponseProgress = forwardProgress(ourResponseMove.from, ourResponseMove.to, move.player);
            
            let ourResponseScore = 0;
            if (ourResponseGoal) {
              ourResponseScore += 8000; // Still high value for goals
            }
            if (ourResponseCapture && ourResponseOutcome.capture) {
              const capturedVal = pieceValue(ourResponseOutcome.capture.type);
              ourResponseScore += 100 + capturedVal * 2;
            }
            ourResponseScore += ourResponseProgress * 20;
            
            bestOurResponse = Math.max(bestOurResponse, ourResponseScore);
          }
          
          // Add bonus for moves that lead to good positions after opponent's response
          // Hard difficulty weighs this more heavily
          const deepLookAheadWeight = difficulty === "hard" ? 0.4 : 0.2;
          score += bestOurResponse * deepLookAheadWeight;
          
          // CRITICAL: Penalty if opponent can score after our move (even if we can respond)
          if (bestOpponentScore2 >= 8000 && !goal) {
            // This is VERY bad - opponent can score in 2 moves
            score -= difficulty === "hard" ? 25000 : difficulty === "medium" ? 15000 : 10000;
          }
        }
      }
    }
  }
  
  // Adaptive strategy based on score
  if (scoreDiff < 0) {
    // Losing: be more aggressive, especially with forwards
    if (progress > 0) {
      if (pieceType === "delantero") {
        score += progress * 15; // Massive bonus for forward movement with forwards
        // Extra bonus if moving forward into goal columns
        if (GOAL_COLS.includes(move.to.col)) {
          score += 50; // Huge bonus for forwards moving into goal columns
        }
      } else {
        score += progress * 5; // Standard bonus for other pieces
      }
    }
    if (capture) {
      const captureBonus = outcome.capture?.type === "delantero" ? 100 : 30;
      score += captureBonus; // Extra bonus for captures, especially forwards
    }
  } else if (scoreDiff >= 2) {
    // Winning by 2 or more: be more defensive
    const threatReduction = defensiveThreat(state, move.player) - defensiveThreat(outcome.nextState, move.player);
    score += threatReduction * 3; // Higher reward for defensive moves
    // Still allow forwards to be aggressive when winning (they're the scoring pieces)
    if (progress > 2 && pieceType !== "delantero") {
      score -= 15; // Penalty for being too aggressive when winning (except forwards)
    }
  } else {
    // Tied or winning by 1: balanced strategy
    // But still prioritize forward movement with forwards
    if (pieceType === "delantero" && progress > 0) {
      score += progress * 8; // Good bonus for forwards even when tied
      if (GOAL_COLS.includes(move.to.col) && progress >= 2) {
        score += 30; // Bonus for forwards advancing into goal columns
      }
    }
  }
  
  // Always prioritize keeping forwards in offensive positions
  // Bonus if forward is moving to a good offensive position
  if (pieceType === "delantero") {
    const targetRow = goalRowForPlayer(move.player);
    const distanceToGoal = Math.abs(targetRow - move.to.row);
    // Bonus for forwards in the opponent's half (rows 0-5 for home, rows 6-11 for away)
    const opponentHalfStart = move.player === "home" ? 0 : 6;
    const opponentHalfEnd = move.player === "home" ? 5 : 11;
    if (move.to.row >= opponentHalfStart && move.to.row <= opponentHalfEnd) {
      score += 20; // Bonus for forwards in opponent's half
    }
    // Extra bonus for forwards very close to goal (within 2 rows)
    if (distanceToGoal <= 2) {
      score += 40; // Significant bonus for forwards near goal
      if (GOAL_COLS.includes(move.to.col)) {
        score += 30; // Even more if in goal columns
      }
    }
  }

  // Add randomness based on difficulty (only for medium now, reduced)
  // Easy and Hard have no randomness for consistent play
  if (difficulty === "medium") {
    score += Math.random() * 5; // Reduced randomness for medium
  }
  // Easy and Hard have no randomness

  return { score, outcome };
};

export const pickBotMove = (
  state: GameState,
  player: PlayerId,
  difficulty: BotDifficulty = FOOTBALL_BOT_DEFAULT_DIFFICULTY,
  learnedPatterns?: Map<number, AttackPattern>, // Optional learned attack patterns (for hard difficulty)
): Move | null => {
  // CRITICAL: Ensure state turn matches player before getting legal moves
  // getLegalMoves doesn't validate turn, but we need it correct for move selection
  if (state.turn !== player) {
    console.error("[bot] ERROR in pickBotMove: State turn doesn't match player!", {
      stateTurn: state.turn,
      player: player,
    });
    // Fix the state turn
    state = {
      ...state,
      turn: player,
    };
    console.log("[bot] Fixed state turn in pickBotMove to:", state.turn);
  }
  
  const legalMoves = RuleEngine.getLegalMoves(state, player);
  if (legalMoves.length === 0) {
    return null;
  }
  
  // Verify all moves have the correct player
  const incorrectMoves = legalMoves.filter(m => m.player !== player);
  if (incorrectMoves.length > 0) {
    console.error("[bot] ERROR in pickBotMove: Found moves with incorrect player!", {
      incorrectMovesCount: incorrectMoves.length,
      expectedPlayer: player,
      sampleIncorrectMove: incorrectMoves[0],
    });
  }

  // Use look-ahead for all difficulties now (easy is now like old hard)
  const useLookAhead = true;
  
  console.log("[bot] In pickBotMove: About to rate moves. State turn:", state.turn, "Player:", player, "Legal moves count:", legalMoves.length);
  
  const rated = legalMoves.map((move, index) => {
    // Log first move to debug
    if (index === 0) {
      console.log("[bot] Rating first move:", {
        movePlayer: move.player,
        stateTurn: state.turn,
        match: move.player === state.turn,
      });
    }
    
    try {
      const result = rateMove(state, move, difficulty, useLookAhead);
      
      // For hard difficulty, adjust score based on learned attack patterns
      let adjustedScore = result.score;
      if (difficulty === "hard" && learnedPatterns && learnedPatterns.size > 0) {
        // Check if this move blocks a learned attack pattern
        const opponentPlayer = opponent(player);
        const goalRow = goalRowForPlayer(player);
        
        for (const [goalCol, pattern] of learnedPatterns.entries()) {
          if (pattern.frequency < 1) continue;
          
          // Check if this move blocks the goal column from the pattern
          if (move.to.col === goalCol && Math.abs(move.to.row - goalRow) <= 2) {
            // This move positions a piece to block the goal column from a known attack pattern
            adjustedScore += 2000 * pattern.frequency; // Bonus proportional to pattern frequency
          }
          
          // Check if this move captures or blocks an opponent piece in an attack position from the pattern
          for (const attackPos of pattern.attackPositions) {
            if (move.to.row === attackPos.row && move.to.col === attackPos.col) {
              // This move goes to a position used in a successful attack - block it!
              adjustedScore += 1500 * pattern.frequency;
              if (result.outcome.capture) {
                // This move captures a piece in an attack position from the pattern
                adjustedScore += 2500 * pattern.frequency;
              }
            }
          }
        }
      }
      
      return {
        move,
        score: adjustedScore,
        outcome: result.outcome,
      };
    } catch (error) {
      console.error("[bot] ERROR rating move in pickBotMove:", error);
      if (error instanceof Error) {
        console.error("[bot] Error message:", error.message);
        console.error("[bot] Error stack:", error.stack);
      }
      // Return a low score for this move so it won't be selected
      return {
        move,
        score: -Infinity,
        outcome: RuleEngine.applyMove({ ...state, turn: move.player }, move),
      };
    }
  });

  // Filter out moves that would result in losing a forward (unless they score a goal)
  // This is a hard filter for all difficulties now
  const safeMoves = rated.filter((entry) => {
    // If the move scores a goal, allow it (game resets anyway)
    const outcome = entry.outcome;
    if (outcome.goal?.scoringPlayer === player) {
      return true; // Always allow moves that score
    }
    
    // Filter out moves that would lose a forward
    // Check if opponent can capture a forward after this move
    const opponentPlayer = player === "home" ? "away" : "home";
    const opponentMoves = RuleEngine.getLegalMoves(outcome.nextState, opponentPlayer);
    
    // Find all our forwards after the move
    const ourForwards: Array<{ row: number; col: number }> = [];
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        const cell = outcome.nextState.board[row]?.[col];
        if (cell && cell.owner === player && cell.type === "delantero") {
          ourForwards.push({ row, col });
        }
      }
    }
    
    // Check if any forward can be captured
    for (const forward of ourForwards) {
      const canBeCaptured = opponentMoves.some((oppMove) => 
        oppMove.to.row === forward.row && oppMove.to.col === forward.col
      );
      if (canBeCaptured) {
        return false; // Filter out this move - it would lose a forward
      }
    }
    
    return true; // Keep the move
  });

  // If we filtered out all moves (shouldn't happen, but just in case), use all moves
  const movesToConsider = safeMoves.length > 0 ? safeMoves : rated;
  
  // Sort by score (highest first)
  movesToConsider.sort((a, b) => b.score - a.score);

  if (difficulty === "easy") {
    // Easy: now picks the best move (like old hard) - no randomness
    // If multiple moves have similar scores (within 10 points), pick randomly from top tier
    const bestScore = movesToConsider[0]?.score ?? 0;
    const topTier = movesToConsider.filter((entry) => entry.score >= bestScore - 10);
    if (topTier.length > 1) {
      const randomIndex = Math.floor(Math.random() * topTier.length);
      return topTier[randomIndex]?.move ?? movesToConsider[0]?.move ?? null;
    }
    return movesToConsider[0]?.move ?? null;
  }

  if (difficulty === "medium") {
    // Medium: pick from top tier moves (within 30 points of best, reduced from 40)
    // With reduced randomness, this makes it more consistent
    const topTierScore = movesToConsider[0]?.score ?? 0;
    const threshold = topTierScore - 30;
    const candidates = movesToConsider.filter((entry) => entry.score >= threshold);
    if (candidates.length > 0) {
      // Prefer higher scored moves, but add some randomness (reduced)
      const topCandidates = candidates.slice(0, Math.min(2, candidates.length)); // Reduced from 3 to 2
      const randomIndex = Math.floor(Math.random() * topCandidates.length);
      return topCandidates[randomIndex]?.move ?? movesToConsider[0]?.move ?? null;
    }
    return movesToConsider[0]?.move ?? null;
  }

  // Hard: always pick the best move (no randomness)
  // With deeper look-ahead, this will make even better decisions
  return movesToConsider[0]?.move ?? null;
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
  winningScore: number = 3,
): string | null => {
  const goalsForMover = outcome.nextState.score[move.player] ?? 0;
  if (goalsForMover < winningScore) {
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
         bot_display_name,
         winning_score`,
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

    let currentState = parseGameState(game);
    console.log("[bot] Parsed game state (initial):", {
      turn: currentState.turn,
      score: currentState.score,
      historyLength: currentState.history?.length ?? 0,
      startingPlayer: currentState.startingPlayer,
    });
    console.log("[bot] Current turn:", currentState.turn, "Bot player:", botPlayer);
    console.log("[bot] Raw game_state from DB:", JSON.stringify(game.game_state)?.substring(0, 500));
    
    // Extract turn from raw game_state to verify it matches parsed state
    const rawGameState = game.game_state as { turn?: string } | null | undefined;
    const rawTurn = rawGameState?.turn;
    console.log("[bot] Raw turn from game_state:", rawTurn, "Parsed turn:", currentState.turn);
    
    console.log("[bot] Game state turn check:", {
      rawTurn: rawTurn,
      parsedTurn: currentState.turn,
      botPlayer: botPlayer,
      isBotTurn: currentState.turn === botPlayer,
      gameStatus: game.status,
      isBotGame: game.is_bot_game,
    });

    // CRITICAL: Ensure state turn matches bot player BEFORE any checks
    // This fixes potential desynchronization between DB and parsed state
    if (currentState.turn !== botPlayer) {
      // If it's not the bot's turn, we shouldn't proceed
      // But first, check if the raw game_state has the correct turn
      if (rawTurn === botPlayer) {
        console.warn("[bot] WARNING: Parsed state has wrong turn, but raw game_state is correct. Fixing parsed state...", {
          parsedTurn: currentState.turn,
          rawTurn: rawTurn,
          botPlayer: botPlayer,
        });
        // Create a new state object with the correct turn
        currentState = {
          ...currentState,
          turn: botPlayer,
        };
      } else {
        console.log("[bot] ❌ Not bot's turn. Current turn:", currentState.turn, "Raw turn:", rawTurn, "Expected:", botPlayer);
        console.log("[bot] Bot will not execute. Waiting for turn to change.");
        return;
      }
    }

    console.log("[bot] ✅ Bot's turn confirmed! Proceeding with move selection...");
    
    // CRITICAL: Ensure state turn matches bot player BEFORE selecting move
    // getLegalMoves doesn't validate turn, so we need to ensure it's correct
    if (currentState.turn !== botPlayer) {
      console.error("[bot] CRITICAL ERROR: State turn doesn't match bot player before move selection!", {
        stateTurn: currentState.turn,
        botPlayer: botPlayer,
      });
      // Force fix - create a new state object with correct turn
      currentState = {
        ...currentState,
        turn: botPlayer,
      };
      console.log("[bot] Force-fixed state turn to match bot player before move selection");
    }
    
    // Double-check before proceeding
    if (currentState.turn !== botPlayer) {
      console.error("[bot] FATAL: Cannot proceed - state turn still doesn't match bot player after fix!", {
        stateTurn: currentState.turn,
        botPlayer: botPlayer,
      });
      return;
    }
    
    const difficulty =
      (game.bot_difficulty as BotDifficulty | null) ??
      FOOTBALL_BOT_DEFAULT_DIFFICULTY;

    console.log("[bot] Calling pickBotMove with state.turn:", currentState.turn, "botPlayer:", botPlayer);
    
    // For hard difficulty, use Gemini AI for better evaluation
    let move: Move | null = null;
    if (difficulty === "hard") {
      try {
        const legalMoves = RuleEngine.getLegalMoves(currentState, botPlayer);
        if (legalMoves.length > 0) {
          console.log("[bot] Using Gemini AI to evaluate moves for hard difficulty");
          
          // Get Gemini recommendation
          const geminiRecommendedMove = await getGeminiRecommendation(
            currentState,
            legalMoves,
            botPlayer,
          );
          
          if (geminiRecommendedMove) {
            console.log("[bot] Gemini recommended move:", geminiRecommendedMove);
            move = geminiRecommendedMove;
          } else {
            // Fallback to regular AI if Gemini fails
            console.log("[bot] Gemini recommendation failed, falling back to regular AI");
            const learnedPatterns = learnFromOpponentGoals(currentState, botPlayer);
            move = pickBotMove(currentState, botPlayer, difficulty, learnedPatterns);
          }
        }
      } catch (error) {
        console.error("[bot] Error using Gemini, falling back to regular AI:", error);
        // Fallback to regular AI on error
        const learnedPatterns = learnFromOpponentGoals(currentState, botPlayer);
        move = pickBotMove(currentState, botPlayer, difficulty, learnedPatterns);
      }
    } else {
      // For easy and medium, use regular AI (no Gemini, no learned patterns)
      move = pickBotMove(currentState, botPlayer, difficulty, undefined);
    }

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
          turn_started_at: new Date().toISOString(), // Update turn_started_at when turn changes
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
    console.log("[bot] Verifying state before applyMove:", {
      stateTurn: currentState.turn,
      movePlayer: move.player,
      botPlayer: botPlayer,
      match: currentState.turn === move.player,
      movePlayerMatchesBot: move.player === botPlayer,
    });
    
    // CRITICAL: Ensure state turn matches move player before applying
    // Create a new state object to avoid mutation issues
    if (currentState.turn !== move.player || move.player !== botPlayer) {
      console.error("[bot] ERROR: State turn or move player mismatch!", {
        stateTurn: currentState.turn,
        movePlayer: move.player,
        botPlayer: botPlayer,
      });
      
      // Verify move.player matches botPlayer (it should, but let's be safe)
      if (move.player !== botPlayer) {
        console.error("[bot] CRITICAL: Move player doesn't match bot player! This should never happen.");
        // Skip this move and continue to next iteration
        return;
      }
      
      // Create a new state object with the correct turn
      currentState = {
        ...currentState,
        turn: move.player,
      };
      console.log("[bot] Created new state object with correct turn:", move.player);
    }
    
    // Final verification before applying move
    if (currentState.turn !== move.player || move.player !== botPlayer) {
      console.error("[bot] CRITICAL ERROR: Cannot apply move - state/move mismatch persists!", {
        stateTurn: currentState.turn,
        movePlayer: move.player,
        botPlayer: botPlayer,
      });
      return;
    }
    
    console.log("[bot] All validations passed. Applying move...");
    console.log("[bot] Final state check before applyMove:", {
      stateTurn: currentState.turn,
      movePlayer: move.player,
      botPlayer: botPlayer,
      stateTurnMatchesMovePlayer: currentState.turn === move.player,
      movePlayerMatchesBotPlayer: move.player === botPlayer,
    });
    
    // One final check - if anything is off, fix it
    if (currentState.turn !== move.player) {
      console.error("[bot] FINAL FIX: State turn doesn't match move player right before applyMove! Fixing...", {
        stateTurn: currentState.turn,
        movePlayer: move.player,
      });
      currentState = {
        ...currentState,
        turn: move.player,
      };
      console.log("[bot] Fixed state turn to:", currentState.turn);
    }
    
    const outcome = RuleEngine.applyMove(currentState, move);
    let nextStatus = game.status;
    let winnerId = game.winner_id;
    
    // Get winning_score from game (default to 3 if not set)
    const winningScore = (game.winning_score as number | null) ?? 3;

    if (outcome.goal?.scoringPlayer === botPlayer) {
      console.log("[bot] Bot scored a goal! Score:", outcome.nextState.score, "Winning score:", winningScore);
      nextStatus = outcome.nextState.score[botPlayer] >= winningScore ? "finished" : "in_progress";
      if (nextStatus === "finished") {
        winnerId = resolveWinnerId(move, outcome, game, winningScore);
        console.log("[bot] Game finished! Winner:", winnerId);
      }
    }

    try {
      // Check if turn changed (it should always change after a move)
      const turnChanged = currentState.turn !== outcome.nextState.turn;
      
      const updatePayload: Record<string, unknown> = {
        game_state: outcome.nextState as unknown as Database["public"]["Tables"]["games"]["Row"]["game_state"],
        score: outcome.nextState.score as unknown as Database["public"]["Tables"]["games"]["Row"]["score"],
        status: nextStatus,
        winner_id: winnerId,
      };
      
      // Update turn_started_at when turn changes
      if (turnChanged) {
        updatePayload.turn_started_at = new Date().toISOString();
        console.log("[bot] Turn changed from", currentState.turn, "to", outcome.nextState.turn, "- updating turn_started_at");
      }
      
      // Set finished_at when game finishes
      if (nextStatus === "finished") {
        updatePayload.finished_at = new Date().toISOString();
        console.log("[bot] Game finished, setting finished_at:", updatePayload.finished_at);
      }
      
      console.log("[bot] Updating game with payload:", JSON.stringify({
        status: nextStatus,
        winner_id: winnerId,
        score: outcome.nextState.score,
        game_state_turn: outcome.nextState.turn,
        turn_started_at: updatePayload.turn_started_at,
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


