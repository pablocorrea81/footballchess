"use client";

import { useEffect, useMemo, useState } from "react";
import type { RealtimePostgresUpdatePayload } from "@supabase/supabase-js";
import Link from "next/link";

import { useSupabase } from "@/components/providers/SupabaseProvider";
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

  const rowIndices = useMemo(
    () =>
      playerRole === "home"
        ? [...Array(BOARD_ROWS).keys()]
        : [...Array(BOARD_ROWS).keys()].reverse(),
    [playerRole],
  );

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

  useEffect(() => {
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
          if (!payload.new) return;
          const nextState =
            (payload.new.game_state as GameState | null) ??
            RuleEngine.createInitialState();
          const nextScore =
            (payload.new.score as GameState["score"] | null) ??
            RuleEngine.createInitialState().score;

          setGameState(nextState);
          setScore(nextScore);
          setStatus(payload.new.status);
          setPlayers({
            home: payload.new.player_1_id,
            away: payload.new.player_2_id,
          });
          setWinnerId(payload.new.winner_id ?? null);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [initialGameId, supabase]);

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
      setGameState(outcome.nextState);
      setScore(outcome.nextState.score);
      setSelection(null);
      const scoringLabel = playerLabels[playerRole];
      setFeedback(
        outcome.goal
          ? `¡Gol de ${scoringLabel}! El rival mueve primero tras el reinicio.`
          : null,
      );

      let nextStatus = status;
      let nextWinnerId: string | null = winnerId;
      if (outcome.goal) {
        const updatedScore = outcome.nextState.score[playerRole] ?? 0;
        if (updatedScore >= 3) {
          nextStatus = "finished";
          nextWinnerId = players[playerRole] ?? null;
          setFeedback(`¡Victoria de ${scoringLabel}!`);
        }
      }
      setStatus(nextStatus);
      setWinnerId(nextWinnerId);

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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <section className="flex flex-col gap-4 rounded-3xl border-2 border-white/20 bg-gradient-to-br from-emerald-950/80 to-emerald-900/60 p-6 text-white shadow-2xl backdrop-blur-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Partido #{initialGameId.slice(0, 8)}
          </h1>
          <p className="mt-2 text-base font-medium text-emerald-50">
            {status === "finished"
              ? computedWinnerLabel
                ? `Ganador: ${computedWinnerLabel}`
                : "Partida finalizada"
              : `Turno actual: ${currentTurnLabel}`}
          </p>
          {status !== "finished" && (
            <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-emerald-200">
              Inicio: <span className="text-yellow-300">{startingLabel}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 text-base">
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
        {status === "finished" && (
          <Link
            href="/lobby"
            className="rounded-full border-2 border-emerald-400/60 bg-emerald-600/80 px-6 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-emerald-500 hover:border-emerald-300 hover:shadow-xl"
          >
            ← Volver al lobby
          </Link>
        )}
      </section>

      {status === "waiting" && (
        <div className="rounded-2xl border-2 border-yellow-500/60 bg-yellow-500/30 p-5 text-base font-semibold text-yellow-900 shadow-lg backdrop-blur-sm">
          ⏳ Esperando a que se una el segundo jugador...
        </div>
      )}

      {feedback && (
        <div className="rounded-2xl border-2 border-emerald-400/60 bg-emerald-500/40 p-5 text-base font-semibold text-white shadow-xl backdrop-blur-sm">
          {feedback}
        </div>
      )}

      {isBotTurn && (
        <div className="rounded-2xl border-2 border-sky-400/60 bg-sky-500/40 p-5 text-base font-semibold text-white shadow-xl backdrop-blur-sm animate-pulse">
          🤖 {botDisplayName} está analizando su próximo movimiento…
        </div>
      )}

      {lastMoveDescription && (
        <div className="rounded-2xl border-2 border-white/30 bg-gradient-to-r from-slate-800/90 to-slate-700/90 p-5 text-base text-white shadow-xl backdrop-blur-sm">
          <p className="font-medium">
            Último movimiento: <strong className="text-yellow-300">{lastMoveDescription}</strong>
          </p>
          {lastMoveGoalText && (
            <p className="mt-2 text-lg font-bold text-emerald-300">⚽ {lastMoveGoalText}</p>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="mx-auto inline-block border border-white/20 shadow-2xl">
          {/* Column labels (A-H) */}
          <div
            className="grid border-b border-white/20"
            style={{
              gridTemplateColumns: `auto repeat(${BOARD_COLS}, minmax(0, 4rem))`,
            }}
          >
            <div className="w-8"></div>
            {colIndices.map((actualCol) => (
              <div
                key={`col-label-${actualCol}`}
                className="flex h-8 items-center justify-center border-l border-white/20 bg-emerald-950/80 text-sm font-bold text-emerald-100 shadow-sm"
              >
                {getColumnLabelForDisplay(actualCol, playerRole)}
              </div>
            ))}
          </div>

          {/* Board rows with row labels */}
          {rowIndices.map((actualRow, uiRow) => (
            <div
              key={`row-${actualRow}`}
              className="grid border-b border-white/20 last:border-b-0"
              style={{
                gridTemplateColumns: `auto repeat(${BOARD_COLS}, minmax(0, 4rem))`,
              }}
            >
              {/* Row label (1-12) */}
              <div className="flex w-8 items-center justify-center border-r border-white/20 bg-emerald-950/80 text-sm font-bold text-emerald-100 shadow-sm">
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

                return (
                  <button
                    key={`${actualRow}-${actualCol}`}
                    type="button"
                    onClick={() => handleCellClick(uiRow, uiCol)}
                    className={[
                      "aspect-square flex h-16 w-16 items-center justify-center border-l border-t border-white/10 text-lg font-semibold transition relative",
                      isGoalSquare
                        ? "border-yellow-400/60 bg-yellow-500/20"
                        : "border-white/10",
                      !isGoalSquare &&
                        ((actualRow + actualCol) % 2 === 0
                          ? "bg-emerald-900/50"
                          : "bg-emerald-800/50"),
                      isSelected ? "ring-4 ring-emerald-300/60 z-10" : "",
                      moveOption && !isGoalSquare ? "bg-emerald-400/30" : "",
                      isLastTo && !isGoalSquare
                        ? "bg-amber-500/40"
                        : isLastFrom && !isGoalSquare
                          ? "bg-amber-500/20"
                          : "",
                      !canAct ? "cursor-default" : "cursor-pointer hover:bg-white/5",
                    ].join(" ")}
                    disabled={!canAct}
                    title={
                      isGoalSquare
                        ? `Arco - ${positionLabel}`
                        : `${positionLabel}${cell ? ` - ${pieceInitials[cell.type]}` : ""}`
                    }
                  >
                    {/* Position label (small, top-left corner) - from player's perspective */}
                    <span className="absolute left-1 top-1 text-[0.65rem] font-mono font-bold text-white/80 bg-black/40 px-1 rounded">
                      {positionLabel}
                    </span>

                    {/* Goal icon */}
                    {isGoalSquare && (
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-yellow-300/80">
                        🥅
                      </span>
                    )}

                    {/* Piece */}
                    {cell && (
                      <span
                        className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border text-base ${cell.owner === playerRole ? "border-emerald-200 bg-emerald-500/60 text-emerald-950" : "border-sky-200 bg-sky-500/50 text-sky-950"} ${
                          highlightStartingPiece
                            ? "shadow-[0_0_0_4px_rgba(250,204,21,0.6)] animate-pulse"
                            : ""
                        }`}
                      >
                        {pieceInitials[cell.type]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border-2 border-white/30 bg-gradient-to-br from-slate-800/95 to-slate-900/95 p-6 text-white shadow-2xl backdrop-blur-sm">
        <h2 className="text-xl font-bold text-white mb-4">
          📜 Historial reciente
        </h2>
        {recentMoves.length === 0 ? (
          <p className="mt-3 text-base text-emerald-200">
            Aún no hay movimientos registrados.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            <li className="flex items-center justify-between rounded-xl border-2 border-yellow-400/60 bg-yellow-500/30 px-5 py-3 text-base font-semibold text-yellow-900 shadow-lg">
              <span className="text-sm font-bold uppercase tracking-wider text-yellow-800">
                Inicio
              </span>
              <span className="flex items-center gap-2">
                <span>★ {startingLabel} sale jugando</span>
              </span>
              <span className="text-sm font-medium text-yellow-800">Sorteo</span>
            </li>
            {recentMoves.map((move) => (
              <li
                key={move.moveNumber}
                className="flex items-center justify-between rounded-xl border-2 border-white/20 bg-white/10 px-5 py-3 shadow-md hover:bg-white/15 transition-colors"
              >
                <span className="text-sm font-bold uppercase tracking-wider text-emerald-300 bg-emerald-900/50 px-3 py-1 rounded-full">
                  #{move.moveNumber}
                </span>
                <span className="text-base text-white font-medium flex-1 text-center">
                  <span className={move.player === "home" ? "text-emerald-300" : "text-sky-300"}>
                    {move.player === "home"
                      ? playerLabels.home
                      : playerLabels.away}
                  </span>{" "}
                  movió <span className="font-semibold text-yellow-300">{move.pieceId.split("-")[1]}</span> a{" "}
                  <strong className="text-yellow-300 font-bold">{formatPosition(move.to)}</strong>
                  {move.capturedPieceId ? (
                    <span className="text-rose-300 font-semibold ml-2">
                      ⚔️ (captura)
                    </span>
                  ) : null}
                </span>
                <span className="text-sm font-medium text-emerald-200 bg-emerald-900/50 px-3 py-1 rounded-full">
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

      <div className="rounded-2xl border-2 border-white/30 bg-gradient-to-br from-slate-800/95 to-slate-900/95 p-6 text-white shadow-2xl backdrop-blur-sm">
        <p className="text-base font-semibold mb-3">
          Tu rol: <strong className="text-yellow-300 text-lg">{playerRole.toUpperCase()}</strong>.{" "}
          {status === "finished" ? (
            <>
              Partido terminado.{" "}
              <strong className="text-emerald-300 text-lg">
                {winnerId && winnerId === players[playerRole]
                  ? "🎉 ¡Ganaste!"
                  : "😔 Ganó tu rival"}
              </strong>
            </>
          ) : (
            <>
              Turno actual:{" "}
              <strong className={`text-lg ${currentTurnIsPlayer ? "text-emerald-300" : "text-sky-300"}`}>
                {gameState.turn.toUpperCase()}{" "}
                {currentTurnIsPlayer ? "✅ (Tu turno)" : "⏳ (Turno rival)"}
              </strong>
            </>
          )}
        </p>
        <p className="text-sm text-emerald-100 font-medium leading-relaxed">
          💡 Selecciona una pieza tuya para ver movimientos legales. Los movimientos se
          validan localmente con la lógica oficial y se sincronizan en Supabase.
          {status === "finished" ? " Esta partida ya finalizó." : ""}
        </p>
      </div>
    </div>
  );
}

