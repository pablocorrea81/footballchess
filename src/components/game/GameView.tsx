"use client";

import { useEffect, useMemo, useState } from "react";
import type { RealtimePostgresUpdatePayload } from "@supabase/supabase-js";
import Link from "next/link";

import { useSupabase } from "@/components/providers/SupabaseProvider";
import type { Database, Json } from "@/lib/database.types";
import {
  BOARD_COLS,
  BOARD_ROWS,
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
const rowLabel = (row: number) => BOARD_ROWS - row; // 12 at top -> 1 bottom

const formatPosition = (position: Position) =>
  `${columnLabel(position.col)}${rowLabel(position.row)}`;

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
    gameState.turn === playerRole ? playerLabels[playerRole] : playerLabels[opponentRole];
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

      const { error } = await supabase
        .from<Database["public"]["Tables"]["games"]["Row"]>("games")
        .update({
          game_state: outcome.nextState as unknown as Json,
          score: outcome.nextState.score as unknown as Json,
          status: nextStatus,
          winner_id: nextWinnerId,
        } as Database["public"]["Tables"]["games"]["Update"])
        .eq("id", initialGameId)
        .neq("status", "finished");

      if (error) {
        setFeedback(error.message);
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
    "rounded-full px-4 py-2 text-sm transition inline-flex items-center gap-2",
    role === "home" ? "bg-emerald-500/20 text-emerald-50" : "bg-sky-500/20 text-sky-50",
    isCurrentTurn ? "ring-2 ring-white/70" : "opacity-80",
    isStarting ? "border border-yellow-300/60" : "border border-transparent",
  ].join(" ");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <section className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 text-white shadow-xl md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Partido #{initialGameId.slice(0, 8)}
          </h1>
          <p className="text-sm text-emerald-100/70">
            {status === "finished"
              ? winnerId
                ? `Ganador: ${
                    winnerId === players.home
                      ? playerLabels.home
                      : playerLabels.away
                  }`
                : "Partida finalizada"
              : `Turno actual: ${currentTurnLabel}`}
          </p>
          {status !== "finished" && (
            <p className="text-xs uppercase tracking-widest text-emerald-200/80">
              Inicio: <span className="font-semibold">{startingLabel}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div
            className={badgeClass(
              "home",
              gameState.startingPlayer === "home",
              gameState.turn === "home",
            )}
          >
            {gameState.startingPlayer === "home" ? "★" : null}
            <span>
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
            <span>
              {playerLabels.away}: {score.away ?? 0}
            </span>
          </div>
        </div>
        {status === "finished" && (
          <Link
            href="/lobby"
            className="rounded-full border border-white/30 px-4 py-2 text-sm text-white transition hover:border-white hover:bg-white/10"
          >
            Volver al lobby
          </Link>
        )}
      </section>

      {status === "waiting" && (
        <div className="rounded-3xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-200">
          Esperando a que se una el segundo jugador...
        </div>
      )}

      {feedback && (
        <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-50 shadow-lg">
          {feedback}
        </div>
      )}

      {lastMoveDescription && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-white shadow">
          <p>
            Último movimiento: <strong>{lastMoveDescription}</strong>
          </p>
          {lastMoveGoalText && (
            <p className="mt-1 text-emerald-200">{lastMoveGoalText}</p>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <div
          className="mx-auto grid max-w-xl border border-white/20 shadow-2xl"
          style={{
            gridTemplateColumns: `repeat(${BOARD_COLS}, minmax(0, 1fr))`,
          }}
        >
          {rowIndices.map((actualRow, uiRow) =>
            colIndices.map((actualCol, uiCol) => {
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

              return (
                <button
                  key={`${actualRow}-${actualCol}`}
                  type="button"
                  onClick={() => handleCellClick(uiRow, uiCol)}
                  className={[
                    "aspect-square flex items-center justify-center border border-white/10 text-lg font-semibold transition",
                    (actualRow + actualCol) % 2 === 0
                      ? "bg-emerald-900/50"
                      : "bg-emerald-800/50",
                    isSelected ? "ring-4 ring-emerald-300/60" : "",
                    moveOption ? "bg-emerald-400/30" : "",
                    isLastTo
                      ? "bg-amber-500/40"
                      : isLastFrom
                        ? "bg-amber-500/20"
                        : "",
                    !canAct ? "cursor-default" : "",
                  ].join(" ")}
                  disabled={!canAct}
                >
                  {cell && (
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-full border text-base ${cell.owner === playerRole ? "border-emerald-200 bg-emerald-500/60 text-emerald-950" : "border-sky-200 bg-sky-500/50 text-sky-950"} ${
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
            }),
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white">
        <h2 className="text-base font-semibold text-white/90">
          Historial reciente
        </h2>
        {recentMoves.length === 0 ? (
          <p className="mt-3 text-emerald-100/70">
            Aún no hay movimientos registrados.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            <li className="flex items-center justify-between rounded-2xl border border-yellow-300/40 bg-yellow-300/10 px-4 py-2 text-sm text-amber-100">
              <span className="text-xs font-semibold uppercase tracking-widest text-amber-200">
                Inicio
              </span>
              <span className="flex items-center gap-2">
                <span>★ {startingLabel} sale jugando</span>
              </span>
              <span className="text-xs text-amber-200/70">Sorteo</span>
            </li>
            {recentMoves.map((move) => (
              <li
                key={move.moveNumber}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2"
              >
                <span className="text-xs font-semibold uppercase tracking-widest text-white/60">
                  #{move.moveNumber}
                </span>
                <span className="text-sm text-white/90">
                  {move.player === "home"
                    ? playerLabels.home
                    : playerLabels.away}{" "}
                  movió {move.pieceId.split("-")[1]} a{" "}
                  <strong>{formatPosition(move.to)}</strong>
                  {move.capturedPieceId ? (
                    <span className="text-rose-200">
                      {" "}
                      (captura a {move.capturedPieceId})
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-emerald-100/70">
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

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white">
        <p>
          Tu rol: <strong>{playerRole.toUpperCase()}</strong>.{" "}
          {status === "finished" ? (
            <>
              Partido terminado.{" "}
              <strong>
                {winnerId && winnerId === players[playerRole]
                  ? "Ganaste"
                  : "Ganó tu rival"}
              </strong>
              .
            </>
          ) : (
            <>
              Turno actual:{" "}
              <strong>
                {gameState.turn.toUpperCase()}{" "}
                {currentTurnIsPlayer ? "(Tu turno)" : "(Turno rival)"}
              </strong>
              .
            </>
          )}
        </p>
        <p className="mt-2 text-emerald-100/80">
          Selecciona una pieza tuya para ver movimientos legales. Los movimientos se
          validan localmente con la lógica oficial y se sincronizan en Supabase.
          {status === "finished" ? " Esta partida ya finalizó." : ""}
        </p>
      </div>
    </div>
  );
}

