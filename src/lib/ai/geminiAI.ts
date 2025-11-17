import { GoogleGenerativeAI } from "@google/generative-ai";
import { RuleEngine, type GameState, type Move, type PlayerId } from "@/lib/ruleEngine";

// Initialize Gemini AI
// IMPORTANT: API key must be set via GEMINI_API_KEY environment variable in .env.local
// Never commit API keys to the repository
// For server-side: Use GEMINI_API_KEY (not public)
// For client-side: Use NEXT_PUBLIC_GEMINI_API_KEY (public - not recommended for API keys)
// Lazy initialization - initialize model when needed, not at module load
// This ensures environment variables are available (important for Vercel)
let genAI: GoogleGenerativeAI | null = null;
let model: any = null;
let initializationAttempted = false;

const getGeminiApiKey = (): string | null => {
  // Try server-side variable first (more secure)
  // In Vercel, environment variables are available via process.env
  // In local development, they're in .env.local
  if (typeof process !== 'undefined' && process.env) {
    // Prioritize GEMINI_API_KEY (server-side only, more secure)
    const hasGeminiKey = !!process.env.GEMINI_API_KEY;
    const hasPublicKey = !!process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || null;
    
    // Enhanced debug logging
    console.log(`[Gemini] Environment variable check:`);
    console.log(`  - process.env exists: ${!!process.env}`);
    console.log(`  - GEMINI_API_KEY exists: ${hasGeminiKey}`);
    console.log(`  - NEXT_PUBLIC_GEMINI_API_KEY exists: ${hasPublicKey}`);
    if (hasGeminiKey) {
      console.log(`  - GEMINI_API_KEY length: ${process.env.GEMINI_API_KEY?.length || 0}`);
      console.log(`  - GEMINI_API_KEY starts with: ${process.env.GEMINI_API_KEY?.substring(0, 5) || 'N/A'}`);
    }
    
    if (apiKey) {
      const source = hasGeminiKey ? 'GEMINI_API_KEY' : 'NEXT_PUBLIC_GEMINI_API_KEY';
      console.log(`[Gemini] ✅ API key loaded from ${source} (${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)})`);
    } else {
      console.warn(`[Gemini] ⚠️ No API key found in process.env`);
      console.warn(`[Gemini] In Vercel, make sure GEMINI_API_KEY is set in Environment Variables`);
      console.warn(`[Gemini] Go to: Settings → Environment Variables → Add GEMINI_API_KEY`);
    }
    
    return apiKey;
  }
  console.warn("[Gemini] process.env not available");
  return null;
};

const initializeGemini = (): void => {
  // Only initialize once
  if (initializationAttempted) {
    return;
  }
  initializationAttempted = true;

  try {
    const apiKey = getGeminiApiKey();
    
    if (apiKey && apiKey !== "") {
      // Validate API key format (should start with AIza)
      if (apiKey.startsWith("AIza")) {
        genAI = new GoogleGenerativeAI(apiKey);
        // Using gemini-2.5-flash - better strategic reasoning than Flash-Lite
        // Optimized for complex decision-making in games like Football Chess
        // Slightly higher cost than Flash-Lite but significantly better decision quality
        model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        console.log("[Gemini] ✅ Gemini AI initialized successfully with 2.5 Flash model (enhanced reasoning)");
        console.log(`[Gemini] API key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
      } else {
        console.warn("[Gemini] ⚠️ Invalid Gemini API key format (should start with 'AIza')");
        console.warn(`[Gemini] Key starts with: ${apiKey.substring(0, 5)}`);
      }
    } else {
      console.warn("[Gemini] ⚠️ No Gemini API key provided, Gemini AI disabled");
      console.warn("[Gemini] To enable Gemini AI for 'Hard' difficulty:");
      console.warn("[Gemini] 1. Set GEMINI_API_KEY in Vercel Environment Variables (Production/Preview/Development)");
      console.warn("[Gemini] 2. Or add to .env.local for local development");
      console.warn("[Gemini] 3. Get API key from: https://makersuite.google.com/app/apikey");
      console.warn("[Gemini] 4. Redeploy after adding the variable");
    }
  } catch (error) {
    console.error("[Gemini] ❌ Error initializing Gemini AI:", error);
    if (error instanceof Error) {
      console.error("[Gemini] Error message:", error.message);
      console.error("[Gemini] Error stack:", error.stack);
    }
  }
};

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

  // Calculate position evaluation and strategic information
  let positionEvaluation = "";
  let pieceCount = { bot: { c: 0, d: 0, m: 0, f: 0 }, opp: { c: 0, d: 0, m: 0, f: 0 } };
  let controlOfGoalColumns = { bot: 0, opp: 0 };
  let piecesNearOpponentGoal = { bot: 0, opp: 0 };
  let piecesNearOwnGoal = { bot: 0, opp: 0 };
  
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row]?.[col];
      if (piece) {
        const isBotPiece = piece.owner === botPlayer;
        const distanceToOppGoal = botPlayer === "home" ? (11 - row) : row;
        const distanceToOwnGoal = botPlayer === "home" ? row : (11 - row);
        
        // Count pieces
        const pieceType = piece.type === "carrilero" ? "c" :
                         piece.type === "defensa" ? "d" :
                         piece.type === "mediocampista" ? "m" : "f";
        if (isBotPiece) {
          pieceCount.bot[pieceType as keyof typeof pieceCount.bot]++;
        } else {
          pieceCount.opp[pieceType as keyof typeof pieceCount.opp]++;
        }
        
        // Control of goal columns (D-E = columns 3-4)
        if ([3, 4].includes(col)) {
          if (distanceToOwnGoal <= 3) {
            if (isBotPiece) controlOfGoalColumns.bot++;
            else controlOfGoalColumns.opp++;
          }
        }
        
        // Pieces near opponent goal (within 4 rows)
        if (distanceToOppGoal <= 4 && piece.type !== "defensa") {
          if (isBotPiece) piecesNearOpponentGoal.bot++;
          else piecesNearOpponentGoal.opp++;
        }
        
        // Pieces near own goal (within 3 rows) - defensive presence
        if (distanceToOwnGoal <= 3) {
          if (isBotPiece) piecesNearOwnGoal.bot++;
          else piecesNearOwnGoal.opp++;
        }
      }
    }
  }
  
  // Strategic assessment
  const pieceAdvantage = (pieceCount.bot.f + pieceCount.bot.m + pieceCount.bot.c) - 
                        (pieceCount.opp.f + pieceCount.opp.m + pieceCount.opp.c);
  const offensiveAdvantage = piecesNearOpponentGoal.bot - piecesNearOpponentGoal.opp;
  const defensiveAdvantage = piecesNearOwnGoal.bot - piecesNearOwnGoal.opp;
  const goalColumnControl = controlOfGoalColumns.bot - controlOfGoalColumns.opp;
  
  positionEvaluation = `
POSITION EVALUATION:
====================
Material:
- Your pieces: ${pieceCount.bot.f}F + ${pieceCount.bot.m}M + ${pieceCount.bot.c}C + ${pieceCount.bot.d}D = ${pieceCount.bot.f + pieceCount.bot.m + pieceCount.bot.c + pieceCount.bot.d} total
- Opponent pieces: ${pieceCount.opp.f}F + ${pieceCount.opp.m}M + ${pieceCount.opp.c}C + ${pieceCount.opp.d}D = ${pieceCount.opp.f + pieceCount.opp.m + pieceCount.opp.c + pieceCount.opp.d} total
- Material advantage: ${pieceAdvantage > 0 ? `+${pieceAdvantage} for you` : pieceAdvantage < 0 ? `${pieceAdvantage} (opponent ahead)` : "equal"}

Positional:
- Pieces near opponent goal: You ${piecesNearOpponentGoal.bot} vs Opponent ${piecesNearOpponentGoal.opp} (${offensiveAdvantage > 0 ? "You have attack advantage" : offensiveAdvantage < 0 ? "Opponent has attack advantage" : "Balanced"})
- Pieces near your goal: You ${piecesNearOwnGoal.bot} vs Opponent ${piecesNearOwnGoal.opp} (${defensiveAdvantage > 0 ? "Good defense" : defensiveAdvantage < 0 ? "Weak defense - reinforce!" : "Balanced"})
- Control of goal columns (D-E near goal): You ${controlOfGoalColumns.bot} vs Opponent ${controlOfGoalColumns.opp} (${goalColumnControl > 0 ? "You control goal columns" : goalColumnControl < 0 ? "Opponent controls goal columns - CRITICAL!" : "Contested"})

Strategic Status:
${offensiveAdvantage > 0 ? "✅ You have attacking initiative - press the advantage!" : ""}
${offensiveAdvantage < 0 ? "⚠️ Opponent has more pieces near your goal - focus on defense!" : ""}
${goalColumnControl < 0 ? "🚨 OPPONENT CONTROLS GOAL COLUMNS - THIS IS DANGEROUS! Block/capture immediately!" : ""}
${piecesNearOwnGoal.bot < 3 ? "⚠️ Your goal area is lightly defended - position defenders!" : ""}
`;

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
${positionEvaluation}
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
  // Initialize lazily if needed
  initializeGemini();
  
  const apiKey = getGeminiApiKey();
  if (!model || !apiKey) {
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
  isPro: boolean = false, // Pro level gets enhanced features
): Promise<Move | null> => {
  // Initialize lazily when first needed (ensures env vars are loaded in Vercel)
  initializeGemini();
  
  console.log(`[Gemini] ========== getGeminiRecommendation called ==========`);
  const apiKey = getGeminiApiKey();
  console.log(`[Gemini] Checking prerequisites:`);
  console.log(`  - Model available: ${!!model}`);
  console.log(`  - API key available: ${!!apiKey}`);
  console.log(`  - Moves available: ${moves.length}`);
  console.log(`  - Bot player: ${botPlayer}`);
  
  if (!model) {
    console.error(`[Gemini] ❌ Model not initialized - returning null`);
    console.error(`[Gemini] This usually means GEMINI_API_KEY is not set in Vercel environment variables`);
    return null;
  }
  
  if (!apiKey) {
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
    const riskyMoves: number[] = []; // Moves that expose our valuable pieces to capture
    const movesAllowingGoal: number[] = []; // Moves that allow opponent to score a goal (CRITICAL RISK!)
    
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
    
    // Detect opponent pieces that can advance directly toward goal
    // CRITICAL: Detect pieces advancing in ANY column toward goal, not just D-E
    // A delantero can move to goal columns D-E from any column!
    const opponentThreats: Array<{
      row: number;
      col: number;
      pieceType: string;
      canReachGoal: boolean;
      distanceToGoal: number;
      isInGoalColumn: boolean;
      canMoveToGoalColumn: boolean;
    }> = [];
    
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = state.board[row]?.[col];
        if (piece && piece.owner === opponent && piece.type !== "defensa") {
          const distanceToGoal = botPlayer === "home" ? row : (11 - row);
          const piecePos = { row, col };
          const legalMoves = RuleEngine.getLegalMovesForPiece(state, piecePos);
          
          const isInGoalColumn = [3, 4].includes(col);
          let canReachGoal = false;
          let canMoveToGoalColumn = false;
          
          // Check if piece can move toward goal or to goal columns
          for (const moveTo of legalMoves) {
            const newDistance = botPlayer === "home" ? moveTo.row : (11 - moveTo.row);
            
            // If moving in same column toward goal (advancing)
            if (moveTo.col === col && newDistance < distanceToGoal) {
              canReachGoal = true;
            }
            
            // If can reach goal squares (row 0 or 11 in columns D-E)
            if (newDistance === 0 && [3, 4].includes(moveTo.col)) {
              canReachGoal = true;
            }
            
            // If can move to goal columns (D or E) from current position
            if ([3, 4].includes(moveTo.col) && newDistance <= distanceToGoal + 2) {
              canMoveToGoalColumn = true;
            }
          }
          
          // Consider a threat if:
          // 1. In goal column and within 6 rows of goal
          // 2. Can move to goal column and within 5 rows of goal (delanteros can move long distances)
          // 3. Advancing in same column toward goal (within 4 rows)
          const isThreat = (isInGoalColumn && distanceToGoal <= 6) ||
                          (canMoveToGoalColumn && distanceToGoal <= 5) ||
                          (canReachGoal && distanceToGoal <= 4);
          
          if (isThreat) {
            opponentThreats.push({
              row,
              col,
              pieceType: piece.type,
              canReachGoal,
              distanceToGoal,
              isInGoalColumn,
              canMoveToGoalColumn,
            });
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
      
      // CRITICAL: Check if this move blocks an opponent threat
      if (opponentThreats.length > 0) {
        for (const threat of opponentThreats) {
          // Check if we capture this threatening piece
          if (outcome.capture && move.to.row === threat.row && move.to.col === threat.col) {
            preventsOpponentGoal = true;
            blockingMoves.push(idx);
            if (isDefensa) {
              validDefensiveMoves.push(idx);
            }
            return;
          }
          
          // CRITICAL: For threats in goal columns (D/E) or very close (distance <= 2), 
          // ANY defensive positioning in goal rows/columns should be considered blocking
          const threatRow = threat.row;
          const threatCol = threat.col;
          const botGoalRow = botPlayer === "home" ? 11 : 0; // Home goal is row 11, Away goal is row 0
          const ourRow = move.to.row;
          const ourCol = move.to.col;
          const ourDistance = botPlayer === "home" ? (11 - ourRow) : ourRow;
          
          // Determine if threat is very close to our goal area
          // For "home" bot: threats near row 0-1 are close (opponent advancing from their side)
          // For "away" bot: threats near row 10-11 are close (opponent advancing from their side)
          const isThreatInGoalCol = [3, 4].includes(threatCol);
          const isThreatVeryClose = (botPlayer === "home" && (threatRow <= 1 || threatRow >= 10)) ||
                                    (botPlayer === "away" && (threatRow >= 10 || threatRow <= 1));
          
          // Defensive rows: rows near our goal where we want to position defenders
          const defensiveRows = botPlayer === "home" ? [9, 10, 11] : [0, 1, 2];
          
          // Block if we move to goal columns (D/E) when threat is close
          if ((isThreatInGoalCol || threat.canMoveToGoalColumn) && isThreatVeryClose) {
            if ([3, 4].includes(ourCol) && (defensiveRows.includes(ourRow) || ourDistance <= 3)) {
              preventsOpponentGoal = true;
              blockingMoves.push(idx);
              if (isDefensa) {
                validDefensiveMoves.push(idx);
              }
              return;
            }
          }
          
          // Check if we position ourselves to block (same column, between threat and goal)
          if (move.to.col === threat.col) {
            const threatDistance = threat.distanceToGoal;
            
            // We're positioned between the threat and the goal OR very close to goal to intercept
            if ((ourDistance < threatDistance && ourDistance <= 3) || 
                (ourDistance <= 2 && threatDistance <= 2)) {
              preventsOpponentGoal = true;
              blockingMoves.push(idx);
              if (isDefensa) {
                validDefensiveMoves.push(idx);
              }
              return;
            }
          }
          
          // Check if we move to goal columns to block threat that can reach them
          if (threat.canMoveToGoalColumn && [3, 4].includes(move.to.col)) {
            // Position in goal column to intercept - more lenient for close threats
            if (ourDistance <= Math.max(threat.distanceToGoal + 1, 3) && ourDistance <= 4) {
              preventsOpponentGoal = true;
              blockingMoves.push(idx);
              if (isDefensa) {
                validDefensiveMoves.push(idx);
              }
              return;
            }
          }
          
          // Check if we move adjacent to threat (can intercept from any column)
          // For defensas: only allow if threat is in goal column OR we're moving to goal column
          // This prevents defensas from moving to lateral columns unnecessarily
          if (Math.abs(move.to.col - threat.col) === 1) {
            if (isDefensa) {
              const threatInGoalCol = [3, 4].includes(threatCol);
              const weInGoalCol = [3, 4].includes(ourCol);
              // Defensas should only block adjacent threats if they're in goal columns or we're in goal columns
              if (threatInGoalCol || weInGoalCol) {
                if (threat.distanceToGoal <= 2 && ourDistance <= 3) {
                  preventsOpponentGoal = true;
                  blockingMoves.push(idx);
                  validDefensiveMoves.push(idx);
                  return;
                } else if (ourDistance <= threat.distanceToGoal + 1 && threat.distanceToGoal <= 4) {
                  preventsOpponentGoal = true;
                  blockingMoves.push(idx);
                  validDefensiveMoves.push(idx);
                  return;
                }
              }
            } else {
              // For other pieces, allow adjacent blocking
              if (threat.distanceToGoal <= 2 && ourDistance <= 3) {
                preventsOpponentGoal = true;
                blockingMoves.push(idx);
                return;
              } else if (ourDistance <= threat.distanceToGoal + 1 && threat.distanceToGoal <= 4) {
                preventsOpponentGoal = true;
                blockingMoves.push(idx);
                return;
              }
            }
          }
          
          // NEW: For threats in rows 10-11 (very close to opponent's goal area), 
          // any move to defensive rows in same or adjacent columns should block
          // Bot "away" has goal at row 0, so threats at row 10-11 are close
          // Bot "home" has goal at row 11, so threats at row 0-1 are close
          // (defensiveRows already defined above)
          // BUT: For defensas, be more strict - only allow if threat is in goal columns or we're in goal columns
          
          if (isThreatVeryClose && defensiveRows.includes(ourRow)) {
            const colDiff = Math.abs(ourCol - threatCol);
            // For defensas: only allow if threat is in goal column OR we're moving to goal column
            // This prevents defensas from moving to lateral columns (F/G/H) when threat is elsewhere
            if (isDefensa) {
              const threatInGoalCol = [3, 4].includes(threatCol);
              const weInGoalCol = [3, 4].includes(ourCol);
              // Defensas should only block if: threat is in goal col, OR we're moving to goal col, AND same/adjacent column
              if ((threatInGoalCol || weInGoalCol) && colDiff <= 1 && ourDistance <= 3) {
                preventsOpponentGoal = true;
                blockingMoves.push(idx);
                validDefensiveMoves.push(idx);
                return;
              }
            } else {
              // For other pieces, allow blocking in same column or adjacent columns
              if (colDiff <= 1 && ourDistance <= 3) {
                preventsOpponentGoal = true;
                blockingMoves.push(idx);
                return;
              }
            }
          }
          
          // ADDITIONAL: For threats in goal columns D/E at rows 10-11, prioritize blocking even more
          // If threat is in goal column and very close, ANY move to goal columns in defensive area should block
          if (isThreatInGoalCol && isThreatVeryClose) {
            if ([3, 4].includes(ourCol) && defensiveRows.includes(ourRow)) {
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
      
      // Check if this move exposes our valuable pieces to capture OR allows opponent to score
      // CRITICAL: Detect if moving a piece exposes a delantero/mediocampista to capture
      // ALSO CRITICAL: Detect if moving a piece allows opponent to score a goal
      // This includes the piece being moved itself, or any other valuable piece
      if (!outcome.capture && !preventsOpponentGoal) {
        // Ensure the nextState has the correct turn for opponent
        const oppStateForMoves: GameState = {
          ...outcome.nextState,
          turn: opponent as PlayerId,
        };
        
        // FIRST: Check if opponent can score a goal after our move (CRITICAL RISK!)
        let allowsOpponentGoal = false;
        const nextOppMoves = RuleEngine.getLegalMoves(oppStateForMoves, opponent);
        for (const oppMove of nextOppMoves) {
          const oppSimState: GameState = { ...oppStateForMoves, turn: opponent as PlayerId };
          try {
            const oppOutcome = RuleEngine.applyMove(oppSimState, oppMove);
            if (oppOutcome.goal?.scoringPlayer === opponent) {
              allowsOpponentGoal = true;
              break;
            }
          } catch (e) {
            // Invalid move, skip
          }
        }
        
        // Check what opponent can do after our move
        let exposesValuablePiece = false;
        let exposedPieceDetails: string | null = null;
        
        // First, check if the piece we're moving itself becomes exposed
        const movedPiece = outcome.nextState.board[move.to.row]?.[move.to.col];
        if (movedPiece && movedPiece.owner === botPlayer && 
            (movedPiece.type === "delantero" || movedPiece.type === "mediocampista")) {
          // Check if opponent can capture this piece in its new position
          for (const oppMove of nextOppMoves) {
            if (oppMove.to.row === move.to.row && oppMove.to.col === move.to.col) {
              exposesValuablePiece = true;
              exposedPieceDetails = `${movedPiece.type} at ${String.fromCharCode(65 + move.to.col)}${move.to.row + 1} (the piece we just moved)`;
              break;
            }
          }
        }
        
        // Also check if any other valuable pieces become exposed
        if (!exposesValuablePiece) {
          for (const oppMove of nextOppMoves) {
            const targetPiece = outcome.nextState.board[oppMove.to.row]?.[oppMove.to.col];
            
            // If opponent can capture our delantero or mediocampista
            if (targetPiece && targetPiece.owner === botPlayer && 
                (targetPiece.type === "delantero" || targetPiece.type === "mediocampista")) {
              // Skip if this is the piece we just moved (already checked above)
              if (oppMove.to.row !== move.to.row || oppMove.to.col !== move.to.col) {
                exposesValuablePiece = true;
                exposedPieceDetails = `${targetPiece.type} at ${String.fromCharCode(65 + oppMove.to.col)}${oppMove.to.row + 1}`;
                break;
              }
            }
          }
        }
        
        // Mark as risky if it exposes a valuable piece OR allows opponent to score
        if (exposesValuablePiece || allowsOpponentGoal) {
          if (!riskyMoves.includes(idx)) {
            riskyMoves.push(idx);
          }
          if (allowsOpponentGoal) {
            movesAllowingGoal.push(idx);
            console.log(`[Gemini] ⚠️⚠️ Move ${idx + 1} (${moveToText(move)}) CRITICAL RISK - Allows opponent to score a goal!`);
          } else if (exposesValuablePiece) {
            console.log(`[Gemini] ⚠️ Move ${idx + 1} (${moveToText(move)}) RISKY - Exposes ${exposedPieceDetails || "valuable piece"} to capture`);
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
        if (preventsOpponentGoal) {
          // Defensa blocking is valid
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
    console.log(`  - Risky moves (expose pieces): ${riskyMoves.length}`);
    console.log(`  - Opponent threats detected: ${opponentThreats.length}`);
    if (opponentThreats.length > 0) {
      console.log(`  - Threat details:`);
      opponentThreats.forEach((threat, i) => {
        const colLabel = String.fromCharCode(65 + threat.col);
        const location = threat.isInGoalColumn ? "GOAL COL" : "other";
        const canReach = threat.canReachGoal ? "can reach goal" : (threat.canMoveToGoalColumn ? "can move to goal col" : "advancing");
        console.log(`    ${i + 1}. ${threat.pieceType} at ${colLabel}${threat.row + 1} (${location}), distance: ${threat.distanceToGoal}, ${canReach}`);
      });
    }
    
    if (immediateGoals.length > 0) {
      let goalMove = moves[immediateGoals[0]];
      const moveText = moveToText(goalMove);
      console.log(`[Gemini] ✅ DECISION: Found immediate goal move - ${moveText}`);
      console.log(`[Gemini] Reason: Can score immediately!`);
      // Ensure the move has the correct player field
      if (goalMove.player !== botPlayer) {
        goalMove = { ...goalMove, player: botPlayer };
      }
      return goalMove;
    }
    
    // CRITICAL: Check if we have captures in goal columns BEFORE blocking
    // Captures remove threats permanently, while blocking only delays them
    const capturesInGoalColumns = forwardCaptures
      .concat(midfielderCaptures)
      .filter(idx => {
        const move = moves[idx];
        return [3, 4].includes(move.to.col); // Goal columns D-E
      });
    
    if (capturesInGoalColumns.length > 0 && !opponentCanScoreNow) {
      // If opponent can't score immediately, capturing is better than blocking
      const captureMove = moves[capturesInGoalColumns[0]];
      const moveText = moveToText(captureMove);
      const targetPiece = state.board[captureMove.to.row]?.[captureMove.to.col];
      const pieceType = targetPiece?.type === "delantero" ? "F" :
                       targetPiece?.type === "mediocampista" ? "M" : "C";
      console.log(`[Gemini] ⚔️ DECISION: Found capture in goal column - ${moveText}`);
      console.log(`[Gemini] Reason: Capturing ${pieceType} in goal column removes threat permanently (better than blocking)!`);
      const safeCaptureMove = captureMove.player === botPlayer ? captureMove : { ...captureMove, player: botPlayer };
      return safeCaptureMove;
    }
    
    // If opponent can score immediately, blocking takes priority
    if (blockingMoves.length > 0 && opponentCanScoreNow) {
      const blockMove = moves[blockingMoves[0]];
      const moveText = moveToText(blockMove);
      console.log(`[Gemini] 🛡️ DECISION: Found blocking move - ${moveText}`);
      console.log(`[Gemini] Reason: MUST block opponent threat - opponent can score next turn! ${opponentThreats.length} threat(s) detected`);
      console.log(`[Gemini] ⚠️ CRITICAL: Opponent can score next turn if not blocked!`);
      // Ensure the move has the correct player field
      const safeBlockMove = blockMove.player === botPlayer ? blockMove : { ...blockMove, player: botPlayer };
      return safeBlockMove;
    }
    
    // If we have captures (even not in goal columns) and no immediate goal threat, prioritize them
    if ((forwardCaptures.length > 0 || midfielderCaptures.length > 0) && !opponentCanScoreNow) {
      const captureIdx = forwardCaptures.length > 0 ? forwardCaptures[0] : midfielderCaptures[0];
      const captureMove = moves[captureIdx];
      const moveText = moveToText(captureMove);
      const targetPiece = state.board[captureMove.to.row]?.[captureMove.to.col];
      const pieceType = targetPiece?.type === "delantero" ? "F" :
                       targetPiece?.type === "mediocampista" ? "M" : "C";
      console.log(`[Gemini] ⚔️ DECISION: Found capture move - ${moveText}`);
      console.log(`[Gemini] Reason: Capturing ${pieceType} removes opponent's attacking piece - valuable!`);
      const safeCaptureMove = captureMove.player === botPlayer ? captureMove : { ...captureMove, player: botPlayer };
      return safeCaptureMove;
    }
    
    // If blocking is the only option (no captures available)
    if (blockingMoves.length > 0) {
      const blockMove = moves[blockingMoves[0]];
      const moveText = moveToText(blockMove);
      console.log(`[Gemini] 🛡️ DECISION: Found blocking move - ${moveText}`);
      console.log(`[Gemini] Reason: Must block opponent threat! ${opponentThreats.length} threat(s) detected (no captures available)`);
      // Ensure the move has the correct player field
      const safeBlockMove = blockMove.player === botPlayer ? blockMove : { ...blockMove, player: botPlayer };
      return safeBlockMove;
    }
    
    // NEW APPROACH: Let Gemini analyze ALL moves, including risky ones
    // Mark risky moves clearly in the prompt so Gemini can evaluate risk vs. reward
    // Only filter out defensas that don't block or capture (they have special rules)
    const validMoves: Move[] = [];
    const validMoveIndices: number[] = []; // Keep track of original indices
    
    for (let idx = 0; idx < moves.length; idx++) {
      const move = moves[idx];
      const piece = state.board[move.from.row]?.[move.from.col];
      if (!piece) continue;
      
      // For defensas: only include if they block goals or capture (special rule for defensas)
      if (piece.type === "defensa") {
        if (validDefensiveMoves.includes(idx)) {
          validMoves.push(move);
          validMoveIndices.push(idx);
        }
        continue; // Skip defensas that don't block/capture (they have limited movement rules)
      }
      
      // For all other pieces: include ALL moves (risky or not) so Gemini can evaluate
      validMoves.push(move);
      validMoveIndices.push(idx);
    }
    
    // Log risky moves detected (but we're not filtering them - Gemini will decide)
    console.log(`[Gemini] 📊 Move Analysis Summary:`);
    console.log(`  - Total moves: ${moves.length}`);
    console.log(`  - Moves available for Gemini: ${validMoves.length}`);
    console.log(`  - Risky moves detected: ${riskyMoves.length} (marked in prompt for Gemini's evaluation)`);
    console.log(`  - Blocking moves: ${blockingMoves.length}`);
    
    if (riskyMoves.length > 0) {
      console.log(`[Gemini] ℹ️ Note: ${riskyMoves.length} risky move(s) will be presented to Gemini with explicit warnings.`);
      console.log(`[Gemini] ℹ️ Gemini will evaluate if the strategic benefit outweighs the risk.`);
    }
    
    const finalMovesToConsider = validMoves;
    const movesToEvaluate = finalMovesToConsider.slice(0, 20); // More moves for better selection
    // Keep track of which original indices correspond to movesToEvaluate
    const evaluateIndices = validMoves.length > 0 
      ? validMoveIndices.slice(0, 20)
      : moves.slice(0, 20).map((_, i) => i);
    
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
        // Use evaluateIndices to get the original index from moves array
        const originalIdx = evaluateIndices[idx];
        const piece = state.board[move.from.row]?.[move.from.col];
        const pieceType = piece?.type === "delantero" ? "F" : 
                         piece?.type === "mediocampista" ? "M" :
                         piece?.type === "carrilero" ? "C" : "D";
        const label = `${idx + 1}. ${moveToText(move)} (${pieceType})`;
        let extra = "";
        if (immediateGoals.includes(originalIdx)) extra += " [GOAL!] 🎯";
        else if (forwardCaptures.includes(originalIdx)) {
          // Check if capture is in goal column - prioritize these VERY highly
          const isGoalColCapture = [3, 4].includes(move.to.col);
          const targetPiece = state.board[move.to.row]?.[move.to.col];
          const pieceType = targetPiece?.type === "delantero" ? "F" :
                           targetPiece?.type === "mediocampista" ? "M" : "C";
          extra += isGoalColCapture 
            ? ` [⚔️⚔️ CRITICAL: CAPTURE ${pieceType} in GOAL COL! REMOVES THREAT!]` 
            : ` [⚔️ CAPTURE ${pieceType} - REMOVES OPPONENT ATTACKING PIECE!]`;
        }
        else if (midfielderCaptures.includes(originalIdx)) {
          const isGoalColCapture = [3, 4].includes(move.to.col);
          const targetPiece = state.board[move.to.row]?.[move.to.col];
          const pieceType = targetPiece?.type === "mediocampista" ? "M" : "C";
          extra += isGoalColCapture 
            ? ` [⚔️⚔️ CRITICAL: CAPTURE ${pieceType} in GOAL COL! REMOVES THREAT!]` 
            : ` [⚔️ CAPTURE ${pieceType} - REMOVES OPPONENT PIECE]`;
        }
        else if (blockingMoves.includes(originalIdx)) extra += " [BLOCKS THREAT]";
        else if (forwardAdvances.includes(originalIdx)) extra += " [F ADVANCE]";
        else if (midfielderAdvances.includes(originalIdx)) extra += " [M ADVANCE]";
        
        // CRITICAL: Mark risky moves explicitly so Gemini can evaluate risk vs. reward
        // Gemini will see these warnings and decide if the strategic benefit is worth the risk
        if (riskyMoves.includes(originalIdx)) {
          // Check if this risky move also blocks a threat (risk might be worth it)
          if (blockingMoves.includes(originalIdx)) {
            // Even if blocking, warn if it allows a goal
            if (movesAllowingGoal.includes(originalIdx)) {
              extra += " [⚠️⚠️ CRITICAL RISK - Allows opponent goal but blocks another threat! VERY DANGEROUS!]";
            } else {
              extra += " [⚠️ RISKY but BLOCKS THREAT - Evaluate: Does defensive benefit outweigh risk?]";
            }
          } else {
            // Check if this move allows opponent to score (most critical risk!)
            if (movesAllowingGoal.includes(originalIdx)) {
              extra += " [⚠️⚠️ CRITICAL RISK - Allows opponent to score next turn! NEVER select unless no other option!]";
            } else {
              extra += " [⚠️ RISKY - Exposes valuable piece (F/M) to capture next turn! Only select if strategic benefit is critical]";
            }
          }
        }
        
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
2. CAPTURE OPPONENT PIECES IN GOAL COLUMNS (CRITICAL!): If opponent has ANY piece (F/M/C) in columns D or E near your goal, CAPTURE IT IMMEDIATELY! This is often MORE IMPORTANT than blocking!
   - Capturing a piece removes the threat permanently
   - Blocking only delays the threat - the piece can still attack later
   - If you can capture AND block, capture is usually better!
3. BLOCK OPPONENT GOAL (CRITICAL): If opponent can score NEXT TURN (immediate threat), BLOCK THEM!
   - Only if capture is not available
   - Position pieces to prevent immediate goal
4. CAPTURE OPPONENT DELANTERO (F) ANYWHERE: Remove their best attacking piece - always valuable!
5. CAPTURE OPPONENT PIECES: Capture opponent C/M pieces - removes their attacking options
6. COORDINATE ATTACKS: When you have attacking advantage, coordinate multiple pieces (F+M, F+C) for stronger threats
7. ADVANCE YOUR DELANTEROS (F): Move your forwards (F) toward opponent goal, but protect them!
8. ADVANCE MEDIOCAMPISTAS (M): Move midfielders toward opponent goal - they're versatile attackers
9. ADVANCE CARRILEROS (C): Move carrileros toward opponent goal - support your forwards
10. CONTROL CENTER: Maintain control of columns C-F (central control helps both attack and defense)

DEFENSE IS CRITICAL:
- If opponent has pieces in columns D or E approaching your goal, you MUST block or capture
- If opponent has pieces advancing in ANY column toward your goal, they're a threat!
- Don't let opponent pieces advance unchecked - intercept them before they reach goal columns
- Watch for straight-line attacks: if opponent piece moves toward your goal in same column, intercept!
- A delantero can move from any column to goal columns D-E, so any delantero near your goal is dangerous!

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

RISK EVALUATION - IMPORTANT:
- Moves marked [⚠️ RISKY] expose your valuable pieces (F/M) to capture on opponent's next turn
- Moves marked [⚠️⚠️ CRITICAL RISK] allow opponent to SCORE A GOAL on their next turn - AVOID THESE AT ALL COSTS!
- You must ANALYZE each risky move carefully:
  * CRITICAL: If a move allows opponent to score, it is EXTREMELY DANGEROUS - only select if absolutely no other option exists
  * Does this risky move block an immediate goal threat? If yes, the risk may be worth it (but still dangerous).
  * Does this risky move provide a critical strategic advantage (e.g., great position, blocks future threat)?
  * Could you achieve the same goal with a non-risky move?
- GENERAL RULE: Avoid risky moves UNLESS they block an immediate threat or provide exceptional strategic value
- CRITICAL RULE: NEVER select a move that allows opponent to score unless it's the only available move!
- When evaluating risky moves, consider: "Is this the ONLY way to prevent a goal or gain critical advantage?"

REMEMBER:
- Moves marked [⚔️⚔️ CRITICAL: CAPTURE in GOAL COL] are HIGHEST PRIORITY - capture removes threat permanently!
- Moves marked [⚔️ CAPTURE] are VERY HIGH PRIORITY - removing opponent pieces is often better than blocking!
- Moves marked [BLOCKS THREAT] are important, but capturing the threatening piece is usually better!
- CRITICAL INSIGHT: Capturing removes the piece forever - blocking only delays it!
- If opponent has a piece in goal columns D-E, CAPTURE IT if possible before blocking!
- Don't let opponent pieces advance unchecked in columns D or E toward your goal
- If opponent just scored, prevent the SAME pattern from happening again!
- PROTECT YOUR DELANTEROS - Never expose them to capture!

TACTICAL CONSIDERATIONS:
- COORDINATION: Try to move pieces that work together (e.g., advance F and M together, or position C to support F)
- PROGRESSIVE PLAY: Each move should either advance your attack OR improve your defense - avoid repetitive moves
- PIECE ACTIVITY: Prefer moves that activate multiple pieces rather than moving the same piece repeatedly
- CONTROL: Maintaining control of central columns (C-F) gives flexibility for both attack and defense
- INITIATIVE: If you have more pieces near opponent goal, maintain pressure - don't retreat unnecessarily

DECISION FRAMEWORK:
1. Check if you can score immediately - if yes, do it!
2. Check if opponent can score - if yes, block it!
3. If attacking advantage: press forward, coordinate pieces, create multiple threats
4. If defensive position: consolidate, block threats, prepare counter-attack
5. If material ahead: trade pieces to simplify (but keep your F/M)
6. If material behind: avoid trades, play tactically, create complications

Think carefully: Which move best follows the priorities above?
Consider not just this move, but how it sets up future moves and coordinates with your other pieces.
Respond with ONLY the move number (1-${movesToEvaluate.length}), nothing else.`;

    // Pro level: Higher temperature for more creative/strategic play
    const temperature = isPro ? 0.4 : 0.1;
    
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature, // Pro: 0.4 for creativity, others: 0.1 for consistency
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
        let selectedMove = movesToEvaluate[moveIndex];
        const moveText = moveToText(selectedMove);
        // Use evaluateIndices to get the original index from moves array
        const originalIdx = evaluateIndices[moveIndex];
        const piece = state.board[selectedMove.from.row]?.[selectedMove.from.col];
        const pieceType = piece?.type === "delantero" ? "F" : 
                         piece?.type === "mediocampista" ? "M" :
                         piece?.type === "carrilero" ? "C" : "D";
        
        console.log(`[Gemini] ✅ SELECTED MOVE #${moveIndex + 1}: ${moveText} (${pieceType})`);
        
        // Detailed explanation of why this move was selected
        let reason = "";
        let alternatives: string[] = [];
        
        if (immediateGoals.includes(originalIdx)) {
          reason = "🎯 GOAL - Can score immediately!";
        } else if (blockingMoves.includes(originalIdx)) {
          // Find which specific threat this move blocks
          const blockedThreats = opponentThreats.filter((threat, tidx) => {
            // Check if this move blocks the threat
            if (selectedMove.to.row === threat.row && selectedMove.to.col === threat.col) {
              return true; // Captured the threat
            }
            if (selectedMove.to.col === threat.col) {
              const ourDist = botPlayer === "home" ? selectedMove.to.row : (11 - selectedMove.to.row);
              return ourDist < threat.distanceToGoal && ourDist <= 3;
            }
            return false;
          });
          
          if (blockedThreats.length > 0) {
            const threat = blockedThreats[0];
            const colLabel = String.fromCharCode(65 + threat.col);
            reason = `🛡️ BLOCK - Blocks ${threat.pieceType} at ${colLabel}${threat.row + 1} (${threat.distanceToGoal} rows from goal)`;
          } else {
            reason = `🛡️ BLOCK - Blocks opponent threat! (${opponentThreats.length} threat(s) detected)`;
          }
          
          // Show alternatives that also block
          if (blockingMoves.length > 1) {
            const otherBlocks = blockingMoves.filter(bIdx => bIdx !== originalIdx).slice(0, 3);
            alternatives = otherBlocks.map(bIdx => {
              const altMove = moves[bIdx];
              const altPiece = state.board[altMove.from.row]?.[altMove.from.col];
              const altType = altPiece?.type === "delantero" ? "F" : 
                             altPiece?.type === "mediocampista" ? "M" :
                             altPiece?.type === "carrilero" ? "C" : "D";
              return `${moveToText(altMove)} (${altType})`;
            });
          }
        } else if (forwardCaptures.includes(originalIdx)) {
          const isGoalCol = [3, 4].includes(selectedMove.to.col);
          // Check what piece is at the target position
          const targetPiece = state.board[selectedMove.to.row]?.[selectedMove.to.col];
          if (targetPiece && targetPiece.owner === opponent) {
            reason = isGoalCol 
              ? `⚔️ CAPTURE FORWARD in GOAL COLUMN - Critical! Captured ${targetPiece.type}`
              : `⚔️ CAPTURE FORWARD - Removed opponent ${targetPiece.type} (best attacking piece)`;
          } else {
            reason = isGoalCol ? "⚔️ CAPTURE FORWARD in GOAL COLUMN - Critical defensive move!" : "⚔️ CAPTURE FORWARD - Removes opponent's best attacking piece";
          }
        } else if (midfielderCaptures.includes(originalIdx)) {
          const isGoalCol = [3, 4].includes(selectedMove.to.col);
          const targetPiece = state.board[selectedMove.to.row]?.[selectedMove.to.col];
          if (targetPiece && targetPiece.owner === opponent) {
            reason = isGoalCol 
              ? `⚔️ CAPTURE MIDFIELDER in GOAL COLUMN - Important! Captured ${targetPiece.type}`
              : `⚔️ CAPTURE MIDFIELDER - Removed opponent ${targetPiece.type}`;
          } else {
            reason = isGoalCol ? "⚔️ CAPTURE MIDFIELDER in GOAL COLUMN - Important defensive move" : "⚔️ CAPTURE MIDFIELDER - Removes valuable piece";
          }
        } else if (forwardAdvances.includes(originalIdx)) {
          reason = "🚀 ADVANCE FORWARD - Moving best offensive piece toward opponent goal";
        } else if (midfielderAdvances.includes(originalIdx)) {
          reason = "🚀 ADVANCE MIDFIELDER - Progressing toward opponent goal";
        } else {
          reason = "🎲 Strategic move chosen by Gemini AI";
        }
        
        console.log(`[Gemini] 💡 REASON: ${reason}`);
        
        // Show what was NOT selected and why
        if (opponentThreats.length > 0 && !blockingMoves.includes(originalIdx)) {
          console.log(`[Gemini] ⚠️ WARNING: ${opponentThreats.length} threat(s) detected but selected move doesn't block them!`);
          opponentThreats.forEach((threat, i) => {
            const colLabel = String.fromCharCode(65 + threat.col);
            const location = threat.isInGoalColumn ? "GOAL COL" : "other column";
            console.log(`[Gemini]    Threat ${i + 1}: ${threat.pieceType} at ${colLabel}${threat.row + 1} (${location}), distance: ${threat.distanceToGoal} rows`);
          });
        }
        
        if (riskyMoves.includes(originalIdx)) {
          console.log(`[Gemini] ⚠️ WARNING: Selected move is RISKY - may expose valuable piece to capture!`);
        }
        
        if (forwardCaptures.length > 0 && !forwardCaptures.includes(originalIdx) && !blockingMoves.includes(originalIdx)) {
          console.log(`[Gemini] ⚠️ NOTE: ${forwardCaptures.length} forward capture(s) available but not selected`);
        }
        
        if (alternatives.length > 0) {
          console.log(`[Gemini] ℹ️ Alternative blocking moves: ${alternatives.join(", ")}`);
        }
        
        // Summary of decision context
        console.log(`[Gemini] 📊 Decision Context:`);
        console.log(`  - Available blocks: ${blockingMoves.length}`);
        console.log(`  - Available captures: ${forwardCaptures.length + midfielderCaptures.length}`);
        console.log(`  - Risky moves: ${riskyMoves.length}`);
        if (opponentThreats.length > 0) {
          console.log(`  - Active threats: ${opponentThreats.length}`);
        }
        if (opponentThreats.length > 0 && !blockingMoves.includes(originalIdx)) {
          console.log(`[Gemini] ⚠️ WARNING: ${opponentThreats.length} threat(s) detected but selected move doesn't block them!`);
        }
        
        console.log(`[Gemini] ==========================================`);
        
        // CRITICAL: Ensure the move has the correct player field
        // This should already be correct, but we verify it for safety
        if (selectedMove.player !== botPlayer) {
          console.warn(`[Gemini] ⚠️ WARNING: Selected move has incorrect player field! Fixing...`);
          console.warn(`[Gemini] Move player: ${selectedMove.player}, Expected: ${botPlayer}`);
          selectedMove = {
            ...selectedMove,
            player: botPlayer,
          };
        }
        
        return selectedMove;
      } else {
        console.warn(`[Gemini] ❌ Move number out of range: ${moveIndex} (Available: 0-${movesToEvaluate.length - 1})`);
      }
    }

    console.warn(`[Gemini] ⚠️ Could not parse move recommendation from response: "${text}", using fallback strategy`);
    // Fallback: prefer forward captures, then forward advancement
    console.log(`[Gemini] ⚠️ Falling back to priority-based selection (Gemini response unparseable)`);
    console.log(`[Gemini] Fallback priorities: ${forwardCaptures.length > 0 ? `Forward captures (${forwardCaptures.length})` : ""} ${forwardAdvances.length > 0 ? `Forward advances (${forwardAdvances.length})` : ""}`);
    
    // Helper function to ensure move has correct player field
    const ensureCorrectPlayer = (move: Move): Move => {
      return move.player === botPlayer ? move : { ...move, player: botPlayer };
    };
    
    if (forwardCaptures.length > 0) {
      const fallbackMove = ensureCorrectPlayer(moves[forwardCaptures[0]]);
      console.log(`[Gemini] 🔄 FALLBACK: Using forward capture - ${moveToText(fallbackMove)}`);
      return fallbackMove;
    }
    if (forwardAdvances.length > 0) {
      const fallbackMove = ensureCorrectPlayer(moves[forwardAdvances[0]]);
      console.log(`[Gemini] 🔄 FALLBACK: Using forward advance - ${moveToText(fallbackMove)}`);
      return fallbackMove;
    }
    if (midfielderCaptures.length > 0) {
      const fallbackMove = ensureCorrectPlayer(moves[midfielderCaptures[0]]);
      console.log(`[Gemini] 🔄 FALLBACK: Using midfielder capture - ${moveToText(fallbackMove)}`);
      return fallbackMove;
    }
    if (midfielderAdvances.length > 0) {
      const fallbackMove = ensureCorrectPlayer(moves[midfielderAdvances[0]]);
      console.log(`[Gemini] 🔄 FALLBACK: Using midfielder advance - ${moveToText(fallbackMove)}`);
      return fallbackMove;
    }
    // Only use defensas if they're valid (blocking/capturing)
    if (validDefensiveMoves.length > 0) {
      const fallbackMove = ensureCorrectPlayer(moves[validDefensiveMoves[0]]);
      console.log(`[Gemini] 🔄 FALLBACK: Using valid defensive move - ${moveToText(fallbackMove)}`);
      return fallbackMove;
    }
    // Avoid defensive moves unless no other options
    const offensiveMoves = moves.filter((move, idx) => {
      const piece = state.board[move.from.row]?.[move.from.col];
      return piece && piece.type !== "defensa";
    });
    if (offensiveMoves.length > 0) {
      const fallbackMove = ensureCorrectPlayer(offensiveMoves[0]);
      console.log(`[Gemini] 🔄 FALLBACK: Using first offensive move - ${moveToText(fallbackMove)}`);
      return fallbackMove;
    }
    console.log(`[Gemini] 🔄 FALLBACK: Last resort - using first available move - ${moveToText(moves[0])}`);
    return ensureCorrectPlayer(moves[0]); // Last resort
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

