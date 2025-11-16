"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimePostgresUpdatePayload } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  winningScore: number;
  timeoutEnabled: boolean;
  team1Name?: string | null;
  team2Name?: string | null;
  team1PrimaryColor?: string | null;
  team1SecondaryColor?: string | null;
  team2PrimaryColor?: string | null;
  team2SecondaryColor?: string | null;
};

const BOARD_CHANNEL_PREFIX = "game";

// Feature flag: Enable/disable "¡Tu turno!" alert
// Set to true to show the alert when it's the player's turn
const ENABLE_YOUR_TURN_ALERT = false;

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
  winningScore,
  timeoutEnabled,
  team1Name,
  team2Name,
  team1PrimaryColor,
  team1SecondaryColor,
  team2PrimaryColor,
  team2SecondaryColor,
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
  
  // Stable callback for goal celebration completion
  const handleGoalComplete = useCallback(() => {
    setShowGoalCelebration(false);
    setGoalScorer(null);
  }, []);
  
  const [hasPlayedStartSound, setHasPlayedStartSound] = useState(false);
  const [previousScore, setPreviousScore] = useState<GameState["score"]>(initialScore ?? initialState.score);
  const [showYourTurnAlert, setShowYourTurnAlert] = useState(false);
  const [showTimeoutAlert, setShowTimeoutAlert] = useState(false);
  const [showVictoryAlert, setShowVictoryAlert] = useState(false);
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState(false);
  const [showSurrenderAlert, setShowSurrenderAlert] = useState(false);
  const [isSurrendering, setIsSurrendering] = useState(false);
  const router = useRouter();
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [turnStartedAt, setTurnStartedAt] = useState<Date | null>(null);
  const previousHistoryLengthRef = useRef<number>((initialState.history?.length ?? 0));
  const boardRef = useRef<HTMLDivElement>(null);
  
  // Zoom control for board (desktop only)
  const [boardZoom, setBoardZoom] = useState<number>(() => {
    // Load from localStorage if available, default to 1.0
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("boardZoom");
      return saved ? parseFloat(saved) : 1.0;
    }
    return 1.0;
  });
  const { playSound } = useGameSounds();
  // Track if we're currently processing a local move to avoid overwriting with Realtime updates
  const isProcessingLocalMoveRef = useRef<boolean>(false);
  // Track the last move we processed to avoid duplicate updates
  const lastProcessedHistoryLengthRef = useRef<number>((initialState.history?.length ?? 0));
  // Track previous turn to detect turn changes
  const previousTurnRef = useRef<PlayerId | null>(initialState.turn);
  // Track previous status and winner_id to detect game end
  const previousStatusRef = useRef<string>(initialStatus);
  const previousWinnerIdRef = useRef<string | null>(initialWinnerId);
  // Track if timeout was just executed to show alert
  const timeoutJustExecutedRef = useRef<boolean>(false);
  // Track victory timers to prevent cleanup issues
  const victoryTimersRef = useRef<{ hideTimer?: NodeJS.Timeout; redirectTimer?: NodeJS.Timeout }>({});
  // Track if victory alert has been shown to prevent showing again
  const victoryAlertShownRef = useRef<boolean>(false);
  // Timeout constants
  const TURN_TIMEOUT_SECONDS = 60;
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const timeRemainingTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Move hints state
  const [hoveredPiece, setHoveredPiece] = useState<Position | null>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [hintMoves, setHintMoves] = useState<Position[]>([]);
  
  // Dynamic player labels - updated from server data
  const [dynamicPlayerLabels, setDynamicPlayerLabels] = useState<Record<PlayerId, string>>(playerLabels);

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
        .select(`
          game_state, 
          score, 
          status, 
          player_1_id, 
          player_2_id, 
          winner_id,
          is_bot_game,
          bot_display_name,
          turn_started_at,
          player_one:profiles!games_player_1_id_fkey(id, username),
          player_two:profiles!games_player_2_id_fkey(id, username)
        `)
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
      // Supabase can return player_one and player_two as objects or arrays
      const gameData = data as {
        game_state: GameState | null;
        score: GameState["score"] | null;
        status: string;
        player_1_id: string;
        player_2_id: string | null;
        winner_id: string | null;
        is_bot_game: boolean;
        bot_display_name: string | null;
        turn_started_at: string | null;
        player_one: { username: string | null } | { username: string | null }[] | null;
        player_two: { username: string | null } | { username: string | null }[] | null;
      };
      
      // Extract usernames - handle both object and array cases
      const extractUsername = (profile: { username: string | null } | { username: string | null }[] | null): string | null => {
        if (!profile) return null;
        if (Array.isArray(profile)) {
          return profile[0]?.username ?? null;
        }
        return profile.username ?? null;
      };

      const nextState =
        (gameData.game_state as GameState | null) ??
        RuleEngine.createInitialState();
      const nextScore =
        (gameData.score as GameState["score"] | null) ??
        RuleEngine.createInitialState().score;

      // Extract usernames - handle both object and array cases
      const playerOneUsername = extractUsername(gameData.player_one);
      const playerTwoUsername = extractUsername(gameData.player_two);
      
      console.log("[GameView] Extracted usernames:", {
        playerOneUsername,
        playerTwoUsername,
        player_one_raw: gameData.player_one,
        player_two_raw: gameData.player_two,
        is_bot_game: gameData.is_bot_game,
      });
      
      // Update player labels dynamically
      // If username is null or empty, use fallback
      const updatedLabels: Record<PlayerId, string> = {
        home: playerOneUsername && playerOneUsername.trim() !== "" 
          ? playerOneUsername.trim() 
          : "Jugador 1",
        away: gameData.is_bot_game
          ? (gameData.bot_display_name ?? botDisplayName)
          : (playerTwoUsername && playerTwoUsername.trim() !== "" 
              ? playerTwoUsername.trim() 
              : "Jugador 2"),
      };
      
      console.log("[GameView] Updated player labels:", updatedLabels);
      setDynamicPlayerLabels(updatedLabels);

      // Check if game just started
      const historyLength = nextState.history?.length ?? 0;
      const currentHistoryLength = lastProcessedHistoryLengthRef.current;
      
      console.log("[GameView] Fetched game state:", {
        turn: nextState.turn,
        score: nextScore,
        status: gameData.status,
        historyLength,
        currentHistoryLength,
        isProcessingLocalMove: isProcessingLocalMoveRef.current,
        playerLabels: updatedLabels,
      });

      // Always update player labels, even if we're skipping the state update
      // This ensures names are always up to date
      
      // Don't overwrite local state if we're processing a move and history hasn't increased
      if (isProcessingLocalMoveRef.current && historyLength <= currentHistoryLength) {
        console.log("[GameView] Skipping fetchGameState update - processing local move and history hasn't increased");
        // Player labels were already updated above, so we can return now
        return;
      }
      
      // Update last processed history length
      lastProcessedHistoryLengthRef.current = historyLength;
      
      const isGameStart = historyLength === 0 && status === "waiting" && gameData.status === "in_progress" && !hasPlayedStartSound;

      setGameState(nextState);
      setScore(nextScore);
      setStatus(gameData.status);
      setPlayers({
        home: gameData.player_1_id,
        away: gameData.player_2_id,
      });
      const newWinnerId = gameData.winner_id ?? null;
      setWinnerId(newWinnerId);
      setPreviousScore(nextScore);
      
      // Don't update refs here - let the useEffect handle it to properly detect transitions
      
      // Update turn_started_at if available
      // Only use turn_started_at if it's the current player's turn
      // This ensures the timer is accurate for the player whose turn it is
      // Use gameData.player_1_id and gameData.player_2_id (updated from fetch)
      const updatedPlayers = {
        home: gameData.player_1_id,
        away: gameData.player_2_id,
      };
      if (gameData.turn_started_at) {
        const currentTurn = nextState.turn;
        const currentPlayerId = currentTurn === "home" ? updatedPlayers.home : updatedPlayers.away;
        const isPlayerTurn = currentTurn === playerRole && currentPlayerId === profileId;
        if (isPlayerTurn) {
          // It's the player's turn, use the server's turn_started_at
          setTurnStartedAt(new Date(gameData.turn_started_at));
        } else {
          // It's not the player's turn, clear turn_started_at
          setTurnStartedAt(null);
        }
      } else if (gameData.status === "in_progress") {
        // If game is in progress but no turn_started_at, and it's the player's turn
        const currentTurn = nextState.turn;
        const currentPlayerId = currentTurn === "home" ? updatedPlayers.home : updatedPlayers.away;
        const isPlayerTurn = currentTurn === playerRole && currentPlayerId === profileId;
        if (isPlayerTurn) {
          // It's the player's turn but no turn_started_at, set it to now
          setTurnStartedAt(new Date());
        } else {
          // It's not the player's turn, clear turn_started_at
          setTurnStartedAt(null);
        }
      }
      
      // Don't update previousHistoryLengthRef here - let the useEffect that monitors gameState.history
      // handle it. This ensures goal detection works correctly for both local and remote moves (bot, other player)
      // The useEffect will detect the change when gameState.history updates and trigger goal celebration

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
  }, [initialGameId, supabase, botDisplayName, status, hasPlayedStartSound, playSound]);

  // Fetch player names on mount to ensure they're up to date
  useEffect(() => {
    console.log("[GameView] Initial mount - fetching player names");
    void fetchGameState();
  }, [fetchGameState]);

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

          const historyLength = nextState.history?.length ?? 0;
          const currentHistoryLength = lastProcessedHistoryLengthRef.current;
          
          console.log("[GameView] Realtime update - history lengths:", {
            received: historyLength,
            current: currentHistoryLength,
            isProcessingLocalMove: isProcessingLocalMoveRef.current,
            turn: nextState.turn,
            playerRole,
            profileId,
            playerId: players[playerRole],
          });

          // If we're processing a local move, only update if the history is longer (new move from opponent)
          // This prevents overwriting our own move with a stale update
          if (isProcessingLocalMoveRef.current) {
            // If history is longer, it's a new move from the opponent
            if (historyLength > currentHistoryLength) {
              console.log("[GameView] New move detected from opponent, updating state");
              isProcessingLocalMoveRef.current = false;
              lastProcessedHistoryLengthRef.current = historyLength;
              // Continue with update
            } else {
              // History is same or shorter - this might be our own move confirmation or a stale update
              // Check if it's the opponent's turn now (our move was processed)
              const isOpponentTurn = nextState.turn === opponentRole;
              const isPlayerTurn = nextState.turn === playerRole && players[playerRole] === profileId;
              
              if (isOpponentTurn && historyLength === currentHistoryLength) {
                // Our move was processed, now it's opponent's turn
                console.log("[GameView] Our move was processed, opponent's turn now");
                isProcessingLocalMoveRef.current = false;
                lastProcessedHistoryLengthRef.current = historyLength;
                // Continue with update to reflect opponent's turn
              } else if (isPlayerTurn && historyLength === currentHistoryLength) {
                // Still our turn - might be a duplicate update, skip it
                console.log("[GameView] Still our turn with same history, skipping duplicate update");
                return;
              } else {
                // History is shorter - this is definitely a stale update, ignore it
                console.log("[GameView] History is shorter than current, ignoring stale update");
                return;
              }
            }
          } else {
            // Not processing a local move - update if history is longer (new move from opponent)
            if (historyLength > currentHistoryLength) {
              console.log("[GameView] New move from opponent detected, updating state");
              lastProcessedHistoryLengthRef.current = historyLength;
              // Continue with update
            } else if (historyLength === currentHistoryLength) {
              // Same history length - might be a status update or duplicate, check if turn changed
              const currentTurn = gameState.turn;
              const nextTurn = nextState.turn;
              
              if (currentTurn !== nextTurn) {
                // Turn changed - update state
                console.log("[GameView] Turn changed, updating state");
                lastProcessedHistoryLengthRef.current = historyLength;
                // Continue with update
              } else {
                // Same history and same turn - might be a duplicate or status update
                // Only update if status changed or if it's a status update
                if (payload.new.status !== status) {
                  console.log("[GameView] Status changed, updating state");
                  // Continue with update
                } else {
                  // Duplicate update, skip
                  console.log("[GameView] Duplicate update (same history, turn, status), skipping");
                  return;
                }
              }
            } else {
              // History is shorter - stale update, ignore
              console.log("[GameView] History is shorter than current, ignoring stale update");
              return;
            }
          }

          console.log("[GameView] Updating local state from Realtime:", {
            turn: nextState.turn,
            score: nextScore,
            status: payload.new.status,
            historyLength: nextState.history?.length ?? 0,
          });

          // Check if game just started (first move)
          const isGameStart = historyLength === 0 && status === "waiting" && payload.new.status === "in_progress";

          setGameState(nextState);
          setScore(nextScore);
          setStatus(payload.new.status);
          setPlayers({
            home: payload.new.player_1_id,
            away: payload.new.player_2_id,
          });
          const newWinnerId = payload.new.winner_id ?? null;
          setWinnerId(newWinnerId);
          setPreviousScore(nextScore);
          
          // Don't update refs here - let the useEffect handle it to properly detect transitions
          
          // Update turn_started_at from Realtime update
          // Only use turn_started_at if it's the current player's turn
          // This ensures the timer is accurate for the player whose turn it is
          // Use payload.new.player_1_id and payload.new.player_2_id instead of players state (which may be stale)
          const updatedPlayers = {
            home: payload.new.player_1_id,
            away: payload.new.player_2_id,
          };
          if (payload.new.turn_started_at) {
            const currentTurn = nextState.turn;
            const currentPlayerId = currentTurn === "home" ? updatedPlayers.home : updatedPlayers.away;
            const isPlayerTurn = currentTurn === playerRole && currentPlayerId === profileId;
            if (isPlayerTurn) {
              // It's the player's turn, use the server's turn_started_at
              setTurnStartedAt(new Date(payload.new.turn_started_at));
            } else {
              // It's not the player's turn, clear turn_started_at
              setTurnStartedAt(null);
            }
          } else if (payload.new.status === "in_progress") {
            // If game is in progress but no turn_started_at, and it's the player's turn
            const currentTurn = nextState.turn;
            const currentPlayerId = currentTurn === "home" ? updatedPlayers.home : updatedPlayers.away;
            const isPlayerTurn = currentTurn === playerRole && currentPlayerId === profileId;
            if (isPlayerTurn) {
              // It's the player's turn but no turn_started_at, set it to now
              setTurnStartedAt(new Date());
            } else {
              // It's not the player's turn, clear turn_started_at
              setTurnStartedAt(null);
            }
          }
          
          // Don't update previousHistoryLengthRef here - let the useEffect that monitors gameState.history
          // handle it. This ensures goal detection works correctly for both local and remote moves (bot, other player)
          // The useEffect will detect the change when gameState.history updates and trigger goal celebration

          // Play start sound when game begins
          if (isGameStart && !hasPlayedStartSound) {
            setTimeout(() => {
              playSound("whistle_start");
              setHasPlayedStartSound(true);
            }, 500);
          }
          
          // Goal detection and resume sound are handled by the useEffect that monitors gameState.history
          // This ensures it works correctly for both local moves (player) and remote moves (bot, other player)
          
          // Always fetch player names after Realtime update to ensure they're up to date
          // Use a small delay to avoid race conditions
          setTimeout(() => {
            void fetchGameState();
          }, 100);
        },
      )
      .subscribe((status) => {
        console.log("[GameView] Realtime subscription status:", status);
        if (status === "SUBSCRIBED") {
          console.log("[GameView] Successfully subscribed to Realtime updates");
        } else if (status === "CHANNEL_ERROR") {
          console.error("[GameView] Realtime subscription error");
        }
      });

    return () => {
      console.log("[GameView] Cleaning up Realtime subscription for game:", initialGameId);
      void supabase.removeChannel(channel);
    };
  }, [initialGameId, supabase, status, hasPlayedStartSound, playSound, fetchGameState, playerRole, opponentRole, players, profileId, gameState.turn]);

  // Poll for updates when it's not the player's turn
  // This handles both bot games and multiplayer games where the opponent is moving
  useEffect(() => {
    if (status !== "in_progress") {
      console.log("[GameView] Game not in progress, stopping polling");
      return;
    }
    
    const isPlayerTurn = gameState.turn === playerRole && players[playerRole] === profileId;
    
    // If it's the player's turn, no need to poll
    if (isPlayerTurn) {
      console.log("[GameView] Player's turn, stopping polling");
      return;
    }

    // For bot games, only poll when it's the bot's turn
    if (isBotGame) {
      if (!botPlayer || gameState.turn !== botPlayer) {
        console.log("[GameView] Not bot's turn, stopping polling");
        return;
      }
    }

    // For multiplayer games, poll when it's the opponent's turn
    if (!isBotGame) {
      const opponentId = players[opponentRole];
      const currentTurnIsOpponent = gameState.turn === opponentRole && opponentId !== null;
      
      if (!currentTurnIsOpponent) {
        console.log("[GameView] Not opponent's turn in multiplayer, stopping polling");
        return;
      }
    }

    console.log("[GameView] Opponent's turn detected, starting polling for updates...");
    
    // Immediate fetch to get latest state
    console.log("[GameView] Immediate fetch for opponent move...");
    void fetchGameState();
    
    // Poll every 1.5 seconds while it's the opponent's turn
    // More frequent polling for multiplayer to ensure quick updates
    const pollInterval = setInterval(() => {
      console.log("[GameView] Polling for opponent move update...");
      void fetchGameState();
    }, 1500);

    return () => {
      console.log("[GameView] Cleaning up polling interval");
      clearInterval(pollInterval);
    };
  }, [isBotGame, botPlayer, status, gameState.turn, playerRole, opponentRole, players, profileId, fetchGameState]);

  // Use dynamic player labels (updated from server)
  const effectivePlayerLabels = dynamicPlayerLabels;
  
  const currentTurnLabel =
    gameState.turn === playerRole
      ? effectivePlayerLabels[playerRole]
      : effectivePlayerLabels[opponentRole];
  const currentTurnIsPlayer = gameState.turn === playerRole;
  const startingLabel =
    gameState.startingPlayer === "home"
      ? effectivePlayerLabels.home
      : effectivePlayerLabels.away;
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
    // Mark that we're processing a local move to prevent Realtime from overwriting it
    isProcessingLocalMoveRef.current = true;
    const currentHistoryLength = gameState.history?.length ?? 0;
    lastProcessedHistoryLengthRef.current = currentHistoryLength;

    try {
      const outcome = RuleEngine.applyMove(gameState, move);
      const newScore = outcome.nextState.score;
      const goalScored = outcome.goal !== undefined;
      
      // Update history length ref for goal/resume detection
      // The useEffect that monitors gameState.history will detect the goal and show celebration
      const newHistoryLength = outcome.nextState.history?.length ?? 0;
      previousHistoryLengthRef.current = newHistoryLength - 1; // Set to previous length so useEffect detects the change
      lastProcessedHistoryLengthRef.current = newHistoryLength;
      
      setGameState(outcome.nextState);
      setScore(newScore);
      setSelection(null);
      
      // Update feedback based on move result
      if (goalScored) {
        const scoringLabel = effectivePlayerLabels[playerRole];
        const updatedScore = newScore[playerRole] ?? 0;
        if (updatedScore >= winningScore) {
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
        if (updatedScore >= winningScore) {
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
        // Reset the flag if there was an error
        isProcessingLocalMoveRef.current = false;
      } else {
        // Move was successful, but keep the flag until we receive confirmation from Realtime
        // that the move was processed and it's now the opponent's turn
        // The Realtime subscription will reset the flag when it detects the opponent's turn
        console.log("[GameView] Move sent successfully, waiting for Realtime confirmation");
      }
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Movimiento inválido.",
      );
      // Reset the flag if there was an error
      isProcessingLocalMoveRef.current = false;
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
            ? effectivePlayerLabels.home
            : effectivePlayerLabels.away
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
        return effectivePlayerLabels.home;
      }
      if (winnerId === players.away) {
        return effectivePlayerLabels.away;
      }
    }

    if (status === "finished" && isBotGame) {
      const finalMover = gameState.lastMove?.player ?? null;
      if (finalMover === playerRole) {
        return effectivePlayerLabels[playerRole];
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
          // Use team name instead of player name
          const scoringTeam = lastMove.goal.scoringPlayer === "home"
            ? (team1Name || effectivePlayerLabels.home)
            : (team2Name || (isBotGame ? botDisplayName : effectivePlayerLabels.away));
          setGoalScorer(scoringTeam);
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
  }, [gameState.history, effectivePlayerLabels, showGoalCelebration, playSound, team1Name, team2Name, isBotGame, botDisplayName]);

  // Monitor game status and winner_id to detect victory
  useEffect(() => {
    const currentStatus = status;
    const currentWinnerId = winnerId;
    const previousStatus = previousStatusRef.current;
    const previousWinnerId = previousWinnerIdRef.current;
    
    // Check if game just finished and player won
    const gameJustFinished = currentStatus === "finished" && previousStatus !== "finished";
    
    // Also check if winner_id just changed to profileId (in case status was already finished)
    const winnerJustChanged = currentWinnerId === profileId && previousWinnerId !== profileId && currentStatus === "finished";
    
    // Determine if player won
    // For both multiplayer and bot games: if winner_id === profileId, the player won
    const playerWon = currentWinnerId === profileId;
    
    // Show victory alert if game just finished and player won, or if winner just changed to player
    // Use ref to prevent showing multiple times (more reliable than state)
    if ((gameJustFinished || winnerJustChanged) && playerWon && !victoryAlertShownRef.current) {
      console.log("[GameView] Player won the game! Showing victory alert", {
        currentStatus,
        previousStatus,
        currentWinnerId,
        previousWinnerId,
        profileId,
        isBotGame,
        playerWon,
        gameJustFinished,
        winnerJustChanged,
      });
      
      // Mark as shown to prevent showing again
      victoryAlertShownRef.current = true;
      setShowVictoryAlert(true);
      playSound("goal"); // Use goal sound for victory
      
      // Clear any existing timers first
      if (victoryTimersRef.current.hideTimer) {
        clearTimeout(victoryTimersRef.current.hideTimer);
      }
      if (victoryTimersRef.current.redirectTimer) {
        clearTimeout(victoryTimersRef.current.redirectTimer);
      }
      
      // Hide alert after 3 seconds
      victoryTimersRef.current.hideTimer = setTimeout(() => {
        console.log("[GameView] Hiding victory alert after 3 seconds");
        setShowVictoryAlert(false);
        victoryTimersRef.current.hideTimer = undefined;
      }, 3000);
      
      // Redirect to lobby after 3 seconds
      victoryTimersRef.current.redirectTimer = setTimeout(() => {
        console.log("[GameView] Redirecting to lobby after victory");
        router.push("/lobby");
        victoryTimersRef.current.redirectTimer = undefined;
      }, 3000);
      
      // Update refs after showing alert
      previousStatusRef.current = currentStatus;
      previousWinnerIdRef.current = currentWinnerId;
    }
    
    // Update refs if status or winner changed (but don't show alert again if already shown)
    if (previousStatus !== currentStatus) {
      previousStatusRef.current = currentStatus;
    }
    if (previousWinnerId !== currentWinnerId) {
      previousWinnerIdRef.current = currentWinnerId;
    }
  }, [status, winnerId, profileId, playSound, isBotGame, router]);
  
  // Cleanup victory timers on unmount
  useEffect(() => {
    return () => {
      console.log("[GameView] Cleaning up victory timers on unmount");
      if (victoryTimersRef.current.hideTimer) {
        clearTimeout(victoryTimersRef.current.hideTimer);
      }
      if (victoryTimersRef.current.redirectTimer) {
        clearTimeout(victoryTimersRef.current.redirectTimer);
      }
    };
  }, []);

  // Function to handle surrender
  const handleSurrender = useCallback(async () => {
    if (status !== "in_progress" || isSurrendering) {
      return;
    }

    setIsSurrendering(true);
    console.log("[GameView] Surrendering game");
    
    try {
      const response = await fetch("/api/games/surrender", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gameId: initialGameId,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        console.error("[GameView] Surrender error:", data.error);
        setFeedback(data.error ?? "Error al rendirse");
        setIsSurrendering(false);
      } else {
        console.log("[GameView] Surrender successful");
        setShowSurrenderConfirm(false);
        // Clear feedback - we'll show the surrender alert instead
        setFeedback(null);
        // Show surrender alert
        setShowSurrenderAlert(true);
        // Fetch updated game state to reflect the surrender
        setTimeout(() => {
          void fetchGameState();
        }, 500);
        // Redirect to lobby after showing alert for 3 seconds
        setTimeout(() => {
          setShowSurrenderAlert(false);
          router.push("/lobby");
        }, 3000);
      }
    } catch (error) {
      console.error("[GameView] Surrender exception:", error);
      setFeedback("Error al rendirse. Intenta nuevamente.");
      setIsSurrendering(false);
    }
  }, [status, isSurrendering, initialGameId, fetchGameState, router]);

  // Function to execute timeout (lose turn)
  const executeTimeout = useCallback(async () => {
    if (!canAct || status !== "in_progress" || gameState.turn !== playerRole) {
      return;
    }

    console.log("[GameView] Executing timeout - player lost turn");
    
    // Mark that timeout was just executed to show alert
    timeoutJustExecutedRef.current = true;
    
    // Call API to execute timeout
    try {
      const response = await fetch("/api/games/timeout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gameId: initialGameId,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        console.error("[GameView] Timeout execution error:", data.error);
        timeoutJustExecutedRef.current = false;
      } else {
        console.log("[GameView] Timeout executed successfully");
        setFeedback("⏱️ ¡Tiempo agotado! Has perdido tu turno.");
        setTimeRemaining(null);
        setTurnStartedAt(null);
        // Show timeout alert
        setShowTimeoutAlert(true);
        // Hide alert after 5 seconds
        setTimeout(() => {
          setShowTimeoutAlert(false);
          timeoutJustExecutedRef.current = false;
        }, 5000);
      }
    } catch (error) {
      console.error("[GameView] Timeout execution exception:", error);
      timeoutJustExecutedRef.current = false;
    }
  }, [canAct, status, gameState.turn, playerRole, initialGameId]);

  // Monitor turn changes to show "¡Tu turno!" alert and initialize timeout
  // Also detect timeout by checking if turn changed from player to opponent (timeout was executed)
  useEffect(() => {
    const currentTurn = gameState.turn;
    const previousTurn = previousTurnRef.current;
    
    // Check if timeout was just executed (turn changed from player to opponent)
    // The alert is already shown in executeTimeout, but we also handle it here in case
    // the turn change is detected via Realtime before executeTimeout completes
    if (
      status === "in_progress" &&
      previousTurn === playerRole &&
      currentTurn === opponentRole &&
      players[playerRole] === profileId &&
      timeoutJustExecutedRef.current
    ) {
      // Turn changed from player to opponent - this is a timeout
      console.log("[GameView] Turn changed from player to opponent - timeout confirmed");
      // The alert should already be shown by executeTimeout, but ensure it's shown
      setShowTimeoutAlert(true);
      setTurnStartedAt(null);
      setTimeRemaining(null);
      // Hide alert after 5 seconds (if not already scheduled)
      const timer = setTimeout(() => {
        setShowTimeoutAlert(false);
        timeoutJustExecutedRef.current = false;
      }, 5000);
      
      previousTurnRef.current = currentTurn;
      return () => clearTimeout(timer);
    }
    
    // Check if turn changed to the player's turn
    if (
      status === "in_progress" &&
      currentTurn === playerRole &&
      players[playerRole] === profileId &&
      previousTurn !== null &&
      previousTurn !== currentTurn &&
      previousTurn === opponentRole
    ) {
      // Turn changed from opponent to player
      // Show alert only if ENABLE_YOUR_TURN_ALERT is true
      if (ENABLE_YOUR_TURN_ALERT) {
        console.log("[GameView] Turn changed to player - showing '¡Tu turno!' alert");
        setShowYourTurnAlert(true);
        // Hide alert after 3 seconds
        const timer = setTimeout(() => {
          setShowYourTurnAlert(false);
        }, 3000);
      }
      // Hide timeout alert if it was showing
      setShowTimeoutAlert(false);
      timeoutJustExecutedRef.current = false;
      
      // Initialize timeout timer when it's the player's turn
      // Use server's turn_started_at if available, otherwise set to now
      // This ensures the timer is synchronized with the server
      // Don't reset turn_started_at if it's already set - use the server value
      // The server's turn_started_at will be set when the turn changes (in /api/games/update)
      // or when the game starts (when second player joins)
      if (previousTurn !== currentTurn) {
        // Turn changed to player - wait for server's turn_started_at via fetchGameState
        // Don't set it locally here, let fetchGameState handle it from server
        // This ensures synchronization across clients
      }
      
      // Update previous turn ref
      previousTurnRef.current = currentTurn;
      
      if (ENABLE_YOUR_TURN_ALERT) {
        return () => {
          // Cleanup timer if alert was enabled
          // Timer cleanup is handled by the setTimeout above
        };
      }
    } else {
      // Update previous turn ref if turn changed but not to player
      if (previousTurn !== currentTurn) {
        previousTurnRef.current = currentTurn;
        // Reset turn_started_at when turn changes away from player
        if (currentTurn !== playerRole || players[playerRole] !== profileId) {
          setTurnStartedAt(null);
          setTimeRemaining(null);
        }
      }
    }
  }, [gameState.turn, status, playerRole, opponentRole, players, profileId, turnStartedAt]);

  // Hide "¡Tu turno!" alert when player makes a move
  useEffect(() => {
    if (pendingMove && showYourTurnAlert) {
      setShowYourTurnAlert(false);
    }
  }, [pendingMove, showYourTurnAlert]);

  // Timeout timer: Check if player has exceeded 60 seconds on their turn
  useEffect(() => {
    // Clear existing timers
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
    if (timeRemainingTimerRef.current) {
      clearInterval(timeRemainingTimerRef.current);
      timeRemainingTimerRef.current = null;
    }

    // Only run timeout check if it's the player's turn and game is in progress
    // and timeout is enabled
    if (
      status === "in_progress" &&
      canAct &&
      gameState.turn === playerRole &&
      players[playerRole] === profileId &&
      !isBotGame &&
      timeoutEnabled
    ) {
      // Use server's turn_started_at if available, otherwise set to now
      // The server's turn_started_at is set when the turn changes (in /api/games/update)
      // or when the game starts (when second player joins)
      // If the player just connected and it's their turn, use turn_started_at from server
      // If turn_started_at is not set yet, set it to now (this should only happen if server's value is missing)
      const startTime = turnStartedAt ?? new Date();
      if (!turnStartedAt) {
        // If turn_started_at is not set, this means the player just connected
        // and it's their turn, so start the timer now
        // The server should have set turn_started_at when the game started or turn changed,
        // but if it's missing, we'll set it locally
        console.log("[GameView] turn_started_at not set, initializing timer locally");
        setTurnStartedAt(startTime);
      }

      // Update time remaining every second
      const updateTimeRemaining = () => {
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        const remaining = Math.max(0, TURN_TIMEOUT_SECONDS - elapsed);
        setTimeRemaining(remaining);

        // If timeout exceeded, execute timeout
        if (remaining === 0) {
          console.log("[GameView] Timeout exceeded - executing timeout");
          void executeTimeout();
        }
      };

      // Initial update
      updateTimeRemaining();

      // Update every second
      timeRemainingTimerRef.current = setInterval(updateTimeRemaining, 1000);

      // Set timeout to execute after 60 seconds
      timeoutTimerRef.current = setTimeout(() => {
        console.log("[GameView] Timeout timer fired - executing timeout");
        void executeTimeout();
      }, TURN_TIMEOUT_SECONDS * 1000);

      return () => {
        if (timeoutTimerRef.current) {
          clearTimeout(timeoutTimerRef.current);
          timeoutTimerRef.current = null;
        }
        if (timeRemainingTimerRef.current) {
          clearInterval(timeRemainingTimerRef.current);
          timeRemainingTimerRef.current = null;
        }
      };
    } else {
      // Not player's turn - reset time remaining
      setTimeRemaining(null);
    }
  }, [canAct, status, gameState.turn, playerRole, players, profileId, isBotGame, turnStartedAt, executeTimeout]);

  // Auto-scroll to board when it's the player's turn
  // Scroll to focus on the board edge (top for HOME, bottom for AWAY) without including footer
  useEffect(() => {
    if (canAct && boardRef.current && status === "in_progress") {
      // Small delay to ensure DOM is updated and realtime updates are processed
      const timer = setTimeout(() => {
        if (boardRef.current) {
          // Get the board container element (the actual board)
          const boardContainer = boardRef.current.querySelector("#game-board-container") as HTMLElement;
          
          if (boardContainer) {
            const boardRect = boardContainer.getBoundingClientRect();
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const currentScrollY = window.scrollY;
            
            // Calculate the position of the board relative to the viewport
            const boardTop = boardRect.top + currentScrollY;
            const boardBottom = boardRect.bottom + currentScrollY;
            const boardHeight = boardRect.height;
            
            // For HOME players, show the bottom edge of the board (their goal area)
            // For AWAY players, show the top edge of the board (their goal area)
            // We want the board edge to be visible at the top or bottom of the viewport
            let targetScrollY: number;
            
            if (playerRole === "home") {
              // HOME: show bottom of board (goal at bottom) at the bottom of viewport
              // Position board so its bottom edge is near the bottom of viewport
              const padding = 20; // Small padding from viewport edge
              targetScrollY = boardBottom - viewportHeight + padding;
            } else {
              // AWAY: show top of board (goal at bottom after rotation) at the top of viewport
              // Position board so its top edge is near the top of viewport
              const padding = 20; // Small padding from viewport edge
              targetScrollY = boardTop - padding;
            }
            
            // Ensure we don't scroll past the document boundaries
            const maxScroll = Math.max(0, document.documentElement.scrollHeight - viewportHeight);
            targetScrollY = Math.max(0, Math.min(targetScrollY, maxScroll));
            
            // Only scroll if the board is not already in the desired position
            const currentScrollTop = window.scrollY;
            const scrollDifference = Math.abs(targetScrollY - currentScrollTop);
            
            if (scrollDifference > 50) { // Only scroll if difference is significant
              window.scrollTo({
                top: targetScrollY,
                behavior: "smooth",
              });
            }
            
            // Also ensure the board is horizontally centered if it's partially off-screen
            if (boardRect.left < 0 || boardRect.right > viewportWidth) {
              boardContainer.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
                inline: "center",
              });
            }
          }
        }
      }, 800); // Delay to allow for realtime updates and state changes
      
      return () => clearTimeout(timer);
    }
  }, [canAct, status, gameState.turn, playerRole]);

  return (
    <div className="mx-auto flex w-full max-w-[95vw] flex-col gap-6 px-2 py-6 sm:px-4 sm:py-8 lg:px-6 lg:py-10 xl:max-w-[95vw] 2xl:max-w-[1600px]">
      {showGoalCelebration && goalScorer && (
        <GoalCelebration
          key={`goal-${goalScorer}-${gameState.history?.length ?? 0}`}
          playerName={goalScorer}
          onComplete={handleGoalComplete}
        />
      )}

      {/* "¡Tu turno!" Alert - Only shown if ENABLE_YOUR_TURN_ALERT is true */}
      {ENABLE_YOUR_TURN_ALERT && showYourTurnAlert && canAct && status === "in_progress" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="animate-bounce-in rounded-2xl border-3 border-yellow-400 bg-gradient-to-br from-yellow-500 to-yellow-600 px-4 md:px-6 py-3 md:py-4 shadow-2xl backdrop-blur-sm pointer-events-auto">
            <div className="text-center">
              <div className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-1 md:mb-2 animate-pulse">
                ⚽ ¡Tu turno!
              </div>
              <div className="text-sm md:text-base lg:text-lg font-semibold text-yellow-100">
                Es tu momento de jugar
              </div>
            </div>
          </div>
        </div>
      )}

      {/* "¡Perdiste tu turno!" Alert */}
      {showTimeoutAlert && status === "in_progress" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="animate-bounce-in rounded-3xl border-4 border-red-500 bg-gradient-to-br from-red-600 to-red-700 px-8 md:px-12 py-6 md:py-8 shadow-2xl backdrop-blur-sm pointer-events-auto">
            <div className="text-center">
              <div className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-2 md:mb-3 animate-pulse">
                ⏱️ ¡Perdiste tu turno!
              </div>
              <div className="text-lg md:text-xl lg:text-2xl font-semibold text-red-100">
                Se agotó el tiempo de 60 segundos
              </div>
            </div>
          </div>
        </div>
      )}

      {/* "¡Ganaste!" Victory Alert */}
      {showVictoryAlert && status === "finished" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="animate-bounce-in rounded-3xl border-4 border-yellow-400 bg-gradient-to-br from-yellow-500 via-emerald-500 to-yellow-500 px-8 md:px-12 py-6 md:py-8 shadow-2xl backdrop-blur-sm pointer-events-auto">
            <div className="text-center">
              <div className="text-6xl md:text-7xl lg:text-8xl mb-4 md:mb-5 animate-pulse">
                🏆
              </div>
              <div className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-2 md:mb-3 animate-pulse">
                ¡Ganaste!
              </div>
              <div className="text-lg md:text-xl lg:text-2xl font-semibold text-yellow-100">
                ¡Felicidades por la victoria!
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Surrender Confirmation Modal */}
      {showSurrenderConfirm && status === "in_progress" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl md:rounded-3xl border-2 border-red-500/80 p-6 md:p-8 shadow-2xl max-w-md w-full mx-4">
            <div className="text-center">
              <div className="text-5xl md:text-6xl mb-4">🏳️</div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                ¿Rendirse?
              </h2>
              <p className="text-base md:text-lg text-slate-200 mb-6">
                ¿Estás seguro de que quieres rendirte? La partida terminará y tu oponente ganará.
              </p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => setShowSurrenderConfirm(false)}
                  className="px-6 py-3 rounded-xl border-2 border-slate-500 bg-slate-700 text-white font-semibold hover:bg-slate-600 transition-colors"
                  disabled={isSurrendering}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSurrender}
                  disabled={isSurrendering}
                  className="px-6 py-3 rounded-xl border-2 border-red-500 bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSurrendering ? "Rindiéndose..." : "Sí, rendirme"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Surrender Alert */}
      {showSurrenderAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="animate-bounce-in rounded-2xl border-3 border-red-400 bg-gradient-to-br from-red-500 to-red-600 px-4 md:px-6 py-3 md:py-4 shadow-2xl backdrop-blur-sm pointer-events-auto">
            <div className="text-center">
              <div className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-1 md:mb-2 animate-pulse">
                🏳️ Te rendiste
              </div>
              <div className="text-sm md:text-base lg:text-lg font-semibold text-red-100">
                Redirigiendo al lobby...
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content: Board on left, Header+Info on right (all screen sizes) */}
      <div 
        className="grid grid-cols-1 md:grid-cols-[1fr_0.9fr] lg:grid-cols-[1.4fr_1fr] gap-4 md:gap-6 items-start transition-transform duration-200"
        style={{
          transform: `scale(${boardZoom})`,
          transformOrigin: "top center",
          minWidth: boardZoom !== 1 ? `${100 / boardZoom}%` : "100%",
        }}
      >
        {/* Board - Left side on all screen sizes */}
        <div 
          ref={boardRef}
          className="w-full overflow-auto order-1 md:order-1 lg:sticky lg:top-6 lg:self-start relative"
        >
          {/* Zoom controls (desktop only) */}
          <div className="hidden md:flex absolute top-2 right-2 z-20 gap-2">
            <button
              onClick={() => {
                const newZoom = Math.max(0.5, boardZoom - 0.1);
                setBoardZoom(newZoom);
                localStorage.setItem("boardZoom", newZoom.toString());
              }}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-emerald-700/95 hover:bg-emerald-600 text-white font-bold text-xl shadow-lg border-2 border-emerald-400/70 transition-colors backdrop-blur-sm"
              title="Reducir zoom"
              aria-label="Reducir zoom"
            >
              −
            </button>
            <button
              onClick={() => {
                const newZoom = 1.0;
                setBoardZoom(newZoom);
                localStorage.setItem("boardZoom", newZoom.toString());
              }}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-emerald-700/95 hover:bg-emerald-600 text-white font-bold text-xs shadow-lg border-2 border-emerald-400/70 transition-colors backdrop-blur-sm"
              title="Restablecer zoom"
              aria-label="Restablecer zoom"
            >
              ⌂
            </button>
            <button
              onClick={() => {
                const newZoom = Math.min(2.0, boardZoom + 0.1);
                setBoardZoom(newZoom);
                localStorage.setItem("boardZoom", newZoom.toString());
              }}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-emerald-700/95 hover:bg-emerald-600 text-white font-bold text-xl shadow-lg border-2 border-emerald-400/70 transition-colors backdrop-blur-sm"
              title="Aumentar zoom"
              aria-label="Aumentar zoom"
            >
              +
            </button>
          </div>
          {/* Zoom indicator (desktop only) */}
          <div className="hidden md:block absolute top-2 left-2 z-20 px-2 py-1 rounded-full bg-emerald-900/80 text-emerald-100 text-xs font-semibold shadow-lg border border-emerald-600/50 backdrop-blur-sm">
            {Math.round(boardZoom * 100)}%
          </div>
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
        <div className="flex flex-col gap-4 md:gap-6 order-2 md:order-2">
          {/* Header */}
          <section className="flex flex-col gap-3 rounded-2xl md:rounded-3xl border-2 border-white/20 bg-gradient-to-br from-emerald-950/80 to-emerald-900/60 p-4 md:p-6 text-white shadow-2xl backdrop-blur-sm">
            {/* Top row: Partido # and Turn indicator (always visible, especially on mobile) */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-white">
                  Partido #{initialGameId.slice(0, 8)}
                </h1>
                {/* Turn indicator badge - always visible, especially on mobile */}
                {status === "in_progress" && (
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border-2 text-xs sm:text-sm font-semibold shadow-lg ${
                    currentTurnIsPlayer
                      ? "bg-emerald-600/90 text-white border-emerald-400/80 ring-2 ring-emerald-400/60"
                      : "bg-sky-600/90 text-white border-sky-400/80"
                  }`}>
                    <span className={currentTurnIsPlayer ? "text-emerald-100" : "text-sky-100"}>
                      {currentTurnIsPlayer ? "✅" : "⏳"}
                    </span>
                    <span className="font-bold">
                      {currentTurnLabel}
                    </span>
                  </div>
                )}
                {status === "finished" && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border-2 border-yellow-400/80 bg-yellow-600/90 text-white text-xs sm:text-sm font-semibold shadow-lg">
                    <span>🏁</span>
                    <span className="font-bold">
                      {computedWinnerLabel
                        ? `Ganó: ${computedWinnerLabel}`
                        : "Finalizado"}
                    </span>
                  </div>
                )}
                {status === "waiting" && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border-2 border-yellow-400/80 bg-yellow-600/90 text-white text-xs sm:text-sm font-semibold shadow-lg">
                    <span>⏳</span>
                    <span className="font-bold">Esperando</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/lobby"
                  className="rounded-full border-2 border-emerald-400/60 bg-emerald-600/80 px-2.5 md:px-3 py-1 md:py-1.5 sm:px-4 sm:py-2 text-xs md:text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-500 hover:border-emerald-300 hover:shadow-xl"
                >
                  ← Volver al Lobby
                </Link>
                {status !== "finished" && (
                  <Link
                    href="/"
                    className="rounded-full border-2 border-white/30 bg-white/10 px-2.5 md:px-3 py-1 md:py-1.5 sm:px-4 sm:py-2 text-xs md:text-sm font-semibold text-white shadow-lg transition hover:bg-white/20 hover:border-white/50"
                  >
                    🏠 Home
                  </Link>
                )}
              </div>
            </div>
            {/* Team names - visible on all screen sizes */}
            {/* Show team vs team for multiplayer games, or just player team for bot games */}
            {((!isBotGame && (team1Name || team2Name)) || (isBotGame && team1Name)) && (
              <div className="flex items-center justify-center gap-2 md:gap-3 py-2 md:py-3 border-t border-white/20">
                <div className="flex items-center gap-2">
                  {team1PrimaryColor && (
                    <div
                      className="h-4 w-4 md:h-5 md:w-5 rounded-full border-2 border-white/40 shadow-sm"
                      style={{
                        background: `linear-gradient(135deg, ${team1PrimaryColor}, ${team1SecondaryColor || team1PrimaryColor})`,
                      }}
                    />
                  )}
                  <span className="text-sm md:text-base font-bold text-emerald-50">
                    {team1Name || "Mi equipo"}
                  </span>
                </div>
                {!isBotGame && (
                  <>
                    <span className="text-xs md:text-sm font-semibold uppercase tracking-wider text-emerald-200/60">
                      vs
                    </span>
                    <div className="flex items-center gap-2">
                      {team2PrimaryColor && (
                        <div
                          className="h-4 w-4 md:h-5 md:w-5 rounded-full border-2 border-white/40 shadow-sm"
                          style={{
                            background: `linear-gradient(135deg, ${team2PrimaryColor}, ${team2SecondaryColor || team2PrimaryColor})`,
                          }}
                        />
                      )}
                      <span className="text-sm md:text-base font-bold text-emerald-50">
                        {team2Name || "Equipo 2"}
                      </span>
                    </div>
                  </>
                )}
                {isBotGame && (
                  <span className="text-xs md:text-sm font-semibold uppercase tracking-wider text-emerald-200/60">
                    vs {botDisplayName}
                  </span>
                )}
              </div>
            )}
            {/* Additional info - hidden on mobile, visible on desktop */}
            <div className="hidden md:block">
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
            </div>
            {/* Scores */}
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
                  {effectivePlayerLabels.home}: {score.home ?? 0}
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
                  {effectivePlayerLabels.away}: {score.away ?? 0}
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

          {feedback && status !== "finished" && (
            <div className="rounded-xl md:rounded-2xl border-2 border-emerald-400/60 bg-emerald-500/40 p-3 md:p-4 text-sm md:text-base font-semibold text-white shadow-xl backdrop-blur-sm">
              {feedback}
            </div>
          )}

          {/* Game finished message - show when game is finished */}
          {status === "finished" && (
            <div className={`rounded-xl md:rounded-2xl border-2 p-4 md:p-5 text-base md:text-lg font-semibold text-white shadow-xl backdrop-blur-sm ${
              winnerId && winnerId === players[playerRole]
                ? "border-emerald-500/60 bg-emerald-600/40"
                : "border-red-500/60 bg-red-600/40"
            }`}>
              <div className="flex flex-col gap-2 md:gap-3">
                <p className="text-lg md:text-xl font-bold text-center">
                  {winnerId && winnerId === players[playerRole]
                    ? "🎉 ¡Ganaste la partida!"
                    : winnerId === null && isBotGame
                      ? `😔 ${botDisplayName} ganó la partida`
                      : `😔 ${computedWinnerLabel ?? "Tu rival"} ganó la partida`}
                </p>
                {winnerId && winnerId !== players[playerRole] && (
                  <p className="text-sm md:text-base text-center text-white/90">
                    La partida ha terminado. Puedes volver al lobby para jugar otra partida.
                  </p>
                )}
                {winnerId && winnerId === players[playerRole] && (
                  <p className="text-sm md:text-base text-center text-white/90">
                    ¡Felicidades por la victoria! Puedes volver al lobby para jugar otra partida.
                  </p>
                )}
                {winnerId === null && isBotGame && (
                  <p className="text-sm md:text-base text-center text-white/90">
                    La partida ha terminado. Puedes volver al lobby para jugar otra partida.
                  </p>
                )}
              </div>
            </div>
          )}

          {isBotTurn && (
            <div className="rounded-xl md:rounded-2xl border-2 border-sky-400/60 bg-sky-500/40 p-3 md:p-4 text-sm md:text-base font-semibold text-white shadow-xl backdrop-blur-sm animate-pulse">
              🤖 {botDisplayName} está analizando su próximo movimiento…
            </div>
          )}

          {!isBotGame && !isBotTurn && !currentTurnIsPlayer && status === "in_progress" && (
            <div className="rounded-xl md:rounded-2xl border-2 border-sky-400/60 bg-sky-500/40 p-3 md:p-4 text-sm md:text-base font-semibold text-white shadow-xl backdrop-blur-sm">
              ⏳ Esperando que {effectivePlayerLabels[opponentRole]} haga su movimiento...
            </div>
          )}

          {/* Surrender button - show when game is in progress (both multiplayer and bot games) */}
          {status === "in_progress" && (
            <button
              onClick={() => setShowSurrenderConfirm(true)}
              disabled={isSurrendering}
              className="rounded-xl md:rounded-2xl border-2 border-red-500/80 bg-red-600/90 hover:bg-red-700/90 px-4 md:px-6 py-3 md:py-4 text-sm md:text-base font-semibold text-white shadow-xl backdrop-blur-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span>🏳️</span>
              <span>Rendirse</span>
            </button>
          )}

          {/* Time remaining counter for player's turn */}
          {canAct && status === "in_progress" && timeRemaining !== null && timeRemaining >= 0 && !isBotGame && timeoutEnabled && (
            <div className={`rounded-xl md:rounded-2xl border-2 p-3 md:p-4 text-sm md:text-base font-semibold text-white shadow-xl backdrop-blur-sm ${
              timeRemaining <= 10
                ? "border-red-500/80 bg-red-600/80 animate-pulse"
                : timeRemaining <= 20
                ? "border-orange-500/80 bg-orange-600/80"
                : "border-emerald-400/60 bg-emerald-600/80"
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-base md:text-lg font-bold">
                  ⏱️ Tiempo restante: {timeRemaining}s
                </span>
                {timeRemaining <= 10 && (
                  <span className="text-lg md:text-xl animate-pulse">⚠️</span>
                )}
              </div>
              {timeRemaining <= 10 && (
                <p className="mt-2 text-xs md:text-sm text-red-100">
                  ¡Apúrate! Si no mueves en {timeRemaining} segundos, perderás tu turno.
                </p>
              )}
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
                          ? effectivePlayerLabels.home
                          : effectivePlayerLabels.away}
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
              <span className="text-emerald-200">Tú:</span> <strong className="text-yellow-300 text-sm md:text-base lg:text-lg">{effectivePlayerLabels[playerRole]}</strong> ({playerRole.toUpperCase()}){" "}
              {!isBotGame && (
                <>
                  <span className="text-sky-200">•</span> <span className="text-sky-200">Oponente:</span> <strong className="text-sky-300 text-sm md:text-base lg:text-lg">{effectivePlayerLabels[opponentRole]}</strong> ({opponentRole.toUpperCase()})
                </>
              )}
            </p>
            <p className="text-xs md:text-sm lg:text-base font-semibold mb-2 md:mb-3">
              {status === "finished" ? (
                <>
                  Partido terminado.{" "}
                  <strong className="text-emerald-300 text-sm md:text-base lg:text-lg">
                    {winnerId && winnerId === players[playerRole]
                      ? "🎉 ¡Ganaste!"
                      : `😔 Ganó ${computedWinnerLabel ?? "tu rival"}`}
                  </strong>
                </>
              ) : (
                <>
                  Turno actual:{" "}
                  <strong className={`text-sm md:text-base lg:text-lg ${currentTurnIsPlayer ? "text-emerald-300" : "text-sky-300"}`}>
                    {currentTurnLabel} ({gameState.turn.toUpperCase()}){" "}
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
          
          {/* Zoom controls (mobile only) */}
          <div 
            className="flex md:hidden items-center justify-center gap-3 pt-2 border-t border-white/20 mt-4"
            style={{
              transform: `scale(${1 / boardZoom})`,
              transformOrigin: "center center",
            }}
          >
            <span className="text-xs text-emerald-200 font-semibold">Zoom:</span>
            <button
              onClick={() => {
                const newZoom = Math.max(0.5, boardZoom - 0.1);
                setBoardZoom(newZoom);
                localStorage.setItem("boardZoom", newZoom.toString());
              }}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-emerald-700/95 hover:bg-emerald-600 text-white font-bold text-xl shadow-lg border-2 border-emerald-400/70 transition-colors"
              title="Reducir zoom"
              aria-label="Reducir zoom"
            >
              −
            </button>
            <span className="text-sm text-emerald-100 font-semibold min-w-[50px] text-center">
              {Math.round(boardZoom * 100)}%
            </span>
            <button
              onClick={() => {
                const newZoom = 1.0;
                setBoardZoom(newZoom);
                localStorage.setItem("boardZoom", newZoom.toString());
              }}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-emerald-700/95 hover:bg-emerald-600 text-white font-bold text-xs shadow-lg border-2 border-emerald-400/70 transition-colors"
              title="Restablecer zoom"
              aria-label="Restablecer zoom"
            >
              ⌂
            </button>
            <button
              onClick={() => {
                const newZoom = Math.min(2.0, boardZoom + 0.1);
                setBoardZoom(newZoom);
                localStorage.setItem("boardZoom", newZoom.toString());
              }}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-emerald-700/95 hover:bg-emerald-600 text-white font-bold text-xl shadow-lg border-2 border-emerald-400/70 transition-colors"
              title="Aumentar zoom"
              aria-label="Aumentar zoom"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

