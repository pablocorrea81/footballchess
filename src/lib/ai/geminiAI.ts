import { GoogleGenerativeAI } from "@google/generative-ai";
import { RuleEngine, type GameState, type Move, type PlayerId } from "@/lib/ruleEngine";

// Initialize Gemini AI
// IMPORTANT: API key must be set via GEMINI_API_KEY environment variable
// Never commit API keys to the repository
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || null;

let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

try {
  if (GEMINI_API_KEY && GEMINI_API_KEY !== "") {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    // Use gemini-2.0-flash-exp for faster, cost-effective responses
    // Can switch to gemini-2.0-flash-thinking-exp for deeper analysis
    model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    console.log("[Gemini] Gemini AI initialized successfully");
  } else {
    console.warn("[Gemini] No Gemini API key provided, Gemini AI disabled");
  }
} catch (error) {
  console.error("[Gemini] Error initializing Gemini AI:", error);
}

// Convert game state to text description for Gemini
const gameStateToText = (state: GameState, botPlayer: PlayerId): string => {
  const opponent = botPlayer === "home" ? "away" : "home";
  const botGoalRow = botPlayer === "home" ? 0 : 11;
  const opponentGoalRow = botPlayer === "home" ? 11 : 0;
  
  let description = `Football Chess Game State:
- Board: 12 rows x 8 columns
- Current Turn: ${state.turn === botPlayer ? "Yours (Bot)" : "Opponent"}
- Score: Bot ${state.score[botPlayer] || 0} - ${state.score[opponent] || 0} Opponent
- Bot plays as: ${botPlayer} (goal at row ${botGoalRow})
- Opponent plays as: ${opponent} (goal at row ${opponentGoalRow})

Board Positions:
`;

  // Describe key pieces
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row]?.[col];
      if (piece) {
        const rowLabel = botPlayer === "home" ? 12 - row : row + 1;
        const colLabel = String.fromCharCode(65 + col);
        description += `- ${piece.type.toUpperCase()} (${piece.owner}) at ${colLabel}${rowLabel}\n`;
      }
    }
  }

  description += `\nRecent Moves: ${state.history?.length || 0} moves played\n`;

  return description;
};

// Convert move to text for Gemini
const moveToText = (move: Move): string => {
  const fromRow = move.from.row + 1;
  const fromCol = String.fromCharCode(65 + move.from.col);
  const toRow = move.to.row + 1;
  const toCol = String.fromCharCode(65 + move.to.col);
  return `${fromCol}${fromRow} to ${toCol}${toRow}`;
};

// Get AI evaluation from Gemini
export const evaluateMoveWithGemini = async (
  state: GameState,
  move: Move,
  botPlayer: PlayerId,
  allMoves: Move[],
): Promise<number | null> => {
  if (!model || !GEMINI_API_KEY) {
    console.log("[Gemini] Gemini not available, skipping AI evaluation");
    return null;
  }

  try {
    const gameDescription = gameStateToText(state, botPlayer);
    const moveDescription = moveToText(move);
    const totalMoves = allMoves.length;

    const prompt = `You are an expert Football Chess AI. Analyze this move and provide a numerical score (0-10000) where:
- 10000 = Immediate goal scoring move
- 8000-9999 = Excellent strategic move (captures opponent forward, blocks opponent goal threat, advances own forward near goal)
- 5000-7999 = Good move (captures valuable piece, good positional play, defensive strength)
- 2000-4999 = Decent move (some advantage, minor progress)
- 0-1999 = Weak move (loses piece, poor position, creates threats for opponent)

Game State:
${gameDescription}

Move to evaluate: ${moveDescription}

Total legal moves available: ${totalMoves}

Respond ONLY with a number between 0-10000, nothing else.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    // Extract number from response
    const scoreMatch = text.match(/\d+/);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[0], 10);
      // Clamp to 0-10000 range
      return Math.max(0, Math.min(10000, score));
    }

    console.warn("[Gemini] Could not parse score from response:", text);
    return null;
  } catch (error) {
    console.error("[Gemini] Error evaluating move with Gemini:", error);
    return null; // Return null on error, fallback to regular AI
  }
};

// Get best move recommendation from Gemini
export const getGeminiRecommendation = async (
  state: GameState,
  moves: Move[],
  botPlayer: PlayerId,
): Promise<Move | null> => {
  if (!model || !GEMINI_API_KEY || moves.length === 0) {
    return null;
  }

  try {
    const opponent = botPlayer === "home" ? "away" : "home";
    const botGoalRow = botPlayer === "home" ? 0 : 11;
    const opponentGoalRow = botPlayer === "home" ? 11 : 0;
    
    // Check for immediate threats and goals
    const immediateGoals: number[] = [];
    const blockingMoves: number[] = [];
    const captureMoves: number[] = [];
    const forwardAdvanceMoves: number[] = [];
    
    moves.forEach((move, idx) => {
      const simulationState = { ...state, turn: botPlayer };
      const outcome = RuleEngine.applyMove(simulationState, move);
      
      // Check for immediate goal
      if (outcome.goal?.scoringPlayer === botPlayer) {
        immediateGoals.push(idx);
      }
      
      // Check for captures
      if (outcome.capture) {
        captureMoves.push(idx);
        if (outcome.capture.type === "delantero") {
          captureMoves.push(idx); // Double weight for forward captures
        }
      }
      
      // Check for forward advancement toward goal
      const piece = state.board[move.from.row]?.[move.from.col];
      if (piece?.type === "delantero") {
        const progress = botPlayer === "home" 
          ? move.from.row - move.to.row 
          : move.to.row - move.from.row;
        if (progress > 0) {
          forwardAdvanceMoves.push(idx);
        }
      }
      
      // Check if move blocks opponent goal threat (simplified check)
      const nextOpponentMoves = RuleEngine.getLegalMoves(outcome.nextState, opponent);
      let blocksThreat = false;
      for (const oppMove of nextOpponentMoves) {
        if (oppMove.to.row === botGoalRow && [3, 4].includes(oppMove.to.col)) {
          blocksThreat = true;
          break;
        }
      }
      if (blocksThreat) {
        blockingMoves.push(idx);
      }
    });
    
    // Priority: immediate goals > blocking threats > capturing forwards > forward advancement
    if (immediateGoals.length > 0) {
      console.log("[Gemini] Found immediate goal moves, selecting first");
      return moves[immediateGoals[0]];
    }
    
    if (blockingMoves.length > 0) {
      console.log("[Gemini] Found blocking moves, prioritizing defense");
      return moves[blockingMoves[0]];
    }
    
    // For non-critical situations, use Gemini for strategic evaluation
    const gameDescription = gameStateToText(state, botPlayer);
    
    // Limit moves to evaluate (save tokens)
    const movesToEvaluate = moves.slice(0, 15);
    const movesList = movesToEvaluate
      .map((move, idx) => {
        const label = `${idx + 1}. ${moveToText(move)}`;
        let extra = "";
        if (captureMoves.includes(idx)) extra += " [CAPTURE]";
        if (forwardAdvanceMoves.includes(idx)) extra += " [FORWARD PROGRESS]";
        return label + extra;
      })
      .join("\n");

    const prompt = `You are an expert Football Chess AI assistant. Analyze the game and recommend the best move.

CRITICAL PRIORITIES:
1. Block opponent goals (especially if multiple forwards target same goal column)
2. Score goals
3. Capture opponent forwards
4. Advance your forwards toward opponent goal
5. Maintain board control

Game State:
${gameDescription}

Available Moves (choose 1-${movesToEvaluate.length}):
${movesList}

Respond with ONLY the move number (1-${movesToEvaluate.length}), nothing else.`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1, // Low temperature for more deterministic responses
        maxOutputTokens: 10, // Only need a number
      },
    });
    
    const response = await result.response;
    const text = response.text().trim();
    console.log("[Gemini] Response:", text);

    // Extract move number
    const moveMatch = text.match(/\d+/);
    if (moveMatch) {
      const moveIndex = parseInt(moveMatch[0], 10) - 1;
      if (moveIndex >= 0 && moveIndex < movesToEvaluate.length) {
        return movesToEvaluate[moveIndex];
      }
    }

    console.warn("[Gemini] Could not parse move recommendation, using fallback strategy");
    // Fallback: prefer forward captures, then forward advancement
    if (captureMoves.length > 0) return moves[captureMoves[0]];
    if (forwardAdvanceMoves.length > 0) return moves[forwardAdvanceMoves[0]];
    return moves[0]; // Last resort
  } catch (error) {
    console.error("[Gemini] Error getting recommendation from Gemini:", error);
    return null;
  }
};

