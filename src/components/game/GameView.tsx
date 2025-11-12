"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimePostgresUpdatePayload } from "@supabase/supabase-js";
import Link from "next/link";

import { useSupabase } from "@/components/providers/SupabaseProvider";
import { GoalCelebration } from "@/components/game/GoalCelebration";
import { useGameSounds } from "@/hooks/useGameSounds";
import type { Database, Json } from "@/lib/database.types";
import {
  BOARD_COLS,
  BOARD_ROWS,
  GOAL_COLS,
  RuleEngine,
  type GameState,
  type PlayerId,
  type Position,
} from "@/lib/ruleEngine";

type GameViewProps = {
  initialGameId: string;
  initialState: GameState;
  initialScore: GameState["score"];
  initialStatus: string;
  initialWinnerId: string | null;
  profileId: string;
  playerLabels: Record<PlayerId, string>;
  playerRole: PlayerId;
  opponentRole: PlayerId;
  playerIds: Record<PlayerId, string | null>;
  isBotGame: boolean;
  botPlayer: PlayerId | null;
  botDisplayName: string;
  showMoveHints: boolean;
};

const BOARD_CHANNEL_PREFIX = "game";

const pieceInitials = {
  carrilero: "C",
  defensa: "D",
  mediocampista: "M",
  delantero: "F",
};

type Selection = {
  origin: Position;
  moves: Position[];
};

const columnLabel = (col: number) => String.fromCharCode(65 + col); // A, B, C...

// Format position using actual board coordinates (row 0 = 12, row 11 = 1)
const formatPosition = (position: Position) => {
  const col = columnLabel(position.col);
  const row = BOARD_ROWS - position.row; // row 0 -> 12, row 11 -> 1
  return `${col}${row}`;
};

// Get row label for display based on player role (always show closest row as 1)
const getRowLabelForDisplay = (actualRow: number, playerRole: PlayerId): number => {
  if (playerRole === "home") {
    // Home sees row 11 as closest (bottom), so row 11 = 1, row 0 = 12
    return BOARD_ROWS - actualRow;
  } else {
    // Away sees row 0 as closest (bottom), so row 0 = 1, row 11 = 12
    return actualRow + 1;
  }
};

// Get column label for display based on player role
const getColumnLabelForDisplay = (actualCol: number, playerRole: PlayerId): string => {
  if (playerRole === "home") {
    // Home sees columns normally (0 = A, 7 = H)
    return columnLabel(actualCol);
  } else {
    // Away sees columns reversed (0 = H, 7 = A)
    return columnLabel(BOARD_COLS - 1 - actualCol);
  }
};

export function GameView({
  initialGameId,
  initialState,
  initialScore,
  initialStatus,
  initialWinnerId,
  profileId,
  playerLabels,
  playerRole,
  opponentRole,
  playerIds,
  isBotGame,
  botPlayer,
  botDisplayName,
  showMoveHints,
}: GameViewProps) {
  const { supabase } = useSupabase();

  const [gameState, setGameState] = useState<GameState>(initialState);
  const [score, setScore] = useState<GameState["score"]>(
    initialScore ?? initialState.score,
  );
  const [status, setStatus] = useState(initialStatus);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [players, setPlayers] = useState<Record<PlayerId, string | null>>(playerIds);
  const [winnerId, setWinnerId] = useState<string | null>(initialWinnerId);
  const [pendingMove, setPendingMove] = useState(false);
  const [showGoalCelebration, setShowGoalCelebration] = useState(false);
  const [goalScorer, setGoalScorer] = useState<string | null>(null);
  const [hasPlayedStartSound, setHasPlayedStartSound] = useState(false);
  const [previousScore, setPreviousScore] = useState<GameState["score"]>(initialScore ?? initialState.score);
  const previousHistoryLengthRef = useRef<number>((initialState.history?.length ?? 0));
  const boardRef = useRef<HTMLDivElement>(null);
  const { playSound } = useGameSounds();
  
  // Move hints state
  const [hoveredPiece, setHoveredPiece] = useState<Position | null>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [hintMoves, setHintMoves] = useState<Position[]>([]);

  // Row indices: Always show the player's goal at the bottom of the screen
  // When we map rowIndices, uiRow=0 renders first (top of screen), uiRow=11 renders last (bottom of screen)
  // HOME's goal is at row 11 (should be at bottom of screen, so uiRow=11)
  // AWAY's goal is at row 0 (should be at bottom of screen, so uiRow=11)
  const rowIndices = useMemo(
    () =>
      playerRole === "home"
        ? [...Array(BOARD_ROWS).keys()] // [0,1,2,...,11] - Row 0 (AWAY goal) at top, Row 11 (HOME goal) at bottom
        : [...Array(BOARD_ROWS).keys()].reverse(), // [11,10,9,...,0] - Row 11 (HOME goal) at top, Row 0 (AWAY goal) at bottom
    [playerRole],
  );

  // Column indices: Always show columns from player's perspective
  // HOME sees A-H from left to right
  // AWAY sees H-A from left to right (reversed)
  const colIndices = useMemo(
    () =>
      playerRole === "home"
        ? [...Array(BOARD_COLS).keys()]
        : [...Array(BOARD_COLS).keys()].reverse(),
    [playerRole],
  );

  const translateToActualPosition = (uiRow: number, uiCol: number): Position => ({
    row: rowIndices[uiRow],
    col: colIndices[uiCol],
  });

  useEffect(() => {
    if (!feedback || status === "finished") return;
    const timeout = window.setTimeout(() => {
      setFeedback(null);
    }, 4500);
    return () => window.clearTimeout(timeout);
  }, [feedback, status]);

  // Function to fetch latest game state from Supabase
  const fetchGameState = useCallback(async () => {
    try {
      console.log("[GameView] Fetching latest game state from Supabase...");
      const { data, error } = await supabase
        .from("games")
        .select("game_state, score, status, player_1_id, player_2_id, winner_id")
        .eq("id", initialGameId)
        .single();

      if (error) {
        console.error("[GameView] Error fetching game state:", error);
        return;
      }

      if (!data) {
        console.warn("[GameView] No game data returned from fetch");
        return;
      }

      // Type assertion to handle Supabase's type inference
      const gameData = data as {
        game_state: GameState | null;
        score: GameState["score"] | null;
        status: string;
        player_1_id: string;
        player_2_id: string | null;
        winner_id: string | null;
      };

      const nextState =
        (gameData.game_state as GameState | null) ??
        RuleEngine.createInitialState();
      const nextScore =
        (gameData.score as GameState["score"] | null) ??
        RuleEngine.createInitialState().score;

      console.log("[GameView] Fetched game state:", {
        turn: nextState.turn,
        score: nextScore,
        status: gameData.status,
        historyLength: nextState.history?.length ?? 0,
      });

      // Check if game just started
      const historyLength = nextState.history?.length ?? 0;
      const isGameStart = historyLength === 0 && status === "waiting" && gameData.status === "in_progress" && !hasPlayedStartSound;

      setGameState(nextState);
      setScore(nextScore);
      setStatus(gameData.status);
      setPlayers({
        home: gameData.player_1_id,
        away: gameData.player_2_id,
      });
      setWinnerId(gameData.winner_id ?? null);
      setPreviousScore(nextScore);
      
      // Update history length ref
      previousHistoryLengthRef.current = historyLength;

      // Play start sound if game just started
      if (isGameStart) {
        setTimeout(() => {
          playSound("whistle_start");
          setHasPlayedStartSound(true);
        }, 500);
      }
    } catch (error) {
      console.error("[GameView] Exception fetching game state:", error);
    }
  }, [initialGameId, supabase]);

  useEffect(() => {
    console.log("[GameView] Setting up Realtime subscription for game:", initialGameId);
    const channel = supabase
      .channel(`${BOARD_CHANNEL_PREFIX}:${initialGameId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "games",
          filter: `id=eq.${initialGameId}`,
        },
        (payload: RealtimePostgresUpdatePayload<Database["public"]["Tables"]["games"]["Row"]>) => {
          console.log("[GameView] Realtime update received:", {
            gameId: initialGameId,
            hasNew: !!payload.new,
            status: payload.new?.status,
            turn: (payload.new?.game_state as GameState | null)?.turn,
            score: payload.new?.score,
          });
          
          if (!payload.new) {
            console.warn("[GameView] Realtime update has no payload.new");
            return;
          }
          
          const nextState =
            (payload.new.game_state as GameState | null) ??
            RuleEngine.createInitialState();
          const nextScore =
            (payload.new.score as GameState["score"] | null) ??
            RuleEngine.createInitialState().score;

          console.log("[GameView] Updating local state:", {
            turn: nextState.turn,
            score: nextScore,
            status: payload.new.status,
            historyLength: nextState.history?.length ?? 0,
          });

          // Check if game just started (first move)
          const historyLength = nextState.history?.length ?? 0;
          const isGameStart = historyLength === 0 && status === "waiting" && payload.new.status === "in_progress";

          setGameState(nextState);
          setScore(nextScore);
          setStatus(payload.new.status);
          setPlayers({
            home: payload.new.player_1_id,
            away: payload.new.player_2_id,
          });
          setWinnerId(payload.new.winner_id ?? null);
          setPreviousScore(nextScore);
          
          // Update history length ref
          previousHistoryLengthRef.current = historyLength;

          // Play start sound when game begins
          if (isGameStart && !hasPlayedStartSound) {
            setTimeout(() => {
              playSound("whistle_start");
              setHasPlayedStartSound(true);
            }, 500);
          }
          
          // Goal detection and resume sound are handled by the useEffect that monitors gameState.history
          // This avoids duplicate triggers
        },
      )
      .subscribe((status) => {
        console.log("[GameView] Realtime subscription status:", status);
      });

    return () => {
      console.log("[GameView] Cleaning up Realtime subscription for game:", initialGameId);
      void supabase.removeChannel(channel);
    };
  }, [initialGameId, supabase]);

  // Poll for updates when it's the bot's turn (fallback for Realtime not working with admin updates)
  useEffect(() => {
    if (!isBotGame || !botPlayer || status !== "in_progress") return;
    
    const isBotTurnNow = gameState.turn === botPlayer;

    if (!isBotTurnNow) {
      console.log("[GameView] Not bot's turn, stopping polling");
      return;
    }

    console.log("[GameView] Bot's turn detected, starting polling for updates...");
    
    // Initial fetch after a short delay to allow bot to process
    const initialTimeout = setTimeout(() => {
      console.log("[GameView] Initial fetch after bot turn...");
      void fetchGameState();
    }, 1000);
    
    // Poll every 500ms while it's the bot's turn
    const pollInterval = setInterval(() => {
      console.log("[GameView] Polling for bot move update...");
      void fetchGameState();
    }, 500);

    return () => {
      console.log("[GameView] Cleaning up polling interval and timeout");
      clearTimeout(initialTimeout);
      clearInterval(pollInterval);
    };
  }, [isBotGame, botPlayer, status, gameState.turn, fetchGameState]);

  const currentTurnLabel =
    gameState.turn === playerRole
      ? playerLabels[playerRole]
      : playerLabels[opponentRole];
  const currentTurnIsPlayer = gameState.turn === playerRole;
  const startingLabel =
    gameState.startingPlayer === "home"
      ? playerLabels.home
      : playerLabels.away;
  const isInitialPhase =
    status === "in_progress" && (gameState.history?.length ?? 0) === 0;

  const canAct =
    !pendingMove &&
    status === "in_progress" &&
    gameState.turn === playerRole &&
    players[playerRole] === profileId;

  const handleSelect = (position: Position) => {
    const piece = gameState.board[position.row]?.[position.col];
    if (!piece || piece.owner !== playerRole) {
      setSelection(null);
      return;
    }

    const legalMoves = RuleEngine.getLegalMovesForPiece(gameState, position);
    setSelection({ origin: position, moves: legalMoves });
    setFeedback(null);
  };

  const handleMove = async (destination: Position) => {
    if (!selection) return;
    const move = {
      player: playerRole,
      from: selection.origin,
      to: destination,
    };

    const validation = RuleEngine.validateMove(gameState, move);

    if (!validation.valid) {
      setFeedback(validation.reason);
      setSelection(null);
      return;
    }

    setPendingMove(true);

    try {
      const outcome = RuleEngine.applyMove(gameState, move);
      const newScore = outcome.nextState.score;
      const goalScored = outcome.goal !== undefined;
      
      // Update history length ref for goal/resume detection
      // The useEffect that monitors gameState.history will detect the goal and show celebration
      const newHistoryLength = outcome.nextState.history?.length ?? 0;
      previousHistoryLengthRef.current = newHistoryLength - 1; // Set to previous length so useEffect detects the change
      
      setGameState(outcome.nextState);
      setScore(newScore);
      setSelection(null);
      
      // Update feedback based on move result
      if (goalScored) {
        const scoringLabel = playerLabels[playerRole];
        const updatedScore = newScore[playerRole] ?? 0;
        if (updatedScore >= 3) {
          setFeedback(`¡Victoria de ${scoringLabel}!`);
        } else {
          setFeedback(
            `¡Gol de ${scoringLabel}! El rival mueve primero tras el reinicio.`
          );
        }
      } else {
        setFeedback(null);
      }

      let nextStatus = status;
      let nextWinnerId: string | null = winnerId;
      if (goalScored) {
        const updatedScore = newScore[playerRole] ?? 0;
        if (updatedScore >= 3) {
          nextStatus = "finished";
          nextWinnerId = players[playerRole] ?? null;
        }
      }
      setStatus(nextStatus);
      setWinnerId(nextWinnerId);
      setPreviousScore(newScore);

      const response = await fetch("/api/games/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gameId: initialGameId,
          update: {
            game_state: outcome.nextState as unknown as Json,
            score: outcome.nextState.score as unknown as Json,
            status: nextStatus,
            winner_id: nextWinnerId,
          },
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setFeedback(data.error ?? "Error al actualizar la partida.");
      }
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Movimiento inválido.",
      );
    } finally {
      setPendingMove(false);
    }
  };

  const handleCellClick = (uiRow: number, uiCol: number) => {
    if (!canAct) return;
    const position = translateToActualPosition(uiRow, uiCol);

    if (
      selection &&
      selection.origin.row === position.row &&
      selection.origin.col === position.col
    ) {
      setSelection(null);
      return;
    }

    if (
      selection &&
      selection.moves.some(
        (move) => move.row === position.row && move.col === position.col,
      )
    ) {
      void handleMove(position);
      return;
    }

    handleSelect(position);
  };

  const isMoveOption = (uiRow: number, uiCol: number) => {
    const actual = translateToActualPosition(uiRow, uiCol);
    return selection?.moves.some(
      (move) => move.row === actual.row && move.col === actual.col,
    );
  };

  // Handle piece hover for move hints
  const handlePieceMouseEnter = useCallback((position: Position) => {
    if (!showMoveHints || !canAct) return;
    
    const piece = gameState.board[position.row]?.[position.col];
    if (!piece || piece.owner !== playerRole) return;
    
    setHoveredPiece(position);
    setShowHint(false);
    
    // Clear existing timer
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    
    // Get legal moves for this piece
    const legalMoves = RuleEngine.getLegalMovesForPiece(gameState, position);
    setHintMoves(legalMoves);
    
    // Set timer to show hint after 5 seconds
    hoverTimerRef.current = setTimeout(() => {
      setShowHint(true);
      hoverTimerRef.current = null;
    }, 5000);
  }, [showMoveHints, canAct, gameState, playerRole]);

  const handlePieceMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredPiece(null);
    setShowHint(false);
    setHintMoves([]);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    };
  }, []);

  const historyList = gameState.history ?? [];
  const recentMoves = [...historyList].slice(-8).reverse();

  const lastMove = gameState.lastMove;
  const lastMoveDescription = lastMove
    ? `${lastMove.pieceId} de ${formatPosition(lastMove.from)} a ${formatPosition(lastMove.to)}`
    : null;
  const lastMoveGoalText =
    lastMove && lastMove.goal
      ? `Gol de ${
          lastMove.goal.scoringPlayer === "home"
            ? playerLabels.home
            : playerLabels.away
        }`
      : null;

const badgeClass = (role: PlayerId, isStarting: boolean, isCurrentTurn: boolean) =>
  [
    "rounded-full px-5 py-2.5 text-base font-semibold transition inline-flex items-center gap-2 shadow-lg",
    role === "home" 
      ? "bg-emerald-600/90 text-white border-2 border-emerald-400/50" 
      : "bg-sky-600/90 text-white border-2 border-sky-400/50",
    isCurrentTurn ? "ring-4 ring-yellow-400/80 shadow-yellow-400/50" : "",
    isStarting ? "border-yellow-400/80" : "",
  ].join(" ");

  const isBotTurn =
    isBotGame &&
    botPlayer === opponentRole &&
    status === "in_progress" &&
    gameState.turn === opponentRole;

  const computedWinnerLabel = (() => {
    if (winnerId) {
      if (winnerId === players.home) {
        return playerLabels.home;
      }
      if (winnerId === players.away) {
        return playerLabels.away;
      }
    }

    if (status === "finished" && isBotGame) {
      const finalMover = gameState.lastMove?.player ?? null;
      if (finalMover === playerRole) {
        return playerLabels[playerRole];
      }
      if (finalMover === opponentRole) {
        return botDisplayName;
      }
    }

    return null;
  })();

  // Monitor history to detect goals and game resumption
  // This is the central place for detecting goals and playing sounds
  // It works for both local moves (player) and remote moves (bot, other player)
  useEffect(() => {
    const historyLength = gameState.history?.length ?? 0;
    const prevHistoryLen = previousHistoryLengthRef.current;
    
    // Only process if history has changed
    if (historyLength > prevHistoryLen && historyLength > 0) {
      const lastMove = gameState.history?.[gameState.history.length - 1];
      const prevMove = prevHistoryLen > 0 ? gameState.history?.[prevHistoryLen - 1] : null;
      
      // Check if a goal was just scored
      if (lastMove?.goal) {
        // Goal was just scored - show celebration and play sound
        // Check if celebration is not already showing to avoid duplicates
        if (!showGoalCelebration) {
          const scorer = lastMove.goal.scoringPlayer === "home"
            ? playerLabels.home
            : playerLabels.away;
          setGoalScorer(scorer);
          setShowGoalCelebration(true);
          playSound("goal");
        }
      } 
      // Check if this is the first move after a goal (board reset)
      else if (prevMove?.goal && !lastMove?.goal) {
        // Previous move was a goal, this move is not - board was reset, game resumed
        setTimeout(() => {
          playSound("whistle_resume");
        }, 1000);
      }
      
      // Update ref after processing
      previousHistoryLengthRef.current = historyLength;
    }
  }, [gameState.history, playerLabels, showGoalCelebration, playSound]);

  // Auto-scroll to board when it's the player's turn
  // Scroll to show the player's area (their goal and pieces at the bottom of the board)
  useEffect(() => {
    if (canAct && boardRef.current && status === "in_progress") {
      // Small delay to ensure DOM is updated and realtime updates are processed
      const timer = setTimeout(() => {
        if (boardRef.current) {
          // Find the board container element
          const boardContainer = boardRef.current.querySelector("#game-board-container") as HTMLElement;
          
          if (boardContainer) {
            // Find the player's goal row element
            const playerGoalRow = boardContainer.querySelector('[data-is-player-goal="true"]') as HTMLElement;
            
            if (playerGoalRow) {
              // Scroll to the player's goal row (bottom of their view)
              const goalRowRect = playerGoalRow.getBoundingClientRect();
              const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
              
              // Calculate scroll position to show the player's goal row near the bottom of viewport
              // We want to show the goal row and a few rows above it
              const targetScrollTop = window.scrollY + goalRowRect.bottom - viewportHeight + 200; // 200px padding to show rows above
              
              window.scrollTo({
                top: Math.max(0, targetScrollTop),
                behavior: "smooth",
              });
              
              // Also scroll the board container horizontally if needed
              const containerRect = boardContainer.getBoundingClientRect();
              const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
              
              if (containerRect.left < 0 || containerRect.right > viewportWidth) {
                boardContainer.scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                  inline: "center",
                });
              }
            } else {
              // Fallback: scroll to show bottom of board container
              const containerRect = boardContainer.getBoundingClientRect();
              const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
              const targetScrollTop = window.scrollY + containerRect.bottom - viewportHeight + 200;
              
              window.scrollTo({
                top: Math.max(0, targetScrollTop),
                behavior: "smooth",
              });
            }
          } else {
            // Fallback: scroll to board container
            boardRef.current.scrollIntoView({
              behavior: "smooth",
              block: "center",
              inline: "nearest",
            });
          }
        }
      }, 1000); // Increased delay to allow for realtime updates and state changes
      
      return () => clearTimeout(timer);
    }
  }, [canAct, status, gameState.turn, playerRole]);

  return (
    <div className="mx-auto flex w-full max-w-[95vw] flex-col gap-6 px-2 py-6 sm:px-4 sm:py-8 lg:px-6 lg:py-10 xl:max-w-[95vw] 2xl:max-w-[1600px]">
      {showGoalCelebration && goalScorer && (
        <GoalCelebration
          playerName={goalScorer}
          onComplete={() => {
            setShowGoalCelebration(false);
            setGoalScorer(null);
          }}
        />
      )}

      {/* Main content: Board on left, Header+Info on right (all screen sizes) */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_0.9fr] lg:grid-cols-[1.4fr_1fr] gap-4 md:gap-6 items-start">
        {/* Board - Left side on all screen sizes */}
        <div 
          ref={boardRef}
          className="w-full overflow-x-auto order-1 md:order-1 lg:sticky lg:top-6 lg:self-start"
        >
          <div 
            id="game-board-container"
            className="w-full border border-white/20 shadow-2xl"
          >
            {/* Column labels (A-H) */}
            <div
              className="grid border-b border-white/20 w-full"
              style={{
                gridTemplateColumns: `auto repeat(${BOARD_COLS}, 1fr)`,
              }}
            >
              <div className="w-8 sm:w-10 md:w-12 lg:w-14 xl:w-16"></div>
              {colIndices.map((actualCol) => (
                <div
                  key={`col-label-${actualCol}`}
                  className="flex h-8 sm:h-9 md:h-10 lg:h-12 xl:h-14 items-center justify-center border-l border-white/20 bg-emerald-950/80 text-xs sm:text-sm md:text-base lg:text-lg font-bold text-emerald-100 shadow-sm aspect-square"
                >
                  {getColumnLabelForDisplay(actualCol, playerRole)}
                </div>
              ))}
            </div>

            {/* Board rows with row labels */}
            {rowIndices.map((actualRow, uiRow) => {
              // Add data attribute to identify the player's goal row for scrolling
              const isPlayerGoalRow = 
                (playerRole === "home" && actualRow === BOARD_ROWS - 1) ||
                (playerRole === "away" && actualRow === 0);
              
              return (
              <div
                key={`row-${actualRow}`}
                data-row-index={uiRow}
                data-actual-row={actualRow}
                data-is-player-goal={isPlayerGoalRow}
                className="grid border-b border-white/20 last:border-b-0 w-full"
                style={{
                  gridTemplateColumns: `auto repeat(${BOARD_COLS}, 1fr)`,
                }}
              >
                {/* Row label (1-12) */}
                <div className="flex w-8 sm:w-10 md:w-12 lg:w-14 xl:w-16 items-center justify-center border-r border-white/20 bg-emerald-950/80 text-xs sm:text-sm md:text-base lg:text-lg font-bold text-emerald-100 shadow-sm">
                  {getRowLabelForDisplay(actualRow, playerRole)}
                </div>

                {/* Board cells */}
                {colIndices.map((actualCol, uiCol) => {
                  const cell = gameState.board[actualRow]?.[actualCol];
                  const isSelected =
                    selection?.origin.row === actualRow &&
                    selection.origin.col === actualCol;
                  const moveOption = isMoveOption(uiRow, uiCol);
                  const isLastFrom =
                    lastMove &&
                    lastMove.from.row === actualRow &&
                    lastMove.from.col === actualCol;
                  const isLastTo =
                    lastMove &&
                    lastMove.to.row === actualRow &&
                    lastMove.to.col === actualCol;
                  const highlightStartingPiece =
                    isInitialPhase &&
                    cell &&
                    cell.owner === gameState.startingPlayer;

                  // Mark goal squares (rows 0 and 11, columns 3 and 4)
                  const isGoalSquare =
                    (actualRow === 0 || actualRow === BOARD_ROWS - 1) &&
                    GOAL_COLS.includes(actualCol);

                  // Display position label from player's perspective
                  const displayRowLabel = getRowLabelForDisplay(actualRow, playerRole);
                  const displayColLabel = getColumnLabelForDisplay(actualCol, playerRole);
                  const positionLabel = `${displayColLabel}${displayRowLabel}`;

                  // Check if this cell is hovered for hint display
                  const isHoveredForHint = 
                    showMoveHints &&
                    showHint &&
                    hoveredPiece &&
                    hoveredPiece.row === actualRow &&
                    hoveredPiece.col === actualCol;
                  
                  // Check if this cell is a hint move destination
                  const isHintMove = 
                    showMoveHints &&
                    showHint &&
                    hintMoves.some(
                      (move) => move.row === actualRow && move.col === actualCol
                    );

                  return (
                    <div
                      key={`${actualRow}-${actualCol}`}
                      className="relative"
                      onMouseEnter={() => {
                        if (cell && cell.owner === playerRole && canAct) {
                          handlePieceMouseEnter({ row: actualRow, col: actualCol });
                        }
                      }}
                      onMouseLeave={handlePieceMouseLeave}
                    >
                      <button
                        type="button"
                        onClick={() => handleCellClick(uiRow, uiCol)}
                        className={[
                          "aspect-square w-full flex items-center justify-center border-l border-t border-white/10 font-semibold transition relative",
                          isGoalSquare
                            ? "border-yellow-400/60 bg-yellow-500/20"
                            : "border-white/10",
                          !isGoalSquare &&
                            ((actualRow + actualCol) % 2 === 0
                              ? "bg-emerald-900/50"
                              : "bg-emerald-800/50"),
                          isSelected ? "ring-2 sm:ring-3 md:ring-4 ring-emerald-300/60 z-10" : "",
                          moveOption && !isGoalSquare ? "bg-emerald-400/30" : "",
                          isHintMove && !isGoalSquare && !moveOption ? "bg-purple-400/40 ring-2 ring-purple-300/60" : "",
                          isLastTo && !isGoalSquare && !isHintMove
                            ? "bg-amber-500/40"
                            : isLastFrom && !isGoalSquare && !isHintMove
                              ? "bg-amber-500/20"
                              : "",
                          !canAct ? "cursor-default" : "cursor-pointer hover:bg-white/5",
                        ].join(" ")}
                        disabled={!canAct}
                        title={
                          isGoalSquare
                            ? `Arco - ${positionLabel}`
                            : cell
                              ? `${positionLabel} - ${pieceInitials[cell.type]}`
                              : positionLabel
                        }
                      >
                        {/* Goal icon */}
                        {isGoalSquare && (
                          <span className="absolute inset-0 flex items-center justify-center text-xs sm:text-sm md:text-base font-bold text-yellow-300/80">
                            🥅
                          </span>
                        )}

                        {/* Piece */}
                        {cell && (
                          <span
                            className={`relative z-10 flex items-center justify-center rounded-full border ${
                              cell.owner === playerRole 
                                ? "border-emerald-200 bg-emerald-500/60 text-emerald-950" 
                                : "border-sky-200 bg-sky-500/50 text-sky-950"
                            } ${
                              highlightStartingPiece
                                ? "shadow-[0_0_0_2px_rgba(250,204,21,0.6)] sm:shadow-[0_0_0_3px_rgba(250,204,21,0.6)] md:shadow-[0_0_0_4px_rgba(250,204,21,0.6)] animate-pulse"
                                : ""
                            } ${
                              isHoveredForHint ? "ring-4 ring-purple-400/80 shadow-lg shadow-purple-400/50" : ""
                            } w-[40%] h-[40%] sm:w-[45%] sm:h-[45%] md:w-[50%] md:h-[50%] text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl`}
                          >
                            {pieceInitials[cell.type]}
                          </span>
                        )}
                      </button>
                      
                      {/* Hint tooltip */}
                      {isHoveredForHint && hintMoves.length > 0 && (
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 z-50 bg-purple-900/95 border-2 border-purple-400 rounded-xl p-3 shadow-2xl min-w-[200px] max-w-[300px]">
                          <div className="text-xs font-semibold text-purple-100 mb-2">
                            💡 Movimientos posibles:
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {hintMoves.map((move, idx) => {
                              const displayRowLabelHint = getRowLabelForDisplay(move.row, playerRole);
                              const displayColLabelHint = getColumnLabelForDisplay(move.col, playerRole);
                              const moveLabel = `${displayColLabelHint}${displayRowLabelHint}`;
                              return (
                                <span
                                  key={`hint-${idx}-${move.row}-${move.col}`}
                                  className="inline-flex items-center justify-center px-2 py-1 bg-purple-700/80 text-purple-100 text-xs font-semibold rounded border border-purple-400/50"
                                >
                                  {moveLabel}
                                </span>
                              );
                            })}
                          </div>
                          <div className="text-xs text-purple-200 mt-2 italic">
                            {hintMoves.length === 0 
                              ? "No hay movimientos posibles" 
                              : `${hintMoves.length} movimiento${hintMoves.length !== 1 ? "s" : ""}`}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              );
            })}
          </div>
        </div>

        {/* Header and Info panel - Right side on all screen sizes */}
        <div className="flex flex-col gap-4 md:gap-6 order-2 md:order-2 md:sticky md:top-6 md:self-start md:max-h-[calc(100vh-3rem)] md:overflow-y-auto">
          {/* Header */}
          <section className="flex flex-col gap-3 rounded-2xl md:rounded-3xl border-2 border-white/20 bg-gradient-to-br from-emerald-950/80 to-emerald-900/60 p-4 md:p-6 text-white shadow-2xl backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-1 md:mb-2">
              <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-white">
                Partido #{initialGameId.slice(0, 8)}
              </h1>
              <div className="flex items-center gap-2">
                <Link
                  href="/lobby"
                  className="rounded-full border-2 border-emerald-400/60 bg-emerald-600/80 px-2.5 md:px-3 py-1 md:py-1.5 sm:px-4 sm:py-2 text-xs md:text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-500 hover:border-emerald-300 hover:shadow-xl"
                >
                  ← Lobby
                </Link>
                <Link
                  href="/"
                  className="rounded-full border-2 border-white/30 bg-white/10 px-2.5 md:px-3 py-1 md:py-1.5 sm:px-4 sm:py-2 text-xs md:text-sm font-semibold text-white shadow-lg transition hover:bg-white/20 hover:border-white/50"
                >
                  🏠 Home
                </Link>
              </div>
            </div>
            <p className="text-sm md:text-base font-medium text-emerald-50">
              {status === "finished"
                ? computedWinnerLabel
                  ? `Ganador: ${computedWinnerLabel}`
                  : "Partida finalizada"
                : `Turno actual: ${currentTurnLabel}`}
            </p>
            {status !== "finished" && (
              <p className="mt-1 text-xs md:text-sm font-semibold uppercase tracking-wider text-emerald-200">
                Inicio: <span className="text-yellow-300">{startingLabel}</span>
              </p>
            )}
            <div className="flex items-center gap-3 md:gap-4 mt-2 md:mt-3 text-sm md:text-base">
              <div
                className={badgeClass(
                  "home",
                  gameState.startingPlayer === "home",
                  gameState.turn === "home",
                )}
              >
                {gameState.startingPlayer === "home" ? "★" : null}
                <span className="font-semibold">
                  {playerLabels.home}: {score.home ?? 0}
                </span>
              </div>
              <div
                className={badgeClass(
                  "away",
                  gameState.startingPlayer === "away",
                  gameState.turn === "away",
                )}
              >
                {gameState.startingPlayer === "away" ? "★" : null}
                <span className="font-semibold">
                  {playerLabels.away}: {score.away ?? 0}
                </span>
              </div>
            </div>
          </section>

          {/* Status messages */}
          {status === "waiting" && (
            <div className="rounded-xl md:rounded-2xl border-2 border-yellow-500/60 bg-yellow-500/30 p-3 md:p-4 text-sm md:text-base font-semibold text-yellow-900 shadow-lg backdrop-blur-sm">
              ⏳ Esperando a que se una el segundo jugador...
            </div>
          )}

          {feedback && (
            <div className="rounded-xl md:rounded-2xl border-2 border-emerald-400/60 bg-emerald-500/40 p-3 md:p-4 text-sm md:text-base font-semibold text-white shadow-xl backdrop-blur-sm">
              {feedback}
            </div>
          )}

          {isBotTurn && (
            <div className="rounded-xl md:rounded-2xl border-2 border-sky-400/60 bg-sky-500/40 p-3 md:p-4 text-sm md:text-base font-semibold text-white shadow-xl backdrop-blur-sm animate-pulse">
              🤖 {botDisplayName} está analizando su próximo movimiento…
            </div>
          )}

          {lastMoveDescription && (
            <div className="rounded-xl md:rounded-2xl border-2 border-white/30 bg-gradient-to-r from-slate-800/90 to-slate-700/90 p-3 md:p-4 text-sm md:text-base text-white shadow-xl backdrop-blur-sm">
              <p className="font-medium">
                Último movimiento: <strong className="text-yellow-300">{lastMoveDescription}</strong>
              </p>
              {lastMoveGoalText && (
                <p className="mt-2 text-base md:text-lg font-bold text-emerald-300">⚽ {lastMoveGoalText}</p>
              )}
            </div>
          )}

          {/* History */}
          <div className="rounded-xl md:rounded-2xl border-2 border-white/30 bg-gradient-to-br from-slate-800/95 to-slate-900/95 p-3 md:p-4 lg:p-5 text-white shadow-2xl backdrop-blur-sm">
            <h2 className="text-base md:text-lg lg:text-xl font-bold text-white mb-2 md:mb-3 lg:mb-4">
              📜 Historial reciente
            </h2>
            {recentMoves.length === 0 ? (
              <p className="mt-2 md:mt-3 text-xs md:text-sm lg:text-base text-emerald-200">
                Aún no hay movimientos registrados.
              </p>
            ) : (
              <ul className="mt-2 md:mt-3 flex flex-col gap-2 lg:gap-3 max-h-[200px] md:max-h-[250px] lg:max-h-[300px] overflow-y-auto">
                <li className="flex items-center justify-between rounded-lg md:rounded-xl border-2 border-yellow-400/80 bg-gradient-to-r from-yellow-600/90 to-yellow-500/90 px-2 md:px-3 lg:px-5 py-1.5 md:py-2 lg:py-3 text-xs md:text-sm font-semibold shadow-lg">
                  <span className="text-xs font-bold uppercase tracking-wider text-yellow-950">
                    Inicio
                  </span>
                  <span className="flex items-center gap-1 md:gap-2 text-xs md:text-sm font-semibold text-yellow-950">
                    <span className="text-yellow-700">★</span> <span>{startingLabel}</span>
                  </span>
                  <span className="text-xs font-medium text-yellow-950">Sorteo</span>
                </li>
                {recentMoves.map((move) => (
                  <li
                    key={move.moveNumber}
                    className="flex items-center justify-between rounded-lg md:rounded-xl border-2 border-white/20 bg-white/10 px-2 md:px-3 lg:px-5 py-1.5 md:py-2 lg:py-3 shadow-md hover:bg-white/15 transition-colors"
                  >
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 bg-emerald-900/50 px-1.5 md:px-2 lg:px-3 py-0.5 md:py-1 rounded-full">
                      #{move.moveNumber}
                    </span>
                    <span className="text-xs md:text-sm text-white font-medium flex-1 text-center mx-1 md:mx-2">
                      <span className={move.player === "home" ? "text-emerald-300" : "text-sky-300"}>
                        {move.player === "home"
                          ? playerLabels.home
                          : playerLabels.away}
                      </span>{" "}
                      <span className="font-semibold text-yellow-300">{move.pieceId.split("-")[1]}</span> →{" "}
                      <strong className="text-yellow-300 font-bold">{formatPosition(move.to)}</strong>
                      {move.capturedPieceId ? (
                        <span className="text-rose-300 font-semibold ml-1">⚔️</span>
                      ) : null}
                    </span>
                    <span className="text-xs font-medium text-emerald-200 bg-emerald-900/50 px-1.5 md:px-2 lg:px-3 py-0.5 md:py-1 rounded-full">
                      {new Date(move.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Game info */}
          <div className="rounded-xl md:rounded-2xl border-2 border-white/30 bg-gradient-to-br from-slate-800/95 to-slate-900/95 p-3 md:p-4 lg:p-5 text-white shadow-2xl backdrop-blur-sm">
            <p className="text-xs md:text-sm lg:text-base font-semibold mb-2 md:mb-3">
              Tu rol: <strong className="text-yellow-300 text-sm md:text-base lg:text-lg">{playerRole.toUpperCase()}</strong>.{" "}
              {status === "finished" ? (
                <>
                  Partido terminado.{" "}
                  <strong className="text-emerald-300 text-sm md:text-base lg:text-lg">
                    {winnerId && winnerId === players[playerRole]
                      ? "🎉 ¡Ganaste!"
                      : "😔 Ganó tu rival"}
                  </strong>
                </>
              ) : (
                <>
                  Turno actual:{" "}
                  <strong className={`text-sm md:text-base lg:text-lg ${currentTurnIsPlayer ? "text-emerald-300" : "text-sky-300"}`}>
                    {gameState.turn.toUpperCase()}{" "}
                    {currentTurnIsPlayer ? "✅" : "⏳"}
                  </strong>
                </>
              )}
            </p>
            <p className="text-xs md:text-sm text-emerald-100 font-medium leading-relaxed">
              💡 Selecciona una pieza tuya para ver movimientos legales. Los movimientos se
              validan localmente con la lógica oficial y se sincronizan en Supabase.
              {status === "finished" ? " Esta partida ya finalizó." : ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

