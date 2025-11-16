"use client";

import { useMemo, useState } from "react";

import {
  BOARD_COLS,
  BOARD_ROWS,
  RuleEngine,
  type GameState,
  type Position,
} from "@/lib/ruleEngine";

type SelectionState = {
  from: Position | null;
};

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

export function TutorialBoard() {
  const [gameState, setGameState] = useState<GameState>(() =>
    RuleEngine.createInitialState("home"),
  );
  const [selection, setSelection] = useState<SelectionState>({ from: null });
  const [message, setMessage] = useState<string>(
    "Ejercicio: selecciona una defensa (D) de tu última fila y muévela 1 casilla hacia adelante.",
  );
  const [completed, setCompleted] = useState(false);

  // Elegir una defensa inicial y una casilla destino 1 casilla hacia adelante
  const { expectedFrom, expectedTo } = useMemo(() => {
    let from: Position | null = null;
    let to: Position | null = null;

    // Buscar una defensa de HOME en la última fila cuya casilla de adelante esté libre
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const row = BOARD_ROWS - 1; // fila 11
      const piece = gameState.board[row]?.[col];
      if (piece && piece.owner === "home" && piece.type === "defensa") {
        const forwardRow = row - 1;
        if (forwardRow >= 0 && !gameState.board[forwardRow]?.[col]) {
          from = { row, col };
          to = { row: forwardRow, col };
          break;
        }
      }
    }

    // Fallback por si algo cambia en el layout
    if (!from || !to) {
      from = { row: BOARD_ROWS - 1, col: 1 };
      to = { row: BOARD_ROWS - 2, col: 1 };
    }

    return { expectedFrom: from, expectedTo: to };
  }, [gameState.board]);

  const handleCellClick = (row: number, col: number) => {
    if (completed) return;

    const clicked: Position = { row, col };

    // Si no hay selección aún, esperamos que seleccione la defensa marcada
    if (!selection.from) {
      const isExpected =
        clicked.row === expectedFrom.row && clicked.col === expectedFrom.col;
      const piece = gameState.board[row]?.[col];

      if (!piece || piece.owner !== "home" || piece.type !== "defensa") {
        setMessage(
          "Para este ejercicio, haz clic sobre una defensa (D) de tu última fila.",
        );
        return;
      }

      if (!isExpected) {
        setMessage(
          "Usa la defensa resaltada para este ejemplo. Luego la moveremos hacia adelante.",
        );
        setSelection({ from: expectedFrom });
        return;
      }

      setSelection({ from: clicked });
      setMessage("Ahora haz clic en la casilla justo delante (↑) para mover la defensa.");
      return;
    }

    // Ya hay origen seleccionado: esperamos que haga clic en la casilla destino
    const isDest =
      clicked.row === expectedTo.row && clicked.col === expectedTo.col;
    if (!isDest) {
      setMessage("En este ejercicio solo aceptamos mover 1 casilla hacia adelante.");
      return;
    }

    // Intentar aplicar el movimiento con RuleEngine
    try {
      const move = {
        player: "home" as const,
        from: selection.from!,
        to: expectedTo,
      };
      const outcome = RuleEngine.applyMove(gameState, move);
      setGameState(outcome.nextState);
      setCompleted(true);
      setSelection({ from: null });
      setMessage("¡Perfecto! Moviste una defensa 1 casilla hacia adelante.");
    } catch (error) {
      console.error("[TutorialBoard] Error aplicando movimiento:", error);
      setMessage("Movimiento inválido según las reglas. Intenta nuevamente.");
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-4">
      <p className="text-xs sm:text-sm text-emerald-900/90">{message}</p>
      <div className="inline-block rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 shadow-sm">
        <div className="grid grid-cols-8 gap-0.5">
          {Array.from({ length: BOARD_ROWS }).map((_, uiRow) => {
            const row = uiRow; // para el tutorial mostramos row 0 arriba, 11 abajo
            return Array.from({ length: BOARD_COLS }).map((_, col) => {
              const piece = gameState.board[row]?.[col];
              const isExpectedFrom =
                row === expectedFrom.row && col === expectedFrom.col;
              const isExpectedTo =
                row === expectedTo.row && col === expectedTo.col;
              const isSelected =
                selection.from &&
                selection.from.row === row &&
                selection.from.col === col;

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
            });
          })}
        </div>
      </div>
      {completed && (
        <div className="mt-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs text-emerald-900">
          Ya entendiste cómo mover una defensa 1 casilla. Próximos ejercicios pueden
          practicar mediocampistas y delanteros.
        </div>
      )}
    </div>
  );
}


