import { GoogleGenerativeAI } from "@google/generative-ai";
import { RuleEngine, type GameState, type Move, type PlayerId } from "@/lib/ruleEngine";
import type { AIPlayingStyle } from "@/lib/ai/footballBot";

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

// Configuration constants
const GEMINI_MAX_OUTPUT_TOKENS = 10000; // Very large limit to prevent truncation - we'll monitor actual usage via logs

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

// Get playing style-specific instructions for the AI prompt
const getPlayingStyleInstructions = (style: AIPlayingStyle): string => {
  const styleInstructions: Record<AIPlayingStyle, string> = {
    defensive: `
🛡️ PLAYING STYLE: DEFENSIVE
Your primary goal is to prevent opponent goals and maintain a solid defense:
- PRIORITIZE blocking opponent threats over advancing your pieces
- Keep your defensas (D) well-positioned to block goal columns D-E
- AVOID taking risks that expose your valuable pieces (F/M)
- Only advance pieces when it's SAFE and doesn't weaken your defense
- Trade pieces cautiously - prefer to keep material on the board for defense
- Focus on solid positional play rather than aggressive attacks
- Counter-attack only when opponent overcommits to their attack
- PATIENCE is key - wait for opponent mistakes rather than forcing play
Remember: A strong defense wins games! Be patient and wait for opportunities.`,

    offensive: `
⚔️ PLAYING STYLE: OFFENSIVE
Your primary goal is to create and maintain constant pressure on opponent:
- PRIORITIZE advancing your forwards (F) and midfielders (M) toward opponent goal
- Create MULTIPLE threats simultaneously - force opponent to defend
- Take calculated risks to gain attacking positions
- Trade pieces aggressively if it improves your attacking position
- Keep opponent on the defensive - don't let them counter-attack
- Look for ways to create double threats (two pieces attacking same goal column)
- Sacrifice material if it leads to a strong attack or goal opportunity
- AGGRESSION pays off - maintain pressure and force opponent mistakes
Remember: The best defense is a good offense! Keep pushing forward.`,

    moderate: `
⚖️ PLAYING STYLE: MODERATE
Your approach balances attack and defense:
- Balance between advancing pieces and maintaining defense
- React to opponent's play - defend when threatened, attack when safe
- Prioritize favorable captures over pure advancement or pure defense
- Maintain piece coordination - don't overcommit to either attack or defense
- Evaluate each position carefully - choose the best move based on context
- Adapt your strategy based on score and game situation
- Look for opportunities while ensuring your defense isn't compromised
Remember: Flexibility wins - adapt to each position and opponent's style.`,

    tactical: `
🧩 PLAYING STYLE: TACTICAL
Your focus is on finding the best tactical moves and combinations:
- PRIORITIZE favorable captures (capturing without losing or with good trades)
- Look for tactical combinations: double attacks, pins, forks
- Calculate concrete variations - find the best move in each position
- Value piece activity over static advantages
- Create threats that force opponent into difficult choices
- Look for positional improvements that lead to tactical opportunities
- Exploit opponent weaknesses with precise moves
- Think in sequences - plan 2-3 moves ahead for tactical shots
Remember: Tactical awareness wins - find the strongest move in each position.`,

    counterattack: `
🔄 PLAYING STYLE: COUNTERATTACK
You allow opponent to advance, then strike back with powerful counterattacks:
- Allow opponent to advance their pieces, but monitor for overcommitment
- Keep your pieces well-coordinated and ready to counter-attack
- Let opponent create threats, then strike when they're vulnerable
- Position pieces to create counter-threats when opponent attacks
- Look for moments when opponent overextends - then counter-attack decisively
- Maintain defensive solidity but be ready to transition to attack quickly
- Trade pieces when it simplifies to a favorable endgame
- PATIENCE and TIMING are crucial - wait for the right moment to strike
Remember: Counterattacks are powerful - lure opponent forward, then strike back!`,

    control: `
🎯 PLAYING STYLE: CONTROL
Your goal is to control key squares and maintain positional advantage:
- PRIORITIZE controlling columns D-E (goal columns) and central columns C-F
- Maintain piece activity - keep all pieces working together
- Control key squares that restrict opponent's options
- Build up your position gradually rather than rushing
- Look for ways to improve piece placement and coordination
- Prevent opponent from getting active pieces while increasing your activity
- Create long-term positional advantages that accumulate over time
- Initiative matters - keep opponent reacting to your moves
Remember: Control the board, control the game! Gradually build your advantage.`,
  };
  
  return styleInstructions[style];
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
  
  // PRO LEVEL: Advanced tactical analysis
  let tacticalCombinations = {
    doubleThreats: [] as Array<{ piece1: { row: number; col: number; type: string }, piece2: { row: number; col: number; type: string }, target: string }>,
    coordinatedAttacks: [] as Array<{ pieces: Array<{ row: number; col: number; type: string }>, description: string }>,
    tacticalSacrifices: [] as Array<{ sacrifice: string, gain: string }>,
  };
  
  // PRO LEVEL: Repetition detection - check last 4 moves for patterns
  const recentMoves: string[] = [];
  if (state.history && state.history.length >= 2) {
    for (let i = Math.max(0, state.history.length - 4); i < state.history.length; i++) {
      const move = state.history[i];
      if (move && move.from && move.to) {
        const fromStr = `${String.fromCharCode(65 + move.from.col)}${move.from.row + 1}`;
        const toStr = `${String.fromCharCode(65 + move.to.col)}${move.to.row + 1}`;
        recentMoves.push(`${fromStr}→${toStr}`);
      }
    }
  }
  
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

${recentMoves.length >= 4 ? `Recent moves pattern: ${recentMoves.slice(-4).join(", ")}` : ""}
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

// Helper functions for coordinate conversion
const positionToText = (row: number, col: number): string => {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
};

const textToPosition = (text: string): { row: number; col: number } | null => {
  const match = text.match(/^([A-H])(\d+)$/i);
  if (!match) return null;
  const col = match[1].toUpperCase().charCodeAt(0) - 65;
  const row = parseInt(match[2], 10) - 1;
  if (col < 0 || col >= 8 || row < 0 || row >= 12) return null;
  return { row, col };
};

// NEW APPROACH: Direct move selection by Gemini
// Gemini chooses which piece to move and where, with reasoning
export const getGeminiMoveDirect = async (
  state: GameState,
  legalMoves: Move[],
  botPlayer: PlayerId,
  isPro: boolean = false,
  playingStyle: AIPlayingStyle | null = null,
): Promise<{ move: Move; reasoning: string } | null> => {
  // Initialize lazily when first needed
  initializeGemini();
  
  console.log(`[Gemini] ========== getGeminiMoveDirect called ==========`);
  const apiKey = getGeminiApiKey();
  
  if (!apiKey || !model) {
    console.warn(`[Gemini] ⚠️ Gemini AI not available, cannot get direct move`);
    return null;
  }
  
  if (!legalMoves || legalMoves.length === 0) {
    console.warn(`[Gemini] ⚠️ No legal moves available`);
    return null;
  }
  
  console.log(`[Gemini] 🤖 Direct move selection mode`);
  console.log(`[Gemini]   - Legal moves available: ${legalMoves.length}`);
  console.log(`[Gemini]   - Bot player: ${botPlayer}`);
  console.log(`[Gemini]   - Pro level: ${isPro}`);
  console.log(`[Gemini]   - Playing style: ${playingStyle || "default"}`);
  
  // Build game state description
  const gameDescription = gameStateToText(state, botPlayer);
  
  // Detect threats and opportunities
  const opponent = botPlayer === "home" ? "away" : "home";
  const opponentThreats = detectOpponentThreats(state, botPlayer);
  const immediateGoals = legalMoves.filter((move, idx) => {
    try {
      const outcome = RuleEngine.applyMove(state, move);
      return outcome.goal;
    } catch {
      return false;
    }
  });
  
  // Build prompt asking Gemini to choose a move directly
  const prompt = `You are playing Football Chess as the ${botPlayer.toUpperCase()} player.

${gameDescription}

CURRENT SITUATION:
- Your turn to move
- Score: Home ${state.score.home} - ${state.score.away} Away
- Legal moves available: ${legalMoves.length}
${immediateGoals.length > 0 ? `- ⚠️ CRITICAL: You have ${immediateGoals.length} move(s) that score immediately!` : ""}
${opponentThreats.length > 0 ? `- ⚠️ THREATS: Opponent has ${opponentThreats.length} piece(s) threatening your goal` : ""}

STRATEGIC PRIORITIES:
1. 🎯 SCORE A GOAL if possible (highest priority!)
2. 🛡️ BLOCK opponent goal threats (defense is critical)
3. ⚔️ CAPTURE opponent pieces (especially forwards/delanteros and midfielders/mediocampistas)
4. 📈 ADVANCE your pieces toward opponent goal
5. ⚠️ AVOID exposing your valuable pieces (forwards/delanteros) to capture

${isPro ? `\n🔥 PRO LEVEL - Apply advanced strategy:\n- Multi-turn planning\n- Piece coordination\n- Prophylactic defense\n- Positional advantage\n` : ""}
${playingStyle ? `\n${getPlayingStyleInstructions(playingStyle)}\n` : ""}

YOUR TASK:
Choose ONE move to make. Respond ONLY with valid JSON in this exact format:
{
  "from": "A1",
  "to": "A2",
  "reasoning": "Brief explanation of why you chose this move (2-3 sentences)"
}

RULES:
- "from" must be a square where you have a piece (format: A1-H12)
- "to" must be a valid destination square (format: A1-H12)
- The move must be legal according to Football Chess rules
- Use column letters A-H and row numbers 1-12
- Example: {"from": "D2", "to": "D3", "reasoning": "Advancing midfielder to support attack"}

${immediateGoals.length > 0 ? `\n⚠️ CRITICAL: You have moves that score immediately! Consider them first!\n` : ""}
${opponentThreats.length > 0 ? `\n⚠️ DEFENSE NEEDED: Block opponent threats before they become dangerous!\n` : ""}

Respond with ONLY the JSON object, no other text:`;

  try {
    const temperature = isPro ? 0.4 : 0.1;
    
    console.log(`[Gemini] 📤 Sending direct move request to Gemini:`);
    console.log(`[Gemini]   - Prompt length: ${prompt.length} characters`);
    console.log(`[Gemini]   - Temperature: ${temperature}`);
    console.log(`[Gemini]   - Max output tokens: ${GEMINI_MAX_OUTPUT_TOKENS.toLocaleString()}`);
    
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        topP: 0.95,
        topK: 40,
      },
    });
    
    const response = await result.response;
    let text = "";
    
    try {
      text = response.text().trim();
    } catch (textError) {
      // Try alternative extraction
      if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        if (candidate.content && candidate.content.parts) {
          const parts = candidate.content.parts.filter((p: any) => p.text);
          if (parts.length > 0) {
            text = parts.map((p: any) => p.text).join(" ").trim();
          }
        }
      }
    }
    
    console.log(`[Gemini] 📥 Response from Gemini: "${text}"`);
    
    if (!text) {
      console.error(`[Gemini] ❌ Empty response from Gemini`);
      return null;
    }
    
    // Try to extract JSON from response (might have extra text)
    let jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Try to find JSON-like structure
      jsonMatch = text.match(/\{.*\}/);
    }
    
    if (!jsonMatch) {
      console.error(`[Gemini] ❌ Could not find JSON in response: "${text}"`);
      return null;
    }
    
    let parsedResponse: { from?: string; to?: string; reasoning?: string };
    try {
      parsedResponse = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error(`[Gemini] ❌ Failed to parse JSON: ${parseError}`);
      console.error(`[Gemini] Raw text: "${text}"`);
      return null;
    }
    
    if (!parsedResponse.from || !parsedResponse.to) {
      console.error(`[Gemini] ❌ Missing 'from' or 'to' in response:`, parsedResponse);
      return null;
    }
    
    // Convert text positions to coordinates
    const fromPos = textToPosition(parsedResponse.from);
    const toPos = textToPosition(parsedResponse.to);
    
    if (!fromPos || !toPos) {
      console.error(`[Gemini] ❌ Invalid position format: from="${parsedResponse.from}", to="${parsedResponse.to}"`);
      return null;
    }
    
    // Find matching legal move
    const matchingMove = legalMoves.find(move => 
      move.from.row === fromPos.row &&
      move.from.col === fromPos.col &&
      move.to.row === toPos.row &&
      move.to.col === toPos.col
    );
    
    if (!matchingMove) {
      console.error(`[Gemini] ❌ Move ${parsedResponse.from}→${parsedResponse.to} is not a legal move!`);
      console.error(`[Gemini] Available legal moves (first 10):`, legalMoves.slice(0, 10).map(m => 
        `${positionToText(m.from.row, m.from.col)}→${positionToText(m.to.row, m.to.col)}`
      ));
      
      // Try to find a similar move (same piece, different destination)
      const samePieceMoves = legalMoves.filter(m => 
        m.from.row === fromPos.row && m.from.col === fromPos.col
      );
      
      if (samePieceMoves.length > 0) {
        console.log(`[Gemini] 💡 Found ${samePieceMoves.length} legal moves for piece at ${parsedResponse.from}`);
        console.log(`[Gemini] 💡 Suggesting closest move: ${positionToText(samePieceMoves[0].to.row, samePieceMoves[0].to.col)}`);
        // Use the first legal move for that piece as fallback
        return {
          move: { ...samePieceMoves[0], player: botPlayer },
          reasoning: parsedResponse.reasoning || `Adjusted move from ${parsedResponse.to} to valid destination`,
        };
      }
      
      return null;
    }
    
    // Success! Log the decision
    const reasoning = parsedResponse.reasoning || "No reasoning provided";
    console.log(`[Gemini] ============================================================`);
    console.log(`[Gemini] ✅✅✅ GEMINI DIRECT MOVE SELECTION ✅✅✅`);
    console.log(`[Gemini] ============================================================`);
    console.log(`[Gemini] ✅ SELECTED MOVE: ${parsedResponse.from}→${parsedResponse.to}`);
    console.log(`[Gemini] 📍 From: ${parsedResponse.from} (row ${fromPos.row + 1}, col ${fromPos.col})`);
    console.log(`[Gemini] 📍 To: ${parsedResponse.to} (row ${toPos.row + 1}, col ${toPos.col})`);
    console.log(`[Gemini] 💭 REASONING: ${reasoning}`);
    console.log(`[Gemini] 🤖 DECISION SOURCE: Gemini AI (direct move selection)`);
    console.log(`[Gemini] ============================================================`);
    
    // Ensure move has correct player field
    const finalMove: Move = {
      ...matchingMove,
      player: botPlayer,
    };
    
    return {
      move: finalMove,
      reasoning,
    };
    
  } catch (error) {
    console.error(`[Gemini] ❌ Error in getGeminiMoveDirect:`, error);
    return null;
  }
};

// Helper function to detect opponent threats (reused from getGeminiRecommendation logic)
function detectOpponentThreats(state: GameState, botPlayer: PlayerId): Array<{ row: number; col: number; type: string; distanceToGoal: number }> {
  const opponent = botPlayer === "home" ? "away" : "home";
  const threats: Array<{ row: number; col: number; type: string; distanceToGoal: number }> = [];
  
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row]?.[col];
      if (piece && piece.owner === opponent && piece.type !== "defensa") {
        const botGoalRow = botPlayer === "home" ? 11 : 0;
        const distanceToGoal = Math.abs(row - botGoalRow);
        
        // Check if in goal columns or can reach them
        if ([3, 4].includes(col) && distanceToGoal <= 6) {
          threats.push({ row, col, type: piece.type, distanceToGoal });
        }
      }
    }
  }
  
  return threats;
}

// Get best move recommendation from Gemini
export const getGeminiRecommendation = async (
  state: GameState,
  moves: Move[],
  botPlayer: PlayerId,
  isPro: boolean = false, // Pro level gets enhanced features
  playingStyle: AIPlayingStyle | null = null, // Playing style: defensive, offensive, moderate, tactical, counterattack, control
): Promise<Move | null> => {
  // Initialize lazily when first needed (ensures env vars are loaded in Vercel)
  initializeGemini();
  
  console.log(`[Gemini] ========== getGeminiRecommendation called ==========`);
  const apiKey = getGeminiApiKey();
  console.log(`[Gemini] Checking prerequisites:`);
  console.log(`  - Model available: ${!!model}`);
  console.log(`  - API key available: ${!!apiKey}`);
  console.log(`  - Moves available: ${moves.length}`);
  console.log(`  - Pro level: ${isPro}`);
  console.log(`  - Playing style: ${playingStyle || "default (no style)"}`);
  
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
    
    // Helper function to get piece value (higher = more valuable)
    const getPieceValue = (pieceType: string): number => {
      switch (pieceType) {
        case "delantero": return 100;
        case "mediocampista": return 50;
        case "carrilero": return 30;
        case "defensa": return 10;
        default: return 0;
      }
    };
    
    // Analyze moves and categorize them
    const immediateGoals: number[] = [];
    const blockingMoves: number[] = [];
    const forwardCaptures: number[] = [];
    const midfielderCaptures: number[] = [];
    const valuableCaptures: number[] = []; // Captures that are favorable (no loss or lose less valuable piece)
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
      canScoreImmediately?: boolean;
    }> = [];
    
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = state.board[row]?.[col];
        if (piece && piece.owner === opponent && piece.type !== "defensa") {
          // Calculate distance to bot's goal correctly
          // Bot "home" has goal at row 11, bot "away" has goal at row 0
          const botGoalRow = botPlayer === "home" ? 11 : 0;
          const distanceToGoal = Math.abs(row - botGoalRow);
          const piecePos = { row, col };
          const legalMoves = RuleEngine.getLegalMovesForPiece(state, piecePos);
          
          const isInGoalColumn = [3, 4].includes(col);
          let canReachGoal = false;
          let canMoveToGoalColumn = false;
          
          // Check if piece can move toward goal or to goal columns
          for (const moveTo of legalMoves) {
            const newDistance = Math.abs(moveTo.row - botGoalRow);
            
            // If moving toward goal (closer to goal)
            if (moveTo.col === col && newDistance < distanceToGoal) {
              canReachGoal = true;
            }
            
            // If can reach goal squares (row matching botGoalRow in columns D-E)
            if (newDistance === 0 && [3, 4].includes(moveTo.col)) {
              canReachGoal = true;
            }
            
            // If can move to goal columns (D or E) from current position
            if ([3, 4].includes(moveTo.col) && newDistance <= distanceToGoal + 2) {
              canMoveToGoalColumn = true;
            }
          }
          
          // CRITICAL: Check if piece can score immediately (can move to goal in one move)
          // This means checking if any legal move reaches the goal row in goal columns
          let canScoreImmediately = false;
          for (const moveTo of legalMoves) {
            // Check if this move reaches the goal row in goal columns (D-E)
            if (moveTo.row === botGoalRow && [3, 4].includes(moveTo.col)) {
              canScoreImmediately = true;
              break;
            }
          }
          
          // Also check if piece is already at goal position
          if (row === botGoalRow && [3, 4].includes(col)) {
            canScoreImmediately = true;
          }
          
          // CRITICAL: Also check if piece is in goal column and VERY close (within 1-2 rows)
          // This catches cases like E12 where the piece is almost at the goal
          // For bot "away" (goal at row 0), a piece at row 1-2 in column D-E is very close
          // For bot "home" (goal at row 11), a piece at row 9-10 in column D-E is very close
          const isVeryCloseToGoal = [3, 4].includes(col) && distanceToGoal <= 2;
          
          // CRITICAL: Also detect if piece is on the OPPOSITE side but can reach goal
          // A mediocampista in D12 (row 11 for bot "away") can move diagonally to row 0 (goal)
          const isOnOppositeSide = (botPlayer === "away" && row >= 9) || (botPlayer === "home" && row <= 2);
          const canReachGoalFromFar = isOnOppositeSide && [3, 4].includes(col) && canReachGoal;
          
          // Consider a threat if:
          // 1. Can score immediately (CRITICAL! - must block/capture NOW)
          // 2. Very close to goal in goal column (within 2 rows - urgent!)
          // 3. Can reach goal from opposite side in goal column (mediocampistas/delanteros can move long distances)
          // 4. In goal column and within 6 rows of goal
          // 5. Can move to goal column and within 5 rows of goal (delanteros can move long distances)
          // 6. Advancing in same column toward goal (within 4 rows)
          const isThreat = canScoreImmediately ||
                          isVeryCloseToGoal ||
                          canReachGoalFromFar ||
                          (isInGoalColumn && distanceToGoal <= 6) ||
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
              canScoreImmediately: canScoreImmediately,
            });
            
            // Log critical threats for debugging
            if (canScoreImmediately) {
              const colLabel = String.fromCharCode(65 + col);
              console.log(`[Gemini] 🚨🚨 CRITICAL THREAT: ${piece.type} at ${colLabel}${row + 1} CAN SCORE IMMEDIATELY! (at goal row ${botGoalRow + 1} or can move there)`);
            } else if (canReachGoalFromFar) {
              const colLabel = String.fromCharCode(65 + col);
              console.log(`[Gemini] 🚨 CRITICAL THREAT: ${piece.type} at ${colLabel}${row + 1} can reach goal from opposite side!`);
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
      // CRITICAL: For capture moves, evaluate if it's a favorable trade
      // Should capture if:
      // 1. No loss (our piece doesn't get exposed)
      // 2. Or we lose a piece of lesser value
      // BUT NOT if it allows opponent to score a goal
      if (outcome.capture && !preventsOpponentGoal) {
        const capturedPieceValue = getPieceValue(outcome.capture.type);
        const ourPieceType = piece.type;
        const ourPieceValue = getPieceValue(ourPieceType);
        
        // Check if our piece becomes exposed after the capture
        const oppStateAfterCapture: GameState = {
          ...outcome.nextState,
          turn: opponent as PlayerId,
        };
        const oppMovesAfterCapture = RuleEngine.getLegalMoves(oppStateAfterCapture, opponent);
        let ourPieceExposed = false;
        let exposedPieceValue = 0;
        
        for (const oppMove of oppMovesAfterCapture) {
          // Check if opponent can capture our piece at the capture location
          // IMPORTANT: Only consider it exposed if there's actually an opponent piece that can capture
          const oppPiece = oppStateAfterCapture.board[oppMove.from.row]?.[oppMove.from.col];
          if (oppPiece && oppPiece.owner === opponent && 
              oppMove.to.row === move.to.row && oppMove.to.col === move.to.col) {
            // Verify this move is actually legal and can capture
            try {
              const oppSimState: GameState = { ...oppStateAfterCapture, turn: opponent as PlayerId };
              const oppOutcome = RuleEngine.applyMove(oppSimState, oppMove);
              if (oppOutcome.capture && oppOutcome.capture.id === piece.id) {
                // Our piece can actually be captured - it's exposed
                ourPieceExposed = true;
                exposedPieceValue = ourPieceValue;
                break;
              }
            } catch (e) {
              // Invalid move, skip
            }
          }
          
          // Also check if we expose any other valuable piece
          const oppSimState: GameState = { ...oppStateAfterCapture, turn: opponent as PlayerId };
          try {
            const oppOutcome = RuleEngine.applyMove(oppSimState, oppMove);
            if (oppOutcome.capture && oppOutcome.capture.owner === botPlayer) {
              const exposedPieceType = oppOutcome.capture.type;
              const value = getPieceValue(exposedPieceType);
              if (value > exposedPieceValue) {
                ourPieceExposed = true;
                exposedPieceValue = value;
              }
            }
          } catch (e) {
            // Invalid move, skip
          }
        }
        
        // Check if this capture allows opponent to score (CRITICAL - should NOT capture!)
        let allowsGoalAfterCapture = false;
        for (const oppMove of oppMovesAfterCapture) {
          const oppSimState: GameState = { ...oppStateAfterCapture, turn: opponent as PlayerId };
          try {
            const oppOutcome = RuleEngine.applyMove(oppSimState, oppMove);
            if (oppOutcome.goal?.scoringPlayer === opponent) {
              allowsGoalAfterCapture = true;
              break;
            }
          } catch (e) {
            // Invalid move, skip
          }
        }
        
        // If allows goal, mark as critical risk (should NOT do this capture!)
        if (allowsGoalAfterCapture) {
          if (!movesAllowingGoal.includes(idx)) {
            movesAllowingGoal.push(idx);
          }
          console.log(`[Gemini] ⚠️⚠️ Capture ${idx + 1} (${moveToText(move)}) CRITICAL RISK - Allows opponent to score a goal after capture!`);
        } else if (!ourPieceExposed) {
          // Favorable capture: we capture without losing anything
          if (!valuableCaptures.includes(idx)) {
            valuableCaptures.push(idx);
          }
          console.log(`[Gemini] ✅ Capture ${idx + 1} (${moveToText(move)}) FAVORABLE - Capturing ${outcome.capture.type} without losing any piece`);
        } else if (capturedPieceValue > exposedPieceValue) {
          // Favorable trade: we capture more valuable piece than we lose
          if (!valuableCaptures.includes(idx)) {
            valuableCaptures.push(idx);
          }
          console.log(`[Gemini] ✅ Capture ${idx + 1} (${moveToText(move)}) FAVORABLE TRADE - Capturing ${outcome.capture.type} (value: ${capturedPieceValue}) vs losing value: ${exposedPieceValue}`);
        } else if (capturedPieceValue === exposedPieceValue) {
          // Even trade - still consider it but lower priority
          console.log(`[Gemini] ⚖️ Capture ${idx + 1} (${moveToText(move)}) EVEN TRADE - Capturing ${outcome.capture.type} (value: ${capturedPieceValue}) vs losing same value`);
        } else {
          // Unfavorable trade - we lose more valuable piece
          console.log(`[Gemini] ⚠️ Capture ${idx + 1} (${moveToText(move)}) UNFAVORABLE TRADE - Capturing ${outcome.capture.type} (value: ${capturedPieceValue}) but losing value: ${exposedPieceValue}`);
        }
      }
      
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
    console.log(`  - Midfielder captures: ${midfielderCaptures.length}`);
    console.log(`  - Favorable captures (no loss or good trade): ${valuableCaptures.length}`);
    console.log(`  - Forward advances: ${forwardAdvances.length}`);
    console.log(`  - Midfielder advances: ${midfielderAdvances.length}`);
    console.log(`  - Valid defensive moves: ${validDefensiveMoves.length}`);
    console.log(`  - Risky moves (expose pieces): ${riskyMoves.length}`);
    console.log(`  - Moves allowing opponent goal: ${movesAllowingGoal.length}`);
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
    
    // CRITICAL: Prioritize FAVORABLE captures in goal columns FIRST
    // Captures remove threats permanently, while blocking only delays them
    const favorableCapturesInGoalColumns = valuableCaptures
      .filter(idx => {
        const move = moves[idx];
        return [3, 4].includes(move.to.col) && !movesAllowingGoal.includes(idx); // Goal columns D-E and safe
      });
    
    if (favorableCapturesInGoalColumns.length > 0 && !opponentCanScoreNow) {
      // Sort by captured piece value
      favorableCapturesInGoalColumns.sort((a, b) => {
        const moveA = moves[a];
        const moveB = moves[b];
        const pieceA = state.board[moveA.to.row]?.[moveA.to.col];
        const pieceB = state.board[moveB.to.row]?.[moveB.to.col];
        if (!pieceA || !pieceB) return 0;
        return getPieceValue(pieceA.type) - getPieceValue(pieceB.type);
      });
      
      const bestCaptureIdx = favorableCapturesInGoalColumns[favorableCapturesInGoalColumns.length - 1];
      const captureMove = moves[bestCaptureIdx];
      const moveText = moveToText(captureMove);
      const targetPiece = state.board[captureMove.to.row]?.[captureMove.to.col];
      const pieceType = targetPiece?.type === "delantero" ? "F" :
                       targetPiece?.type === "mediocampista" ? "M" : "C";
      console.log(`[Gemini] ⚔️ DECISION: Found FAVORABLE capture in goal column - ${moveText}`);
      console.log(`[Gemini] Reason: Capturing ${pieceType} in goal column (FAVORABLE - no loss)!`);
      const safeCaptureMove = captureMove.player === botPlayer ? captureMove : { ...captureMove, player: botPlayer };
      return safeCaptureMove;
    }
    
    // If no favorable captures in goal columns, check all captures in goal columns
    const capturesInGoalColumns = forwardCaptures
      .concat(midfielderCaptures)
      .filter(idx => {
        const move = moves[idx];
        return [3, 4].includes(move.to.col) && !movesAllowingGoal.includes(idx); // Goal columns D-E and safe
      });
    
    if (capturesInGoalColumns.length > 0 && !opponentCanScoreNow) {
      // Sort by captured piece value
      capturesInGoalColumns.sort((a, b) => {
        const moveA = moves[a];
        const moveB = moves[b];
        const pieceA = state.board[moveA.to.row]?.[moveA.to.col];
        const pieceB = state.board[moveB.to.row]?.[moveB.to.col];
        if (!pieceA || !pieceB) return 0;
        return getPieceValue(pieceA.type) - getPieceValue(pieceB.type);
      });
      
      const captureMove = moves[capturesInGoalColumns[capturesInGoalColumns.length - 1]];
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
    
    // CRITICAL: Prioritize favorable captures (no loss or favorable trade)
    // These are captures that don't expose our pieces OR we trade favorably
    // BUT: Exclude those already handled (goal column captures)
    const favorableCapturesElsewhere = valuableCaptures.filter(
      idx => !movesAllowingGoal.includes(idx) && 
             !favorableCapturesInGoalColumns.includes(idx) &&
             !capturesInGoalColumns.includes(idx)
    );
    
    if (favorableCapturesElsewhere.length > 0 && !opponentCanScoreNow) {
      // Sort by captured piece value (highest first)
      favorableCapturesElsewhere.sort((a, b) => {
        const moveA = moves[a];
        const moveB = moves[b];
        const pieceA = state.board[moveA.to.row]?.[moveA.to.col];
        const pieceB = state.board[moveB.to.row]?.[moveB.to.col];
        if (!pieceA || !pieceB) return 0;
        return getPieceValue(pieceA.type) - getPieceValue(pieceB.type);
      });
      
      const bestCaptureIdx = favorableCapturesElsewhere[favorableCapturesElsewhere.length - 1]; // Highest value
      const captureMove = moves[bestCaptureIdx];
      const moveText = moveToText(captureMove);
      const targetPiece = state.board[captureMove.to.row]?.[captureMove.to.col];
      const pieceType = targetPiece?.type === "delantero" ? "F" :
                       targetPiece?.type === "mediocampista" ? "M" : "C";
      console.log(`[Gemini] ⚔️ DECISION: Found favorable capture move - ${moveText}`);
      console.log(`[Gemini] Reason: Capturing ${pieceType} (FAVORABLE - no loss or favorable trade)!`);
      const safeCaptureMove = captureMove.player === botPlayer ? captureMove : { ...captureMove, player: botPlayer };
      return safeCaptureMove;
    }
    
    // If we have captures (even not in goal columns) and no immediate goal threat, prioritize them
    // But exclude captures that allow opponent to score
    const safeCaptures = (forwardCaptures.concat(midfielderCaptures)).filter(
      idx => !movesAllowingGoal.includes(idx)
    );
    
    if (safeCaptures.length > 0 && !opponentCanScoreNow) {
      // Sort by captured piece value
      safeCaptures.sort((a, b) => {
        const moveA = moves[a];
        const moveB = moves[b];
        const pieceA = state.board[moveA.to.row]?.[moveA.to.col];
        const pieceB = state.board[moveB.to.row]?.[moveB.to.col];
        if (!pieceA || !pieceB) return 0;
        return getPieceValue(pieceA.type) - getPieceValue(pieceB.type);
      });
      
      const captureIdx = safeCaptures[safeCaptures.length - 1]; // Highest value
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
      
      // CRITICAL: Filter out moves that expose delanteros to capture (especially by defensas)
      // These are TOO risky and should be avoided completely
      if (piece.type === "delantero") {
        // Apply the move to check what happens
        try {
          const simState: GameState = { ...state, turn: botPlayer };
          const moveOutcome = RuleEngine.applyMove(simState, move);
          const moveText = moveToText(move);
          
          console.log(`[Gemini] 🔍 Analyzing delantero move ${idx + 1}: ${moveText}`);
          
          // Log if this is a capture
          if (moveOutcome.capture) {
            const capturedValue = getPieceValue(moveOutcome.capture.type);
            console.log(`[Gemini]   📊 This move CAPTURES: ${moveOutcome.capture.type} (value: ${capturedValue})`);
          }
          
          const oppStateAfterMove: GameState = {
            ...moveOutcome.nextState,
            turn: opponent as PlayerId,
          };
          const nextOppMoves = RuleEngine.getLegalMoves(oppStateAfterMove, opponent);
          
          console.log(`[Gemini]   🔍 Checking opponent's ${nextOppMoves.length} possible moves after this delantero move...`);
          
          // Check if opponent can capture this delantero (especially by defensa - very bad!)
          let canBeCapturedByDefensa = false;
          let canBeCaptured = false;
          let capturingPieceType: string | null = null;
          let capturingPiecePosition: string | null = null;
          
          for (const oppMove of nextOppMoves) {
            if (oppMove.to.row === move.to.row && oppMove.to.col === move.to.col) {
              // Verify this capture is actually legal
              try {
                const oppSimState: GameState = { ...oppStateAfterMove, turn: opponent as PlayerId };
                const oppOutcome = RuleEngine.applyMove(oppSimState, oppMove);
                
                // Check if opponent actually captures our delantero at this position
                const movedDelantero = moveOutcome.nextState.board[move.to.row]?.[move.to.col];
                if (oppOutcome.capture && movedDelantero && 
                    oppOutcome.capture.id === movedDelantero.id) {
                  canBeCaptured = true;
                  // Check what piece type is capturing
                  const oppPiece = oppStateAfterMove.board[oppMove.from.row]?.[oppMove.from.col];
                  if (oppPiece && oppPiece.owner === opponent) {
                    capturingPieceType = oppPiece.type;
                    const fromCol = String.fromCharCode(65 + oppMove.from.col);
                    capturingPiecePosition = `${capturingPieceType} at ${fromCol}${oppMove.from.row + 1}`;
                    if (oppPiece.type === "defensa") {
                      canBeCapturedByDefensa = true;
                      console.log(`[Gemini]   ⚠️⚠️ CRITICAL THREAT DETECTED: Defensa can capture this delantero!`);
                      break;
                    }
                  }
                }
              } catch (e) {
                // Invalid move, skip
              }
            }
          }
          
          // If delantero can be captured by defensa, ALWAYS filter it out (too bad!)
          if (canBeCapturedByDefensa) {
            console.log(`[Gemini] 🚫 FILTERED OUT: Delantero move ${idx + 1} (${moveText})`);
            console.log(`[Gemini]   ❌ REASON: Exposes delantero (value 100) to defensa capture - TOO RISKY!`);
            console.log(`[Gemini]   📍 Capturing piece: ${capturingPiecePosition}`);
            if (moveOutcome.capture) {
              const capturedValue = getPieceValue(moveOutcome.capture.type);
              console.log(`[Gemini]   💰 Trade value: -100 (delantero) + ${capturedValue} (${moveOutcome.capture.type}) = ${capturedValue - 100} (HORRIBLE TRADE!)`);
            }
            continue;
          }
          
          // If delantero can be captured, filter it out unless:
          // 1. It blocks a critical goal threat, OR
          // 2. It's a very favorable capture (captures much more valuable piece)
          const preventsGoal = blockingMoves.includes(idx);
          console.log(`[Gemini]   🛡️ Blocks goal threat: ${preventsGoal}`);
          
          if (canBeCaptured && !preventsGoal) {
            console.log(`[Gemini]   ⚠️ WARNING: Delantero can be captured by ${capturingPieceType || "opponent piece"}`);
            console.log(`[Gemini]   📍 Capturing piece: ${capturingPiecePosition}`);
            
            // Check if it's a favorable capture
            const isFavorableCapture = valuableCaptures.includes(idx);
            console.log(`[Gemini]   💰 Marked as favorable capture: ${isFavorableCapture}`);
            
            // Even if it's marked as favorable, if it exposes delantero to any capture, 
            // we should be very cautious (delantero = 100 value)
            // Only allow if capturing a delantero (value 100) or if captured value >> 100
            if (!isFavorableCapture) {
              console.log(`[Gemini] 🚫 FILTERED OUT: Delantero move ${idx + 1} (${moveText})`);
              console.log(`[Gemini]   ❌ REASON: Exposes delantero to ${capturingPieceType || "piece"} capture without sufficient compensation`);
              if (moveOutcome.capture) {
                const capturedValue = getPieceValue(moveOutcome.capture.type);
                console.log(`[Gemini]   💰 Trade value: -100 (delantero) + ${capturedValue} (${moveOutcome.capture.type}) = ${capturedValue - 100} (BAD TRADE!)`);
              }
              continue;
            } else {
              // Even if favorable, if capturing piece is not defensa but still captures, be cautious
              // Check the captured piece value from the outcome
              const capturedPiece = moveOutcome.capture;
              if (capturedPiece) {
                const capturedValue = getPieceValue(capturedPiece.type);
                console.log(`[Gemini]   💰 Evaluating trade: Delantero (100) vs ${capturedPiece.type} (${capturedValue})`);
                // Only allow if capturing a delantero (value 100) - otherwise too risky
                if (capturedValue < 100) {
                  console.log(`[Gemini] 🚫 FILTERED OUT: Delantero move ${idx + 1} (${moveText})`);
                  console.log(`[Gemini]   ❌ REASON: Exposes delantero (value 100) to capture for ${capturedPiece.type} (value ${capturedValue}) - NOT WORTH IT!`);
                  console.log(`[Gemini]   💰 Trade value: -100 (delantero) + ${capturedValue} (${capturedPiece.type}) = ${capturedValue - 100} (UNFAVORABLE TRADE!)`);
                  console.log(`[Gemini]   📊 Even though marked as "favorable", losing a delantero for a lower-value piece is too risky!`);
                  continue;
                } else {
                  console.log(`[Gemini]   ✅ ALLOWED: Capturing delantero (100) with delantero (100) - acceptable trade`);
                }
              }
            }
          } else if (canBeCaptured && preventsGoal) {
            console.log(`[Gemini]   ⚠️ WARNING: Delantero can be captured BUT it blocks a critical goal threat - ALLOWING (defense is critical!)`);
          } else if (!canBeCaptured) {
            console.log(`[Gemini]   ✅ SAFE: Delantero move does not expose it to capture`);
          }
          
          if (!canBeCapturedByDefensa && (!canBeCaptured || preventsGoal || (moveOutcome.capture && getPieceValue(moveOutcome.capture.type) >= 100))) {
            console.log(`[Gemini]   ✅ ALLOWING delantero move ${idx + 1} (${moveText})`);
          }
        } catch (e) {
          // Invalid move, skip it
          console.log(`[Gemini] ⚠️ Invalid move ${idx + 1} (${moveToText(move)}), skipping: ${e instanceof Error ? e.message : String(e)}`);
          continue;
        }
      }
      
      // For all other pieces: include moves (but risky ones are marked in prompt)
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
    // PRO LEVEL: Evaluate more moves (30 instead of 20) for better strategic choice
    const movesToEvaluateLimit = isPro ? 30 : 20;
    const movesToEvaluate = finalMovesToConsider.slice(0, movesToEvaluateLimit);
    // Keep track of which original indices correspond to movesToEvaluate
    const evaluateIndices = validMoves.length > 0 
      ? validMoveIndices.slice(0, movesToEvaluateLimit)
      : moves.slice(0, movesToEvaluateLimit).map((_, i) => i);
    
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
        else if (valuableCaptures.includes(originalIdx)) {
          // Favorable capture - no loss or favorable trade
          const isGoalColCapture = [3, 4].includes(move.to.col);
          const targetPiece = state.board[move.to.row]?.[move.to.col];
          const pieceType = targetPiece?.type === "delantero" ? "F" :
                           targetPiece?.type === "mediocampista" ? "M" : "C";
          extra += isGoalColCapture 
            ? ` [✅⚔️ FAVORABLE CAPTURE ${pieceType} in GOAL COL! No loss or good trade!]` 
            : ` [✅⚔️ FAVORABLE CAPTURE ${pieceType} - No loss or favorable trade!]`;
        }
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

STRATEGIC PRIORITIES:
1. Score goals when possible
2. Capture pieces when favorable (no loss or good trade)
3. Block opponent goals when threatened
4. Advance pieces toward opponent goal safely
5. Control key positions (goal columns D-E, center columns)

IMPORTANT PRINCIPLES:
- Piece values: F=100, M=50, C=30, D=10 (use for evaluating trades)
- Protect your valuable pieces (F/M) - never expose them to capture unless it's absolutely critical
- Capturing removes threats permanently; blocking only delays them
- Think ahead: consider what opponent can do after your move

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

KEY MOVES TO CONSIDER:
- [GOAL!] 🎯 = Can score immediately - highest priority
- [✅⚔️ FAVORABLE CAPTURE] = Capture without losing anything or with good trade - very high priority
- [⚔️⚔️ CRITICAL: CAPTURE in GOAL COL] = Capture in goal column - removes threat permanently
- [⚔️ CAPTURE] = Capture opponent piece - generally good
- [BLOCKS THREAT] = Blocks opponent from scoring - important for defense
- [⚠️ RISKY] = Exposes your valuable piece - avoid unless critical
- [⚠️⚠️ CRITICAL RISK] = Allows opponent to score - almost never select

CRITICAL RULES:
- NEVER expose delanteros (F) to capture unless absolutely necessary
- NEVER select moves that allow opponent to score unless no other option
- Always evaluate: "After this move, can opponent capture my valuable piece or score a goal?"
- Favor moves that improve your position without weakening it

DECISION PROCESS:
1. Can I score? → Do it
2. Can opponent score next turn? → Block it
3. Can I capture safely (no loss or good trade)? → Consider it
4. Can I advance safely without exposing pieces? → Consider it
5. Does this move weaken my position? → Avoid it

Think strategically: Choose the move that improves your position while minimizing risk.
Balance attack and defense based on the current game situation.
${isPro ? `\n🔥 PRO LEVEL - ADVANCED STRATEGY:\nYou are playing at the highest difficulty level. Apply these advanced concepts:\n- MULTI-TURN PLANNING: Consider 2-3 moves ahead - how does this move affect future positions?\n- COMBINATIONS: Look for sequences of moves that create multiple threats (double attacks)\n- PIECE COORDINATION: Position pieces to work together - support attacks with M/C while advancing F\n- PROPHYLACTIC MOVES: Anticipate opponent threats and prevent them BEFORE they become dangerous\n- TEMPO: Each move should improve your position - avoid moves that waste time or don't advance your plan\n- POSITIONAL ADVANTAGE: Control key squares, especially in columns D-E near opponent goal\n- ENDGAME AWARENESS: If score is tied or close, prioritize defense and safe play. If ahead, simplify. If behind, take calculated risks.\n- VARIANT EVALUATION: Consider multiple candidate moves and evaluate which leads to the best long-term position\nThink strategically about the entire game flow, not just the immediate move!\n` : ""}
${playingStyle ? `\n${getPlayingStyleInstructions(playingStyle)}\n` : ""}

---
FINAL INSTRUCTION - RESPOND NOW:
Output ONLY a single integer number from 1 to ${movesToEvaluate.length}.
Do not include any text, explanation, or punctuation. Just the number.
Examples of correct responses:
- If you choose move 3, respond: 3
- If you choose move 12, respond: 12
- If you choose move 1, respond: 1

Now output your choice (just the number):`;

    // Pro level: Higher temperature for more creative/strategic play
    const temperature = isPro ? 0.4 : 0.1;
    
    if (isPro) {
      console.log(`[Gemini] 🔥 PRO LEVEL ACTIVE - Enhanced strategic analysis with ${movesToEvaluate.length} moves evaluated`);
    }
    
    console.log(`[Gemini] 📤 Preparing to send request to Gemini API:`);
    console.log(`[Gemini]   - Moves to evaluate: ${movesToEvaluate.length}`);
    console.log(`[Gemini]   - Current threats: ${currentThreatsList.length > 0 ? currentThreatsList.join(", ") : "None"}`);
    console.log(`[Gemini]   - Prompt length: ${prompt.length} characters`);
    console.log(`[Gemini]   - Temperature: ${temperature}`);
    console.log(`[Gemini]   - Max output tokens: ${GEMINI_MAX_OUTPUT_TOKENS.toLocaleString()} (monitoring actual usage)`);
    console.log(`[Gemini]   - Model: gemini-2.5-flash`);
    
    // Check if prompt is too long (Gemini has limits)
    const maxPromptLength = 100000; // Approximate limit for Gemini Flash
    if (prompt.length > maxPromptLength) {
      console.warn(`[Gemini] ⚠️ WARNING: Prompt is very long (${prompt.length} chars), may cause issues!`);
      console.warn(`[Gemini] ⚠️ Consider reducing number of moves evaluated or simplifying prompt`);
    }
    
    let text: string = "";
    
    // Retry configuration for overloaded service (503 errors)
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const requestStartTime = Date.now();
        if (attempt > 1) {
          console.log(`[Gemini] 🔄 Retry attempt ${attempt}/${maxRetries}...`);
        } else {
          console.log(`[Gemini] 🚀 Sending request to Gemini API at ${new Date().toISOString()}...`);
        }
        
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature, // Pro: 0.4 for creativity, others: 0.1 for consistency
            maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS, // Very large limit to avoid truncation - we'll monitor actual usage
            topP: 0.95,
            topK: 40,
          },
        });
        
        const requestDuration = Date.now() - requestStartTime;
        console.log(`[Gemini] ⏱️ Request completed in ${requestDuration}ms`);
        
        // Log response details
        const response = await result.response;
        console.log(`[Gemini] 📥 Response received from Gemini:`);
        console.log(`[Gemini]   - Response object exists: ${!!response}`);
        console.log(`[Gemini]   - Candidate count: ${response.candidates?.length || 0}`);
        
        // Log token usage if available
        if (response.usageMetadata) {
          const usage = response.usageMetadata;
          const promptTokens = usage.promptTokenCount || 0;
          const completionTokens = usage.completionTokenCount || 0;
          const totalTokens = usage.totalTokenCount || 0;
          
          // Fallback: Calculate completion tokens from total - prompt if completionTokenCount is missing or 0
          const actualCompletionTokens = completionTokens > 0 
            ? completionTokens 
            : Math.max(0, totalTokens - promptTokens);
          
          const completionPercent = actualCompletionTokens > 0 
            ? Math.round((actualCompletionTokens / GEMINI_MAX_OUTPUT_TOKENS) * 100) 
            : 0;
          
          console.log(`[Gemini] 📊 Token Usage Statistics:`);
          console.log(`[Gemini]   - Prompt tokens: ${promptTokens.toLocaleString()}`);
          console.log(`[Gemini]   - Completion tokens: ${actualCompletionTokens.toLocaleString()} / ${GEMINI_MAX_OUTPUT_TOKENS.toLocaleString()} (${completionPercent}% of max)`);
          if (completionTokens === 0 && actualCompletionTokens > 0) {
            console.log(`[Gemini]   - Note: Calculated from total - prompt (API didn't provide completionTokenCount)`);
          }
          console.log(`[Gemini]   - Total tokens (prompt + completion): ${totalTokens.toLocaleString()}`);
          
          // Cost estimation (approximate - Gemini Flash pricing as of 2024)
          // Note: Actual pricing may vary, this is for monitoring purposes only
          const promptCostPer1M = 0.075; // $0.075 per 1M input tokens
          const outputCostPer1M = 0.30; // $0.30 per 1M output tokens
          const estimatedPromptCost = (promptTokens / 1000000) * promptCostPer1M;
          const estimatedOutputCost = (actualCompletionTokens / 1000000) * outputCostPer1M;
          const estimatedTotalCost = estimatedPromptCost + estimatedOutputCost;
          
          if (estimatedTotalCost > 0) {
            console.log(`[Gemini]   - Estimated cost: $${estimatedTotalCost.toFixed(6)} (prompt: $${estimatedPromptCost.toFixed(6)}, output: $${estimatedOutputCost.toFixed(6)})`);
          }
          
          // Warn if using significant portion of max output tokens
          if (completionPercent > 10) {
            console.warn(`[Gemini] ⚠️ Using ${completionPercent}% of max output tokens - response may be verbose`);
          }
          
          // Log raw usage metadata structure for debugging if there's a discrepancy
          if (completionTokens === 0 && actualCompletionTokens > 0) {
            console.log(`[Gemini] 🔍 Debug: usageMetadata structure:`, JSON.stringify({
              promptTokenCount: usage.promptTokenCount,
              completionTokenCount: usage.completionTokenCount,
              totalTokenCount: usage.totalTokenCount,
              calculatedCompletion: actualCompletionTokens,
            }));
          }
        } else {
          console.warn(`[Gemini] ⚠️ No usage metadata available in response`);
        }
        
        if (response.candidates && response.candidates.length > 0) {
          const candidate = response.candidates[0];
          console.log(`[Gemini]   - Finish reason: ${candidate.finishReason || "unknown"}`);
          console.log(`[Gemini]   - Safety ratings:`, candidate.safetyRatings?.map((r: any) => `${r.category}=${r.probability}`).join(", ") || "none");
          
          if (candidate.finishReason && candidate.finishReason !== "STOP") {
            console.warn(`[Gemini] ⚠️ WARNING: Finish reason is "${candidate.finishReason}" - not "STOP"!`);
            console.warn(`[Gemini] ⚠️ This might indicate the response was blocked or truncated`);
          }
        } else {
          console.warn(`[Gemini] ⚠️ WARNING: No candidates in response!`);
        }
        
        // Check for blocked content
        if (response.promptFeedback) {
          console.log(`[Gemini] 📋 Prompt feedback:`, {
            blockReason: response.promptFeedback.blockReason,
            safetyRatings: response.promptFeedback.safetyRatings?.map((r: any) => `${r.category}=${r.probability}`),
          });
          if (response.promptFeedback.blockReason) {
            console.error(`[Gemini] ❌ ERROR: Prompt was blocked! Reason: ${response.promptFeedback.blockReason}`);
            console.error(`[Gemini] ❌ This explains why no content was generated - the prompt was filtered!`);
            // Force text to empty to trigger fallback
            text = "";
          }
        } else {
          console.log(`[Gemini] ✅ No prompt feedback issues detected`);
        }
        
        // Try multiple methods to extract text
        try {
          text = response.text().trim();
        } catch (textError) {
          console.warn(`[Gemini] ⚠️ response.text() failed, trying alternative extraction methods...`);
          
          // Method 1: Try to extract from candidates directly
          if (response.candidates && response.candidates.length > 0) {
            const candidate = response.candidates[0];
            if (candidate.content && candidate.content.parts) {
              const parts = candidate.content.parts.filter((p: any) => p.text);
              if (parts.length > 0) {
                text = parts.map((p: any) => p.text).join(" ").trim();
                console.log(`[Gemini] ✅ Recovered text from candidate.parts: "${text}"`);
              } else {
                // Check if there's any content structure
                console.warn(`[Gemini] ⚠️ candidate.content.parts exists but no text parts found`);
                console.warn(`[Gemini] ⚠️ Parts structure:`, JSON.stringify(candidate.content.parts?.map((p: any) => ({ type: p.type, hasText: !!p.text }))));
              }
            } else {
              console.warn(`[Gemini] ⚠️ candidate.content or candidate.content.parts is missing`);
            }
          }
          
          // If still no text and MAX_TOKENS, try to see if there's any partial content
          if (!text && response.candidates && response.candidates.length > 0) {
            const candidate = response.candidates[0];
            if (candidate.finishReason === "MAX_TOKENS") {
              console.warn(`[Gemini] ⚠️ MAX_TOKENS with empty content - model may need more tokens or prompt is too complex`);
              // Log full candidate structure for debugging
              console.warn(`[Gemini] 🔍 Full candidate structure:`, JSON.stringify({
                finishReason: candidate.finishReason,
                hasContent: !!candidate.content,
                contentKeys: candidate.content ? Object.keys(candidate.content) : [],
                partsCount: candidate.content?.parts?.length || 0,
              }, null, 2));
            }
          }
          
          if (!text) {
            text = "";
            console.error(`[Gemini] ❌ ERROR: Failed to extract text from response!`);
            console.error(`[Gemini] Error:`, textError);
          }
        }
        
        console.log(`[Gemini] 📝 Raw response text: "${text}"`);
        console.log(`[Gemini] 📏 Response text length: ${text.length} characters`);
        
        // Check for MAX_TOKENS finish reason (indicates truncation)
        if (response.candidates && response.candidates.length > 0) {
          const candidate = response.candidates[0];
          if (candidate.finishReason === "MAX_TOKENS") {
            console.warn(`[Gemini] ⚠️ WARNING: Response truncated due to MAX_TOKENS limit!`);
            console.warn(`[Gemini] ⚠️ Current maxOutputTokens: ${GEMINI_MAX_OUTPUT_TOKENS.toLocaleString()}`);
            console.warn(`[Gemini] ⚠️ This should not happen with such a large limit - investigate prompt complexity`);
            
            // Log token usage to understand why MAX_TOKENS was hit
            if (response.usageMetadata) {
              const usage = response.usageMetadata;
              const promptTokens = usage.promptTokenCount || 0;
              const completionTokens = usage.completionTokenCount || 0;
              const totalTokens = usage.totalTokenCount || 0;
              console.warn(`[Gemini] ⚠️ Token usage at MAX_TOKENS: prompt=${promptTokens}, completion=${completionTokens}, total=${totalTokens}`);
              
              // Check if prompt is consuming too many tokens
              const estimatedPromptTokens = Math.ceil(prompt.length / 4); // Rough estimate: ~4 chars per token
              if (promptTokens > 30000) {
                console.error(`[Gemini] ❌ ERROR: Prompt is consuming ${promptTokens} tokens - may be too complex!`);
                console.error(`[Gemini] ❌ Consider reducing number of moves evaluated or simplifying prompt structure`);
              }
            }
            
            // Try to extract partial content if available
            if (!text && candidate.content && candidate.content.parts) {
              const parts = candidate.content.parts.filter((p: any) => p.text);
              if (parts.length > 0) {
                text = parts.map((p: any) => p.text).join(" ").trim();
                console.log(`[Gemini] ✅ Extracted partial text from truncated response: "${text}"`);
              } else {
                // MAX_TOKENS with empty content - this is unusual and suggests the model couldn't generate anything
                console.error(`[Gemini] ❌ ERROR: MAX_TOKENS with empty content - model may be blocked or confused by prompt`);
                console.error(`[Gemini] ❌ This suggests the prompt structure or complexity is preventing generation`);
                // Force text to empty to trigger fallback
                text = "";
              }
            }
          }
        }
        
        if (!text || text === "" || text === '""') {
          console.error(`[Gemini] ❌ ERROR: Empty response detected!`);
          console.error(`[Gemini] 🔍 Debugging info:`);
          console.error(`[Gemini]   - Response object:`, JSON.stringify({
            candidates: response.candidates?.map((c: any) => ({
              finishReason: c.finishReason,
              safetyRatings: c.safetyRatings,
              content: c.content?.parts?.map((p: any) => ({ 
                text: p.text?.substring(0, 100),
                type: p.type 
              })) || [],
            })),
            promptFeedback: response.promptFeedback,
          }, null, 2));
        }
        // If we get here, the request was successful - break out of retry loop
        break;
        
      } catch (apiError: any) {
        lastError = apiError;
        console.error(`[Gemini] ❌ ERROR: Exception during Gemini API call (attempt ${attempt}/${maxRetries})!`);
        console.error(`[Gemini] Error type: ${apiError instanceof Error ? apiError.constructor.name : typeof apiError}`);
        console.error(`[Gemini] Error message: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
        
        // Check if it's a 503 error (service overloaded) - retry with backoff
        const isServiceUnavailable = apiError?.status === 503 || 
                                     (typeof apiError?.message === 'string' && apiError.message.includes('503')) ||
                                     (typeof apiError?.message === 'string' && apiError.message.includes('overloaded'));
        
        if (isServiceUnavailable && attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = baseDelay * Math.pow(2, attempt - 1);
          console.warn(`[Gemini] ⚠️ Service overloaded (503). Retrying in ${delay}ms... (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Retry
        }
        
        // If it's not a 503, or we've exhausted retries, log and break
        if (apiError instanceof Error && apiError.stack) {
          console.error(`[Gemini] Error stack:`, apiError.stack);
        }
        console.error(`[Gemini] Full error object:`, apiError);
        
        // Try to extract more details if it's a GoogleGenerativeAI error
        if (apiError && typeof apiError === 'object') {
          console.error(`[Gemini] Error details:`, JSON.stringify(apiError, Object.getOwnPropertyNames(apiError), 2));
        }
        
        // If this was the last attempt, set text to empty so fallback logic runs
        if (attempt === maxRetries) {
          console.error(`[Gemini] ❌ All ${maxRetries} attempts failed. Using fallback strategy.`);
          text = "";
          break;
        }
      }
    }

    // Check if response is empty or invalid
    if (!text || text === "" || text === '""') {
      console.log(`[Gemini] ⚠️ WARNING: Gemini returned empty response!`);
      console.log(`[Gemini] 🔍 This could indicate:`);
      console.log(`[Gemini]   1. API issue or rate limiting`);
      console.log(`[Gemini]   2. Prompt too complex or malformed`);
      console.log(`[Gemini]   3. Model error`);
      console.log(`[Gemini] 💡 Falling back to safe move selection...`);
    }

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
        
        console.log(`[Gemini] ============================================================`);
        console.log(`[Gemini] ✅✅✅ GEMINI AI DECISION ✅✅✅`);
        console.log(`[Gemini] ============================================================`);
        console.log(`[Gemini] ✅ SELECTED MOVE #${moveIndex + 1}: ${moveText} (${pieceType})`);
        console.log(`[Gemini] 📍 From: ${String.fromCharCode(65 + selectedMove.from.col)}${selectedMove.from.row + 1}`);
        console.log(`[Gemini] 📍 To: ${String.fromCharCode(65 + selectedMove.to.col)}${selectedMove.to.row + 1}`);
        console.log(`[Gemini] 🎯 Original move index in full list: ${originalIdx + 1}`);
        console.log(`[Gemini] 🤖 DECISION SOURCE: Gemini AI (parsed from API response)`);
        
        // Check if this is a delantero move and log risks
        if (piece?.type === "delantero") {
          console.log(`[Gemini] ⚠️ ATTENTION: This is a DELANTERO move - checking for risks...`);
          try {
            const simState: GameState = { ...state, turn: botPlayer };
            const moveOutcome = RuleEngine.applyMove(simState, selectedMove);
            const oppStateAfterMove: GameState = {
              ...moveOutcome.nextState,
              turn: opponent as PlayerId,
            };
            const nextOppMoves = RuleEngine.getLegalMoves(oppStateAfterMove, opponent);
            
            let canBeCaptured = false;
            let capturingPieceInfo: string | null = null;
            
            for (const oppMove of nextOppMoves) {
              if (oppMove.to.row === selectedMove.to.row && oppMove.to.col === selectedMove.to.col) {
                try {
                  const oppSimState: GameState = { ...oppStateAfterMove, turn: opponent as PlayerId };
                  const oppOutcome = RuleEngine.applyMove(oppSimState, oppMove);
                  const movedDelantero = moveOutcome.nextState.board[selectedMove.to.row]?.[selectedMove.to.col];
                  if (oppOutcome.capture && movedDelantero && 
                      oppOutcome.capture.id === movedDelantero.id) {
                    canBeCaptured = true;
                    const oppPiece = oppStateAfterMove.board[oppMove.from.row]?.[oppMove.from.col];
                    if (oppPiece && oppPiece.owner === opponent) {
                      const fromCol = String.fromCharCode(65 + oppMove.from.col);
                      capturingPieceInfo = `${oppPiece.type} at ${fromCol}${oppMove.from.row + 1}`;
                      break;
                    }
                  }
                } catch (e) {
                  // Invalid move, skip
                }
              }
            }
            
            if (canBeCaptured) {
              console.log(`[Gemini] ⚠️⚠️ WARNING: Selected delantero move exposes it to capture by ${capturingPieceInfo}!`);
              if (moveOutcome.capture) {
                const capturedValue = getPieceValue(moveOutcome.capture.type);
                console.log(`[Gemini] ⚠️⚠️ Trade analysis: -100 (delantero) + ${capturedValue} (${moveOutcome.capture.type}) = ${capturedValue - 100}`);
                if (capturedValue < 100) {
                  console.log(`[Gemini] ⚠️⚠️ CRITICAL: This is an unfavorable trade! Gemini chose a risky move!`);
                }
              }
            } else {
              console.log(`[Gemini] ✅ Delantero move is safe - no immediate capture threat`);
            }
          } catch (e) {
            console.log(`[Gemini] ⚠️ Could not verify delantero move safety: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        
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
        
        // Final summary: This move was chosen by Gemini AI
        console.log(`[Gemini] ============================================================`);
        console.log(`[Gemini] 🤖 FINAL DECISION: GEMINI AI (Successfully parsed from API)`);
        console.log(`[Gemini] ============================================================`);
        
        return selectedMove;
      } else {
        console.warn(`[Gemini] ❌ Move number out of range: ${moveIndex} (Available: 0-${movesToEvaluate.length - 1})`);
      }
    }

    console.warn(`[Gemini] ⚠️ Could not parse move recommendation from response: "${text}", using fallback strategy`);
    // Fallback: prefer safe moves, avoid risky ones
    console.log(`[Gemini] ============================================================`);
    console.log(`[Gemini] 🔄🔄🔄 FALLBACK STRATEGY 🔄🔄🔄`);
    console.log(`[Gemini] ============================================================`);
    console.log(`[Gemini] ⚠️ Falling back to priority-based selection (Gemini response unparseable)`);
    console.log(`[Gemini] 🔍 Fallback will prioritize SAFE moves over risky ones`);
    console.log(`[Gemini] 🤖 DECISION SOURCE: Fallback algorithm (not Gemini AI)`);
    
    // Helper function to ensure move has correct player field
    const ensureCorrectPlayer = (move: Move): Move => {
      return move.player === botPlayer ? move : { ...move, player: botPlayer };
    };
    
    // Helper function to filter out risky moves from a list
    const filterSafeMoves = (moveIndices: number[]): number[] => {
      return moveIndices.filter(idx => {
        // Exclude risky moves
        if (riskyMoves.includes(idx)) {
          return false;
        }
        // Exclude moves that allow opponent to score
        if (movesAllowingGoal.includes(idx)) {
          return false;
        }
        // Exclude moves from validMoves that were filtered out (delanteros that expose themselves)
        // We can check if the move is in validMoves (it means it passed our safety filters)
        const move = moves[idx];
        const isValidMove = validMoves.some(vm => 
          vm.from.row === move.from.row && 
          vm.from.col === move.from.col &&
          vm.to.row === move.to.row &&
          vm.to.col === move.to.col
        );
        return isValidMove;
      });
    };
    
    // Try to find safe moves first
    console.log(`[Gemini] 📊 Fallback analysis:`);
    console.log(`  - Risky moves to avoid: ${riskyMoves.length}`);
    console.log(`  - Moves allowing opponent goal: ${movesAllowingGoal.length}`);
    console.log(`  - Valid safe moves available: ${validMoves.length}`);
    
    // Priority 1: Favorable captures (safe)
    const safeForwardCaptures = filterSafeMoves(forwardCaptures);
    if (safeForwardCaptures.length > 0) {
      const fallbackMove = ensureCorrectPlayer(moves[safeForwardCaptures[0]]);
      console.log(`[Gemini] 🔄 FALLBACK: Using SAFE forward capture - ${moveToText(fallbackMove)}`);
      console.log(`[Gemini] ✅ This move is SAFE (not risky, doesn't allow goal)`);
      console.log(`[Gemini] ============================================================`);
      console.log(`[Gemini] 🤖 FINAL DECISION: FALLBACK (Priority-based selection)`);
      console.log(`[Gemini] ============================================================`);
      return fallbackMove;
    }
    
    // Priority 2: Safe forward advances (not risky)
    const safeForwardAdvances = filterSafeMoves(forwardAdvances);
    if (safeForwardAdvances.length > 0) {
      const fallbackMove = ensureCorrectPlayer(moves[safeForwardAdvances[0]]);
      console.log(`[Gemini] 🔄 FALLBACK: Using SAFE forward advance - ${moveToText(fallbackMove)}`);
      console.log(`[Gemini] ✅ This move is SAFE (not risky, doesn't allow goal)`);
      console.log(`[Gemini] ============================================================`);
      console.log(`[Gemini] 🤖 FINAL DECISION: FALLBACK (Priority-based selection)`);
      console.log(`[Gemini] ============================================================`);
      return fallbackMove;
    }
    
    // Priority 3: Safe midfielder captures
    const safeMidfielderCaptures = filterSafeMoves(midfielderCaptures);
    if (safeMidfielderCaptures.length > 0) {
      const fallbackMove = ensureCorrectPlayer(moves[safeMidfielderCaptures[0]]);
      console.log(`[Gemini] 🔄 FALLBACK: Using SAFE midfielder capture - ${moveToText(fallbackMove)}`);
      console.log(`[Gemini] ✅ This move is SAFE (not risky, doesn't allow goal)`);
      console.log(`[Gemini] ============================================================`);
      console.log(`[Gemini] 🤖 FINAL DECISION: FALLBACK (Priority-based selection)`);
      console.log(`[Gemini] ============================================================`);
      return fallbackMove;
    }
    
    // Priority 4: Safe midfielder advances
    const safeMidfielderAdvances = filterSafeMoves(midfielderAdvances);
    if (safeMidfielderAdvances.length > 0) {
      const fallbackMove = ensureCorrectPlayer(moves[safeMidfielderAdvances[0]]);
      console.log(`[Gemini] 🔄 FALLBACK: Using SAFE midfielder advance - ${moveToText(fallbackMove)}`);
      console.log(`[Gemini] ✅ This move is SAFE (not risky, doesn't allow goal)`);
      console.log(`[Gemini] ============================================================`);
      console.log(`[Gemini] 🤖 FINAL DECISION: FALLBACK (Priority-based selection)`);
      console.log(`[Gemini] ============================================================`);
      return fallbackMove;
    }
    
    // Priority 5: Valid defensive moves (they're already filtered to be safe)
    if (validDefensiveMoves.length > 0) {
      const fallbackMove = ensureCorrectPlayer(moves[validDefensiveMoves[0]]);
      console.log(`[Gemini] 🔄 FALLBACK: Using valid defensive move - ${moveToText(fallbackMove)}`);
      console.log(`[Gemini] ✅ This move is SAFE (defensa blocking/capturing)`);
      console.log(`[Gemini] ============================================================`);
      console.log(`[Gemini] 🤖 FINAL DECISION: FALLBACK (Priority-based selection)`);
      console.log(`[Gemini] ============================================================`);
      return fallbackMove;
    }
    
    // Priority 6: Use validMoves (already filtered for safety, especially delanteros)
    if (validMoves.length > 0) {
      const fallbackMove = ensureCorrectPlayer(validMoves[0]);
      console.log(`[Gemini] 🔄 FALLBACK: Using first valid safe move - ${moveToText(fallbackMove)}`);
      console.log(`[Gemini] ✅ This move passed safety filters`);
      console.log(`[Gemini] ============================================================`);
      console.log(`[Gemini] 🤖 FINAL DECISION: FALLBACK (Priority-based selection)`);
      console.log(`[Gemini] ============================================================`);
      return fallbackMove;
    }
    
    // Priority 7: If no safe moves, warn and use first move that's not allowing goal
    const safeMoves = moves.filter((move, idx) => {
      return !movesAllowingGoal.includes(idx) && !riskyMoves.includes(idx);
    });
    if (safeMoves.length > 0) {
      const fallbackMove = ensureCorrectPlayer(safeMoves[0]);
      console.log(`[Gemini] ⚠️ FALLBACK: No optimal safe moves, using first non-goal-allowing move - ${moveToText(fallbackMove)}`);
      console.log(`[Gemini] ⚠️ WARNING: This move may be risky but doesn't allow opponent goal`);
      console.log(`[Gemini] ============================================================`);
      console.log(`[Gemini] 🤖 FINAL DECISION: FALLBACK (Priority-based selection)`);
      console.log(`[Gemini] ============================================================`);
      return fallbackMove;
    }
    
    // Last resort: Use first available move (even if risky)
    console.log(`[Gemini] ⚠️⚠️ FALLBACK: LAST RESORT - No safe moves available!`);
    console.log(`[Gemini] ⚠️⚠️ WARNING: Using first available move even though it may be risky!`);
    console.log(`[Gemini] ⚠️⚠️ This should rarely happen - check why all moves are risky!`);
    const fallbackMove = ensureCorrectPlayer(moves[0]);
    console.log(`[Gemini] 🔄 FALLBACK: Using first available move - ${moveToText(fallbackMove)}`);
    console.log(`[Gemini] ============================================================`);
    console.log(`[Gemini] 🤖 FINAL DECISION: FALLBACK (Last resort)`);
    console.log(`[Gemini] ============================================================`);
    return fallbackMove;
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

