import { GoogleGenerativeAI } from "@google/generative-ai";
import { RuleEngine, type GameState, type Move, type PlayerId } from "@/lib/ruleEngine";

// Initialize Gemini AI
// IMPORTANT: API key must be set via GEMINI_API_KEY environment variable in .env.local
// Never commit API keys to the repository
// For server-side: Use GEMINI_API_KEY (not public)
// For client-side: Use NEXT_PUBLIC_GEMINI_API_KEY (public - not recommended for API keys)
const getGeminiApiKey = (): string | null => {
  // Try server-side variable first (more secure)
  // In Vercel, environment variables are available via process.env
  // In local development, they're in .env.local
  if (typeof process !== 'undefined' && process.env) {
    // Prioritize GEMINI_API_KEY (server-side only, more secure)
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || null;
    
    // Debug logging (only in development)
    if (process.env.NODE_ENV === 'development') {
      if (apiKey) {
        console.log(`[Gemini] API key loaded from ${process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY' : 'NEXT_PUBLIC_GEMINI_API_KEY'}`);
      }
    }
    
    return apiKey;
  }
  return null;
};

const GEMINI_API_KEY = getGeminiApiKey();

let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

try {
  if (GEMINI_API_KEY && GEMINI_API_KEY !== "") {
    // Validate API key format (should start with AIza)
    if (GEMINI_API_KEY.startsWith("AIza")) {
      genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      // Using gemini-2.5-flash-lite - high performance and low cost
      // Ideal for high-volume tasks while maintaining good strategic reasoning
      model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      console.log("[Gemini] ✅ Gemini AI initialized successfully with 2.5 Flash-Lite model (cost-optimized)");
      console.log(`[Gemini] API key found: ${GEMINI_API_KEY.substring(0, 10)}...${GEMINI_API_KEY.substring(GEMINI_API_KEY.length - 4)}`);
    } else {
      console.warn("[Gemini] ⚠️ Invalid Gemini API key format (should start with 'AIza')");
    }
  } else {
    console.warn("[Gemini] ⚠️ No Gemini API key provided, Gemini AI disabled");
    console.warn("[Gemini] To enable Gemini AI for 'Hard' difficulty:");
    console.warn("[Gemini] 1. Create/update .env.local file in project root");
    console.warn("[Gemini] 2. Add: GEMINI_API_KEY=your_api_key_here");
    console.warn("[Gemini] 3. Get API key from: https://makersuite.google.com/app/apikey");
    console.warn("[Gemini] 4. Restart the development server after adding the key");
  }
} catch (error) {
  console.error("[Gemini] ❌ Error initializing Gemini AI:", error);
  if (error instanceof Error) {
    console.error("[Gemini] Error message:", error.message);
    console.error("[Gemini] Error stack:", error.stack);
  }
}

// Convert game state to visual board representation for Gemini
const gameStateToText = (state: GameState, botPlayer: PlayerId): string => {
  const opponent = botPlayer === "home" ? "away" : "home";
  const botGoalRow = botPlayer === "home" ? 0 : 11;
  const opponentGoalRow = botPlayer === "home" ? 11 : 0;
  
  // Create visual board representation
  let boardVisual = "\nBOARD (Rows 1-12 top to bottom, Columns A-H left to right):\n";
  boardVisual += "   A    B    C    D    E    F    G    H\n";
  
  for (let row = 0; row < 12; row++) {
    const rowNum = (row + 1).toString().padStart(2, ' ');
    boardVisual += `${rowNum} `;
    
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row]?.[col];
      if (piece) {
        // Short notation: type first letter + owner (H/A)
        const typeLetter = piece.type[0].toUpperCase();
        const ownerLetter = piece.owner === "home" ? "H" : "A";
        boardVisual += `${typeLetter}${ownerLetter}  `;
      } else {
        // Goal area markers
        if (row === botGoalRow && [3, 4].includes(col)) {
          boardVisual += "⚽B  "; // Bot goal
        } else if (row === opponentGoalRow && [3, 4].includes(col)) {
          boardVisual += "⚽O  "; // Opponent goal
        } else {
          boardVisual += ".   ";
        }
      }
    }
    boardVisual += "\n";
  }
  
  // Piece type legend
  const legend = `
PIECE TYPES:
- C = Carrilero (can move 1-2 squares horizontally/vertically, CAN SCORE)
- D = Defensa (can move 1 square any direction, CANNOT SCORE)
- M = Mediocampista (can move diagonally any distance, CAN SCORE)
- F = Delantero/Forward (can move any direction any distance, CAN SCORE)

OWNERS:
- H = Home (Bot)
- A = Away (Opponent)

GOAL AREAS:
- ⚽B = Your goal (row ${botGoalRow + 1}, columns D-E)
- ⚽O = Opponent goal (row ${opponentGoalRow + 1}, columns D-E)
`;

  // Analyze last goal received to learn from it
  let lastGoalAnalysis = "";
  if (state.history && state.history.length > 0) {
    // Find the last goal scored by opponent
    for (let i = state.history.length - 1; i >= 0; i--) {
      const move = state.history[i];
      if (move.goal?.scoringPlayer === opponent) {
        // Found opponent's goal - analyze it
        const goalCol = move.to.col;
        const goalColLabel = String.fromCharCode(65 + goalCol); // A-H
        const fromRow = move.from.row + 1;
        const fromCol = String.fromCharCode(65 + move.from.col);
        const toRow = move.to.row + 1;
        const toCol = String.fromCharCode(65 + move.to.col);
        
        // Try to determine piece type from move pattern
        const rowDiff = Math.abs(move.to.row - move.from.row);
        const colDiff = Math.abs(move.to.col - move.from.col);
        const distance = Math.max(rowDiff, colDiff);
        
        let pieceTypeEstimate = "unknown";
        if (rowDiff === colDiff && distance > 2) {
          pieceTypeEstimate = "MEDIOCAMPISTA (diagonal long)";
        } else if ((rowDiff === 0 || colDiff === 0) && distance > 2) {
          pieceTypeEstimate = "DELANTERO (straight long)";
        } else if (distance <= 2 && (rowDiff === 0 || colDiff === 0)) {
          pieceTypeEstimate = "CARRILERO (straight short)";
        } else if (distance <= 2) {
          pieceTypeEstimate = "DELANTERO (any direction short)";
        } else {
          pieceTypeEstimate = "DELANTERO (any direction)";
        }
        
        // Find previous moves that built up to this goal (last 3-5 opponent moves)
        const attackBuildUp: string[] = [];
        for (let j = Math.max(0, i - 5); j < i; j++) {
          const prevMove = state.history[j];
          if (prevMove.player === opponent) {
            const prevFromRow = prevMove.from.row + 1;
            const prevFromCol = String.fromCharCode(65 + prevMove.from.col);
            const prevToRow = prevMove.to.row + 1;
            const prevToCol = String.fromCharCode(65 + prevMove.to.col);
            attackBuildUp.push(`${prevFromCol}${prevFromRow}→${prevToCol}${prevToRow}`);
          }
        }
        
        // Analyze current board to see if opponent has similar pieces in attack positions
        const currentThreats: string[] = [];
        for (let row = 0; row < 12; row++) {
          for (let col = 0; col < 8; col++) {
            const piece = state.board[row]?.[col];
            if (piece && piece.owner === opponent && piece.type !== "defensa") {
              // Check if piece is in goal column or advancing toward goal
              const distanceToGoal = botPlayer === "home" ? row : (11 - row);
              if ((col === goalCol || [2, 5].includes(col)) && distanceToGoal <= 5) {
                const pieceRowLabel = row + 1;
                const pieceColLabel = String.fromCharCode(65 + col);
                const pieceType = piece.type === "delantero" ? "F" : 
                                 piece.type === "mediocampista" ? "M" : "C";
                currentThreats.push(`${pieceType} at ${pieceColLabel}${pieceRowLabel} (${distanceToGoal} rows from goal)`);
              }
            }
          }
        }
        
        lastGoalAnalysis = `

🚨 LAST GOAL RECEIVED - CRITICAL LEARNING OPPORTUNITY:
==========================================
The opponent JUST scored using this pattern:
- Goal column: ${goalColLabel} (${goalColLabel}${toRow})
- Attack path: ${fromCol}${fromRow} → ${toCol}${toRow}
- Piece type: ${pieceTypeEstimate}
- Attack sequence: ${attackBuildUp.length > 0 ? attackBuildUp.join(" → ") : "Direct attack"}

⚠️ PREVENT THIS FROM HAPPENING AGAIN!
${currentThreats.length > 0 ? 
  `CURRENT THREATS: Opponent has ${currentThreats.length} pieces in similar attack positions:\n${currentThreats.map(t => `  - ${t}`).join("\n")}\n` : 
  "No similar threats detected yet, but stay alert!\n"}

IMMEDIATE ACTION REQUIRED:
1. BLOCK column ${goalColLabel} - Position pieces in column ${goalColLabel} to intercept
2. CAPTURE threatening pieces - If opponent has pieces in columns D/E near goal, capture them!
3. PROTECT goal columns D-E - Keep defenders ready in rows near your goal
4. INTERCEPT attack paths - Position pieces to block the path from ${fromCol}${fromRow} direction

DO NOT let opponent use the same pattern again!
`;
        break; // Only analyze the most recent goal
      }
    }
  }

  let description = `FOOTBALL CHESS GAME STATE
======================

${boardVisual}
${legend}

GAME INFO:
- Current Turn: ${state.turn === botPlayer ? "YOUR TURN (Bot)" : "OPPONENT'S TURN"}
- Score: You ${state.score[botPlayer] || 0} - ${state.score[opponent] || 0} Opponent
- Your goal: Row ${botGoalRow + 1}, Columns D-E (⚽B)
- Opponent goal: Row ${opponentGoalRow + 1}, Columns D-E (⚽O)
- Moves played: ${state.history?.length || 0}
${lastGoalAnalysis}

RULES REMINDER:
1. Goal = Move a CARRILERO, MEDIOCAMPISTA, or DELANTERO to opponent's goal area (⚽O)
2. DEFENSAS CANNOT score goals - avoid moving them toward opponent goal unless blocking
3. DELANTEROS (F) are your best offensive pieces - advance them toward opponent goal
4. Block opponent's DELANTEROS if they're near your goal
5. Capture opponent pieces, especially DELANTEROS (F)
${lastGoalAnalysis ? "6. ⚠️ WARNING: Opponent just scored - prevent the same pattern!" : ""}
`;

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

// Decision explanation type for AI transparency
export type AIDecisionExplanation = {
  move: Move;
  reason: string;
  detectedThreats: string[];
  blockingMoves: number;
  captureMoves: number;
  goalMoves: number;
  geminiResponse?: string;
  analysis: string;
};

// Get best move recommendation from Gemini
export const getGeminiRecommendation = async (
  state: GameState,
  moves: Move[],
  botPlayer: PlayerId,
): Promise<Move | null> => {
  console.log(`[Gemini] ========== getGeminiRecommendation called ==========`);
  console.log(`[Gemini] Checking prerequisites:`);
  console.log(`  - Model available: ${!!model}`);
  console.log(`  - API key available: ${!!GEMINI_API_KEY}`);
  console.log(`  - Moves available: ${moves.length}`);
  console.log(`  - Bot player: ${botPlayer}`);
  
  if (!model) {
    console.error(`[Gemini] ❌ Model not initialized - returning null`);
    return null;
  }
  
  if (!GEMINI_API_KEY) {
    console.error(`[Gemini] ❌ API key not available - returning null`);
    return null;
  }
  
  if (moves.length === 0) {
    console.error(`[Gemini] ❌ No legal moves available - returning null`);
    return null;
  }
  
  console.log(`[Gemini] ✅ All prerequisites met, starting analysis...`);
  console.log(`[Gemini] ========== AI DECISION ANALYSIS ==========`);
  console.log(`[Gemini] Bot Player: ${botPlayer}, Total legal moves: ${moves.length}`);

  try {
    const opponent = botPlayer === "home" ? "away" : "home";
    const botGoalRow = botPlayer === "home" ? 0 : 11;
    const opponentGoalRow = botPlayer === "home" ? 11 : 0;
    
    // Analyze moves and categorize them
    const immediateGoals: number[] = [];
    const blockingMoves: number[] = [];
    const forwardCaptures: number[] = [];
    const midfielderCaptures: number[] = [];
    const forwardAdvances: number[] = [];
    const midfielderAdvances: number[] = [];
    const defensiveMoves: number[] = []; // Moves that use defensas
    const validDefensiveMoves: number[] = []; // Defensas that block or capture
    
    // First pass: Check if opponent can score on their next turn (before any move)
    const opponentCanScoreNow = (() => {
      const oppMoves = RuleEngine.getLegalMoves(state, opponent);
      for (const oppMove of oppMoves) {
        const oppSimState: GameState = { ...state, turn: opponent as PlayerId };
        try {
          const oppOutcome = RuleEngine.applyMove(oppSimState, oppMove);
          if (oppOutcome.goal?.scoringPlayer === opponent) {
            return true;
          }
        } catch (e) {
          // Invalid move, skip
        }
      }
      return false;
    })();
    
    // Detect opponent pieces that can advance directly toward goal in goal columns
    // This is CRITICAL - detect delanteros/mediocampistas advancing in columns D-E
    const opponentThreatsInGoalColumns: Array<{
      row: number;
      col: number;
      pieceType: string;
      canReachGoal: boolean;
      distanceToGoal: number;
    }> = [];
    
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = state.board[row]?.[col];
        if (piece && piece.owner === opponent && piece.type !== "defensa") {
          // Check if piece is in goal columns (D=3, E=4) or can reach them
          if ([3, 4].includes(col)) {
            const distanceToGoal = botPlayer === "home" ? row : (11 - row);
            // Check if piece can move toward goal (can reach goal in 1-2 moves)
            const piecePos = { row, col };
            const legalMoves = RuleEngine.getLegalMovesForPiece(state, piecePos);
            
            let canReachGoal = false;
            for (const moveTo of legalMoves) {
              const newDistance = botPlayer === "home" ? moveTo.row : (11 - moveTo.row);
              // If moving in same column toward goal, or can capture and reach goal
              if (moveTo.col === col && newDistance < distanceToGoal) {
                canReachGoal = true;
                break;
              }
              // Check if can reach goal squares
              if (newDistance === 0 && [3, 4].includes(moveTo.col)) {
                canReachGoal = true;
                break;
              }
            }
            
            if (distanceToGoal <= 6) { // Within 6 rows of goal
              opponentThreatsInGoalColumns.push({
                row,
                col,
                pieceType: piece.type,
                canReachGoal,
                distanceToGoal,
              });
            }
          }
        }
      }
    }
    
    moves.forEach((move, idx) => {
      const piece = state.board[move.from.row]?.[move.from.col];
      if (!piece) return;
      
      const isDefensa = piece.type === "defensa";
      const simulationState = { ...state, turn: botPlayer };
      const outcome = RuleEngine.applyMove(simulationState, move);
      
      // Check for immediate goal (highest priority)
      if (outcome.goal?.scoringPlayer === botPlayer) {
        immediateGoals.push(idx);
        return;
      }
      
      // Check if this move prevents opponent from scoring
      let preventsOpponentGoal = false;
      
      // CRITICAL: Check if this move blocks an opponent threat in goal columns
      if (opponentThreatsInGoalColumns.length > 0) {
        for (const threat of opponentThreatsInGoalColumns) {
          // Check if we capture this threatening piece
          if (outcome.capture && move.to.row === threat.row && move.to.col === threat.col) {
            preventsOpponentGoal = true;
            blockingMoves.push(idx);
            if (isDefensa) {
              validDefensiveMoves.push(idx);
            }
            return;
          }
          
          // Check if we position ourselves to block (same column, between threat and goal)
          if (move.to.col === threat.col) {
            const ourDistance = botPlayer === "home" ? move.to.row : (11 - move.to.row);
            const threatDistance = threat.distanceToGoal;
            
            // We're positioned between the threat and the goal
            if (ourDistance < threatDistance && ourDistance <= 3) {
              preventsOpponentGoal = true;
              blockingMoves.push(idx);
              if (isDefensa) {
                validDefensiveMoves.push(idx);
              }
              return;
            }
          }
          
          // Check if we move adjacent to threat in goal column (can intercept)
          if ([2, 5].includes(move.to.col) && (move.to.col === threat.col - 1 || move.to.col === threat.col + 1)) {
            const ourDistance = botPlayer === "home" ? move.to.row : (11 - move.to.row);
            if (ourDistance <= threat.distanceToGoal + 1 && threat.distanceToGoal <= 4) {
              preventsOpponentGoal = true;
              blockingMoves.push(idx);
              if (isDefensa) {
                validDefensiveMoves.push(idx);
              }
              return;
            }
          }
        }
      }
      
      if (opponentCanScoreNow) {
        // Check if after this move, opponent can still score
        const nextOpponentMoves = RuleEngine.getLegalMoves(outcome.nextState, opponent);
        let canStillScore = false;
        for (const oppMove of nextOpponentMoves) {
          const oppSimState: GameState = { ...outcome.nextState, turn: opponent as PlayerId };
          try {
            const oppOutcome = RuleEngine.applyMove(oppSimState, oppMove);
            if (oppOutcome.goal?.scoringPlayer === opponent) {
              canStillScore = true;
              break;
            }
          } catch (e) {
            // Invalid move, skip
          }
        }
        // If opponent could score before but can't after this move, we blocked it
        if (!canStillScore) {
          preventsOpponentGoal = true;
          blockingMoves.push(idx);
          if (isDefensa) {
            validDefensiveMoves.push(idx);
          }
          return;
        }
      } else {
        // Check if this move blocks a potential future goal
        const nextOpponentMoves = RuleEngine.getLegalMoves(outcome.nextState, opponent);
        for (const oppMove of nextOpponentMoves) {
          const oppSimState: GameState = { ...outcome.nextState, turn: opponent as PlayerId };
          try {
            const oppOutcome = RuleEngine.applyMove(oppSimState, oppMove);
            if (oppOutcome.goal?.scoringPlayer === opponent) {
              // Opponent can score, check if our move blocks them
              // If move is to goal row/column or captures attacking piece, it blocks
              const blocksGoal = (move.to.row === botGoalRow && [3, 4].includes(move.to.col)) ||
                                 outcome.capture !== undefined;
              if (blocksGoal) {
                preventsOpponentGoal = true;
                blockingMoves.push(idx);
                if (isDefensa) {
                  validDefensiveMoves.push(idx);
                }
                return;
              }
            }
          } catch (e) {
            // Invalid move, skip
          }
        }
      }
      
      // For defensas: only allow if blocking or capturing
      if (isDefensa) {
        if (outcome.capture) {
          // Defensa capturing is valid
          validDefensiveMoves.push(idx);
          defensiveMoves.push(idx);
          return;
        }
        // Defensas without capture or block are not valid - skip them
        defensiveMoves.push(idx);
        return; // Skip defensas that don't block or capture
      }
      
      // Categorize offensive moves by piece type and move type
      if (outcome.capture) {
        if (outcome.capture.type === "delantero") {
          forwardCaptures.push(idx);
        } else if (outcome.capture.type === "mediocampista") {
          midfielderCaptures.push(idx);
        } else if (outcome.capture.type === "carrilero") {
          // Carrilero captures are also valuable
          forwardCaptures.push(idx);
        }
      }
      
      if (piece.type === "delantero") {
        const progress = botPlayer === "home" 
          ? move.from.row - move.to.row 
          : move.to.row - move.from.row;
        if (progress > 0) {
          forwardAdvances.push(idx);
        }
      } else if (piece.type === "mediocampista") {
        const progress = botPlayer === "home" 
          ? move.from.row - move.to.row 
          : move.to.row - move.from.row;
        if (progress > 0) {
          midfielderAdvances.push(idx);
        }
      } else if (piece.type === "carrilero") {
        // Carrileros advancing toward goal
        const progress = botPlayer === "home" 
          ? move.from.row - move.to.row 
          : move.to.row - move.from.row;
        if (progress > 0) {
          forwardAdvances.push(idx);
        }
      }
    });
    
    // Priority: immediate goals > blocking > forward captures > forward advances > other captures
    console.log(`[Gemini] Move Analysis Summary:`);
    console.log(`  - Immediate goals: ${immediateGoals.length}`);
    console.log(`  - Blocking moves: ${blockingMoves.length}`);
    console.log(`  - Forward captures: ${forwardCaptures.length}`);
    console.log(`  - Forward advances: ${forwardAdvances.length}`);
    console.log(`  - Midfielder captures: ${midfielderCaptures.length}`);
    console.log(`  - Midfielder advances: ${midfielderAdvances.length}`);
    console.log(`  - Valid defensive moves: ${validDefensiveMoves.length}`);
    console.log(`  - Opponent threats in goal columns: ${opponentThreatsInGoalColumns.length}`);
    if (opponentThreatsInGoalColumns.length > 0) {
      console.log(`  - Threat details:`);
      opponentThreatsInGoalColumns.forEach((threat, i) => {
        const colLabel = String.fromCharCode(65 + threat.col);
        console.log(`    ${i + 1}. ${threat.pieceType} at ${colLabel}${threat.row + 1}, distance to goal: ${threat.distanceToGoal}, can reach: ${threat.canReachGoal}`);
      });
    }
    
    if (immediateGoals.length > 0) {
      const goalMove = moves[immediateGoals[0]];
      const moveText = moveToText(goalMove);
      console.log(`[Gemini] ✅ DECISION: Found immediate goal move - ${moveText}`);
      console.log(`[Gemini] Reason: Can score immediately!`);
      return goalMove;
    }
    
    if (blockingMoves.length > 0) {
      const blockMove = moves[blockingMoves[0]];
      const moveText = moveToText(blockMove);
      console.log(`[Gemini] 🛡️ DECISION: Found blocking move - ${moveText}`);
      console.log(`[Gemini] Reason: Must block opponent threat! ${opponentThreatsInGoalColumns.length} threat(s) detected`);
      if (opponentCanScoreNow) {
        console.log(`[Gemini] ⚠️ CRITICAL: Opponent can score next turn if not blocked!`);
      }
      return blockMove;
    }
    
    // Filter out defensive moves from consideration unless they block or capture
    // Defensas should ONLY move to block opponent goals or capture pieces
    const validMoves = moves.filter((move, idx) => {
      const piece = state.board[move.from.row]?.[move.from.col];
      if (!piece) return false;
      
      // For defensas: only include if they block goals or capture
      if (piece.type === "defensa") {
        return validDefensiveMoves.includes(idx);
      }
      // All other pieces are valid
      return true;
    });
    
    // If we have valid offensive moves, prefer those over defensive
    // Only use defensas if they're blocking/capturing or no other options
    const movesToConsider = validMoves.length > 0 ? validMoves : moves;
    const movesToEvaluate = movesToConsider.slice(0, 20); // More moves for better selection
    
    // Detect current threats on board for annotation and prompt
    const currentThreatsList: string[] = [];
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = state.board[row]?.[col];
        if (piece && piece.owner === opponent && piece.type !== "defensa") {
          if ([3, 4].includes(col)) {
            const distanceToGoal = botPlayer === "home" ? row : (11 - row);
            if (distanceToGoal <= 5) {
              const colLabel = String.fromCharCode(65 + col);
              const rowLabel = row + 1;
              const pieceType = piece.type === "delantero" ? "F" : 
                               piece.type === "mediocampista" ? "M" : "C";
              currentThreatsList.push(`${pieceType}${colLabel}${rowLabel}`);
            }
          }
        }
      }
    }
    
    // Create move list with annotations
    const gameDescription = gameStateToText(state, botPlayer);
    const movesList = movesToEvaluate
      .map((move, idx) => {
        const originalIdx = moves.indexOf(move);
        const piece = state.board[move.from.row]?.[move.from.col];
        const pieceType = piece?.type === "delantero" ? "F" : 
                         piece?.type === "mediocampista" ? "M" :
                         piece?.type === "carrilero" ? "C" : "D";
        const label = `${idx + 1}. ${moveToText(move)} (${pieceType})`;
        let extra = "";
        if (immediateGoals.includes(originalIdx)) extra += " [GOAL!]";
        else if (blockingMoves.includes(originalIdx)) extra += " [BLOCKS THREAT]";
        else if (forwardCaptures.includes(originalIdx)) {
          // Check if capture is in goal column
          const isGoalColCapture = [3, 4].includes(move.to.col);
          extra += isGoalColCapture ? " [CAPTURE F in GOAL COL] ⚠️" : " [CAPTURE F]";
        }
        else if (midfielderCaptures.includes(originalIdx)) {
          const isGoalColCapture = [3, 4].includes(move.to.col);
          extra += isGoalColCapture ? " [CAPTURE M in GOAL COL] ⚠️" : " [CAPTURE M]";
        }
        else if (forwardAdvances.includes(originalIdx)) extra += " [F ADVANCE]";
        else if (midfielderAdvances.includes(originalIdx)) extra += " [M ADVANCE]";
        
        // Check if move blocks a threat
        const moveToColLabel = String.fromCharCode(65 + move.to.col);
        if ([3, 4].includes(move.to.col)) {
          const threatsInSameCol = currentThreatsList.filter(t => t.includes(moveToColLabel));
          if (threatsInSameCol.length > 0) {
            extra += ` [BLOCKS ${moveToColLabel}]`;
          }
        }
        
        return label + extra;
      })
      .join("\n");

    const prompt = `You are an expert Football Chess AI. Your goal is to score goals while preventing opponent goals.

GAME RULES:
- Board: 12 rows x 8 columns (A-H columns, 1-12 rows)
- Goal: Move CARRILERO (C), MEDIOCAMPISTA (M), or DELANTERO (F) to opponent's goal (⚽O)
- DEFENSAS (D) CANNOT score - they only defend
- Pieces: C=Carrilero, D=Defensa, M=Mediocampista, F=Delantero
- Ownership: H=Home (You), A=Away (Opponent)

STRATEGY PRIORITIES (in order):
1. SCORE A GOAL NOW: If you can move C/M/F to opponent goal (⚽O), do it!
2. BLOCK OPPONENT GOAL (CRITICAL): If opponent can score next turn OR has pieces advancing in goal columns (D-E), BLOCK THEM!
   - Position pieces in the SAME column as attacking opponent pieces
   - Capture opponent pieces that are in goal columns (D-E) near your goal
   - Move defenders to intercept the path between opponent pieces and your goal
3. CAPTURE OPPONENT PIECES IN GOAL COLUMNS: If opponent has F/M/C in columns D or E, capture them immediately!
4. CAPTURE OPPONENT DELANTERO (F): Remove their best attacking piece
5. ADVANCE YOUR DELANTEROS (F): Move your forwards (F) toward opponent goal
6. CAPTURE VALUABLE PIECES: Capture opponent C/M pieces elsewhere
7. ADVANCE MEDIOCAMPISTAS (M): Move midfielders toward opponent goal
8. ADVANCE CARRILEROS (C): Move carrileros toward opponent goal

DEFENSE IS CRITICAL:
- If opponent has pieces in columns D or E approaching your goal, you MUST block or capture
- Don't let opponent pieces advance unchecked in goal columns!
- Watch for straight-line attacks: if opponent piece moves toward your goal in same column, intercept!

CRITICAL RULES FOR DEFENSAS (D):
- Defensas (D) CAN ONLY MOVE TO:
  * Block an opponent goal threat (position in front of goal or capture attacking piece)
  * Capture an opponent piece
- Defensas should NEVER move randomly or toward opponent goal
- Defensas cannot score goals, so only use them defensively!
- If a defensa move is available, it MUST block a goal or capture a piece

LEARNING FROM OPPONENT GOALS:
- If opponent just scored, analyze HOW they scored
- Block the SAME pattern they used - don't let them score the same way twice!
- Position defenders to intercept similar attack paths
- Capture pieces that are in attack positions similar to the last goal

IMPORTANT: 
- Focus on advancing and protecting your Delanteros (F), Mediocampistas (M), and Carrileros (C)
- Only move defensas when absolutely necessary for defense
- Learn from mistakes - if you just received a goal, prevent it from happening again!

${gameDescription}

${currentThreatsList.length > 0 ? `\n⚠️ CURRENT THREATS ON BOARD:\nOpponent pieces in goal columns: ${currentThreatsList.join(", ")}\nYou MUST block or capture these!\n` : ""}

AVAILABLE MOVES (choose the BEST strategic move):
${movesList}

REMEMBER:
- Moves marked [BLOCKS THREAT] or [BLOCKS D/E] are HIGH PRIORITY
- Moves marked [CAPTURE F/M in GOAL COL] are CRITICAL - capture pieces in goal columns!
- Don't let opponent pieces advance unchecked in columns D or E toward your goal
- If opponent just scored, prevent the SAME pattern from happening again!

Think carefully: Which move best follows the priorities above?
Respond with ONLY the move number (1-${movesToEvaluate.length}), nothing else.`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1, // Low temperature for more deterministic responses
        maxOutputTokens: 10, // Only need a number
      },
    });
    
    console.log(`[Gemini] Sending prompt to Gemini with ${movesToEvaluate.length} moves to evaluate`);
    console.log(`[Gemini] Current threats: ${currentThreatsList.length > 0 ? currentThreatsList.join(", ") : "None"}`);
    console.log(`[Gemini] Prompt length: ${prompt.length} characters`);
    
    const response = await result.response;
    const text = response.text().trim();
    console.log(`[Gemini] 📝 Raw response from Gemini: "${text}"`);

    // Extract move number
    const moveMatch = text.match(/\d+/);
    if (moveMatch) {
      const moveIndex = parseInt(moveMatch[0], 10) - 1;
      if (moveIndex >= 0 && moveIndex < movesToEvaluate.length) {
        const selectedMove = movesToEvaluate[moveIndex];
        const moveText = moveToText(selectedMove);
        const originalIdx = moves.indexOf(selectedMove);
        const piece = state.board[selectedMove.from.row]?.[selectedMove.from.col];
        const pieceType = piece?.type === "delantero" ? "F" : 
                         piece?.type === "mediocampista" ? "M" :
                         piece?.type === "carrilero" ? "C" : "D";
        
        console.log(`[Gemini] ✅ SELECTED MOVE #${moveIndex + 1}: ${moveText} (${pieceType})`);
        
        // Explain why this move was selected
        let reason = "";
        if (immediateGoals.includes(originalIdx)) {
          reason = "GOAL - Can score immediately!";
        } else if (blockingMoves.includes(originalIdx)) {
          reason = `BLOCK - Blocks opponent threat! (${opponentThreatsInGoalColumns.length} threat(s) in goal columns)`;
        } else if (forwardCaptures.includes(originalIdx)) {
          const isGoalCol = [3, 4].includes(selectedMove.to.col);
          reason = isGoalCol ? "CAPTURE FORWARD in GOAL COLUMN - Critical defensive move!" : "CAPTURE FORWARD - Removes opponent's best attacking piece";
        } else if (midfielderCaptures.includes(originalIdx)) {
          const isGoalCol = [3, 4].includes(selectedMove.to.col);
          reason = isGoalCol ? "CAPTURE MIDFIELDER in GOAL COLUMN - Important defensive move" : "CAPTURE MIDFIELDER - Removes valuable piece";
        } else if (forwardAdvances.includes(originalIdx)) {
          reason = "ADVANCE FORWARD - Moving best offensive piece toward opponent goal";
        } else if (midfielderAdvances.includes(originalIdx)) {
          reason = "ADVANCE MIDFIELDER - Progressing toward opponent goal";
        } else {
          reason = "Strategic move chosen by Gemini AI";
        }
        
        console.log(`[Gemini] 💡 REASON: ${reason}`);
        
        // Check what move was selected vs what was prioritized
        if (forwardCaptures.length > 0 && !forwardCaptures.includes(originalIdx) && !blockingMoves.includes(originalIdx)) {
          console.log(`[Gemini] ⚠️ NOTE: Other forward captures available but not selected`);
        }
        if (opponentThreatsInGoalColumns.length > 0 && !blockingMoves.includes(originalIdx)) {
          console.log(`[Gemini] ⚠️ WARNING: Threats detected but selected move doesn't block them!`);
        }
        
        console.log(`[Gemini] ==========================================`);
        
        return selectedMove;
      } else {
        console.warn(`[Gemini] ❌ Move number out of range: ${moveIndex} (Available: 0-${movesToEvaluate.length - 1})`);
      }
    }

    console.warn(`[Gemini] ⚠️ Could not parse move recommendation from response: "${text}", using fallback strategy`);
    // Fallback: prefer forward captures, then forward advancement
    console.log(`[Gemini] ⚠️ Falling back to priority-based selection (Gemini response unparseable)`);
    console.log(`[Gemini] Fallback priorities: ${forwardCaptures.length > 0 ? `Forward captures (${forwardCaptures.length})` : ""} ${forwardAdvances.length > 0 ? `Forward advances (${forwardAdvances.length})` : ""}`);
    
    if (forwardCaptures.length > 0) {
      const fallbackMove = moves[forwardCaptures[0]];
      console.log(`[Gemini] 🔄 FALLBACK: Using forward capture - ${moveToText(fallbackMove)}`);
      return fallbackMove;
    }
    if (forwardAdvances.length > 0) {
      const fallbackMove = moves[forwardAdvances[0]];
      console.log(`[Gemini] 🔄 FALLBACK: Using forward advance - ${moveToText(fallbackMove)}`);
      return fallbackMove;
    }
    if (midfielderCaptures.length > 0) {
      const fallbackMove = moves[midfielderCaptures[0]];
      console.log(`[Gemini] 🔄 FALLBACK: Using midfielder capture - ${moveToText(fallbackMove)}`);
      return fallbackMove;
    }
    if (midfielderAdvances.length > 0) {
      const fallbackMove = moves[midfielderAdvances[0]];
      console.log(`[Gemini] 🔄 FALLBACK: Using midfielder advance - ${moveToText(fallbackMove)}`);
      return fallbackMove;
    }
    // Only use defensas if they're valid (blocking/capturing)
    if (validDefensiveMoves.length > 0) {
      const fallbackMove = moves[validDefensiveMoves[0]];
      console.log(`[Gemini] 🔄 FALLBACK: Using valid defensive move - ${moveToText(fallbackMove)}`);
      return fallbackMove;
    }
    // Avoid defensive moves unless no other options
    const offensiveMoves = moves.filter((move, idx) => {
      const piece = state.board[move.from.row]?.[move.from.col];
      return piece && piece.type !== "defensa";
    });
    if (offensiveMoves.length > 0) {
      const fallbackMove = offensiveMoves[0];
      console.log(`[Gemini] 🔄 FALLBACK: Using first offensive move - ${moveToText(fallbackMove)}`);
      return fallbackMove;
    }
    console.log(`[Gemini] 🔄 FALLBACK: Last resort - using first available move - ${moveToText(moves[0])}`);
    return moves[0]; // Last resort
  } catch (error) {
    console.error(`[Gemini] ❌ ERROR getting recommendation from Gemini:`);
    console.error(`[Gemini] Error type: ${error instanceof Error ? error.constructor.name : typeof error}`);
    console.error(`[Gemini] Error message: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(`[Gemini] Error stack: ${error.stack}`);
    }
    console.error(`[Gemini] Full error object:`, error);
    return null;
  }
};

