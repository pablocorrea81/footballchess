"use client";

import { useState } from "react";

import {
  BOARD_COLS,
  BOARD_ROWS,
  RuleEngine,
  type GameState,
  type Position,
} from "@/lib/ruleEngine";

const pieceInitial = (type: string): string => {
  switch (type) {
    case "defensa":
      return "D";
    case "carrilero":
      return "C";
    case "mediocampista":
      return "M";
    case "delantero":
      return "F";
    default:
      return "?";
  }
};

export function TutorialMidfielderBoard() {
  const [gameState, setGameState] = useState<GameState>(() =>
    RuleEngine.createInitialState("home"),
  );
  const [from, setFrom] = useState<Position | null>(null);
  const [message, setMessage] = useState<string>(
    "Ejercicio: selecciona un mediocampista (M) y muévelo en diagonal dos casillas.",
  );
  const [completed, setCompleted] = useState(false);

  // Usamos una posición típica del layout actual: mediocampista en (row: 10, col: 3)
  const expectedFrom: Position = { row: 10, col: 3 };
  const expectedTo: Position = { row: 8, col: 5 }; // diagonal hacia adelante derecha

  const handleCellClick = (row: number, col: number) => {
    if (completed) return;

    const clicked: Position = { row, col };

    if (!from) {
      const piece = gameState.board[row]?.[col];
      const isExpected =
        row === expectedFrom.row && col === expectedFrom.col;

      if (!piece || piece.owner !== "home" || piece.type !== "mediocampista") {
        setMessage(
          "Para este ejercicio, haz clic sobre un mediocampista (M) en la segunda fila desde tu arco.",
        );
        return;
      }

      if (!isExpected) {
        setMessage(
          "Usa el mediocampista resaltado para este ejemplo. Luego lo moveremos en diagonal.",
        );
        setFrom(expectedFrom);
        return;
      }

      setFrom(clicked);
      setMessage(
        "Ahora haz clic en la casilla destino, dos casillas en diagonal hacia adelante.",
      );
      return;
    }

    const isDest = row === expectedTo.row && col === expectedTo.col;
    if (!isDest) {
      setMessage(
        "Recuerda: para este ejercicio solo aceptamos exactamente 2 casillas en diagonal.",
      );
      return;
    }

    try {
      const move = {
        player: "home" as const,
        from,
        to: expectedTo,
      };
      const outcome = RuleEngine.applyMove(gameState, move);
      setGameState(outcome.nextState);
      setCompleted(true);
      setFrom(null);
      setMessage("¡Muy bien! Moviste un mediocampista en diagonal dos casillas.");
    } catch (error) {
      console.error("[TutorialMidfielderBoard] Error aplicando movimiento:", error);
      setMessage("Movimiento inválido según las reglas. Intenta nuevamente.");
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className="text-xs sm:text-sm text-emerald-900/90">{message}</p>
      <div className="inline-block rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 shadow-sm">
        <div className="grid grid-cols-8 gap-0.5">
          {Array.from({ length: BOARD_ROWS }).map((_, row) =>
            Array.from({ length: BOARD_COLS }).map((_, col) => {
              const piece = gameState.board[row]?.[col];
              const isExpectedFrom =
                row === expectedFrom.row && col === expectedFrom.col;
              const isExpectedTo =
                row === expectedTo.row && col === expectedTo.col;
              const isSelected =
                from && from.row === row && from.col === col;

              return (
                <button
                  key={`${row}-${col}`}
                  type="button"
                  onClick={() => handleCellClick(row, col)}
                  className={[
                    "flex aspect-square w-7 items-center justify-center rounded-sm text-xs font-semibold transition",
                    (row + col) % 2 === 0
                      ? "bg-emerald-100"
                      : "bg-emerald-200/80",
                    piece
                      ? piece.owner === "home"
                        ? "text-emerald-900"
                        : "text-sky-900"
                      : "text-emerald-700/60",
                    isExpectedFrom && !completed
                      ? "ring-2 ring-offset-1 ring-amber-400 ring-offset-emerald-50"
                      : "",
                    isExpectedTo && !completed
                      ? "border border-dashed border-emerald-700/80"
                      : "",
                    isSelected ? "outline outline-2 outline-sky-500" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {piece ? pieceInitial(piece.type) : ""}
                </button>
              );
            }),
          )}
        </div>
      </div>
      {completed && (
        <div className="mt-1 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs text-emerald-900">
          Entendido cómo se mueven los mediocampistas. Son clave para controlar el centro del campo.
        </div>
      )}
    </div>
  );
}


