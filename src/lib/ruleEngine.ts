export type PlayerId = "home" | "away";

export type PieceType =
  | "carrilero"
  | "defensa"
  | "mediocampista"
  | "delantero";

export interface Position {
  row: number;
  col: number;
}

export interface Piece {
  id: string;
  type: PieceType;
  owner: PlayerId;
  canScore: boolean;
}

export type BoardCell = Piece | null;

export interface GameState {
  board: BoardCell[][];
  turn: PlayerId;
  score: Record<PlayerId, number>;
  lastMove?: MoveRecord | null;
  history: MoveRecord[];
  startingPlayer: PlayerId;
}

export interface Move {
  player: PlayerId;
  from: Position;
  to: Position;
}

export interface MoveRecord {
  moveNumber: number;
  player: PlayerId;
  from: Position;
  to: Position;
  pieceId: string;
  capturedPieceId?: string;
  goal?: {
    scoringPlayer: PlayerId;
  };
  timestamp: string;
}

export type MoveValidationResult =
  | {
      valid: true;
      capture: boolean;
      goal: boolean;
    }
  | {
      valid: false;
      reason: string;
    };

export interface MoveOutcome {
  nextState: GameState;
  capture?: Piece;
  goal?: {
    scoringPlayer: PlayerId;
  };
}

export const BOARD_ROWS = 12;
export const BOARD_COLS = 8;

const GOAL_ROWS: Record<PlayerId, number> = {
  home: BOARD_ROWS - 1, // Row 11
  away: 0, // Row 0
};

// Goal columns are the middle two columns (3 and 4) in the goal rows
export const GOAL_COLS = [3, 4];

const opponent = (player: PlayerId): PlayerId =>
  player === "home" ? "away" : "home";

const HOME_PIECE_LAYOUT: Array<{ type: PieceType; position: Position }> = [
  // Back line (row 11) - Goal row, goal is at columns 3 and 4 (empty)
  // Carrileros en las puntas (columns 0 and 7)
  { type: "carrilero", position: { row: 11, col: 0 } },
  { type: "carrilero", position: { row: 11, col: 7 } },
  // Defensas al costado del arco (columns 2 and 5)
  // También defensas en columns 1 and 6 para tener 4 defensas totales
  { type: "defensa", position: { row: 11, col: 1 } },
  { type: "defensa", position: { row: 11, col: 2 } },
  { type: "defensa", position: { row: 11, col: 5 } },
  { type: "defensa", position: { row: 11, col: 6 } },
  // Mediocampistas adelante del arco (row 10)
  { type: "mediocampista", position: { row: 10, col: 1 } },
  { type: "mediocampista", position: { row: 10, col: 3 } },
  { type: "mediocampista", position: { row: 10, col: 4 } },
  { type: "mediocampista", position: { row: 10, col: 6 } },
  // Delanteros delante de los mediocampistas (row 9)
  { type: "delantero", position: { row: 9, col: 2 } },
  { type: "delantero", position: { row: 9, col: 5 } },
];

const createAwayLayout = (): Array<{ type: PieceType; position: Position }> => {
  const layout: Array<{ type: PieceType; position: Position }> = [];
  for (const piece of HOME_PIECE_LAYOUT) {
    layout.push({
      type: piece.type,
      position: {
        row: BOARD_ROWS - 1 - piece.position.row,
        col: piece.position.col,
      },
    });
  }
  return layout;
};

const INITIAL_POSITIONS: Record<PlayerId, Array<{ type: PieceType; position: Position }>> = {
  home: HOME_PIECE_LAYOUT,
  away: createAwayLayout(),
};

const PIECE_CAN_SCORE: Record<PieceType, boolean> = {
  carrilero: true,
  defensa: false,
  mediocampista: true,
  delantero: true,
};

const createEmptyBoard = (): BoardCell[][] =>
  Array.from({ length: BOARD_ROWS }, () =>
    Array.from({ length: BOARD_COLS }, () => null),
  );

const isInsideBoard = ({ row, col }: Position): boolean =>
  row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;

const cloneBoard = (board: BoardCell[][]): BoardCell[][] =>
  board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));

const pathIsClear = (
  board: BoardCell[][],
  from: Position,
  to: Position,
): boolean => {
  const rowStep = Math.sign(to.row - from.row);
  const colStep = Math.sign(to.col - from.col);

  let currentRow = from.row + rowStep;
  let currentCol = from.col + colStep;

  while (currentRow !== to.row || currentCol !== to.col) {
    if (board[currentRow]?.[currentCol]) {
      return false;
    }

    currentRow += rowStep;
    currentCol += colStep;
  }

  return true;
};

const buildPieceId = (
  owner: PlayerId,
  type: PieceType,
  index: number,
): string => `${owner}-${type}-${index + 1}`;

const seedBoard = (): BoardCell[][] => {
  const board = createEmptyBoard();
  const counters: Record<PlayerId, Record<PieceType, number>> = {
    home: { carrilero: 0, defensa: 0, mediocampista: 0, delantero: 0 },
    away: { carrilero: 0, defensa: 0, mediocampista: 0, delantero: 0 },
  };

  (["home", "away"] as PlayerId[]).forEach((player) => {
    for (const { type, position } of INITIAL_POSITIONS[player]) {
      counters[player][type] += 1;

      board[position.row][position.col] = {
        id: buildPieceId(player, type, counters[player][type] - 1),
        type,
        owner: player,
        canScore: PIECE_CAN_SCORE[type],
      };
    }
  });

  return board;
};

const isOwnGoalSquare = (piece: Piece, position: Position): boolean =>
  position.row === GOAL_ROWS[piece.owner] &&
  GOAL_COLS.includes(position.col);

const isOpponentGoalSquare = (piece: Piece, position: Position): boolean =>
  position.row === GOAL_ROWS[opponent(piece.owner)] &&
  GOAL_COLS.includes(position.col);

const asVector = (from: Position, to: Position): { dRow: number; dCol: number } => ({
  dRow: to.row - from.row,
  dCol: to.col - from.col,
});

const getDistance = (dRow: number, dCol: number): number =>
  Math.max(Math.abs(dRow), Math.abs(dCol));

const isDiagonalMove = (dRow: number, dCol: number): boolean =>
  Math.abs(dRow) === Math.abs(dCol) && dRow !== 0;

const isStraightMove = (dRow: number, dCol: number): boolean =>
  (dRow === 0 && dCol !== 0) || (dCol === 0 && dRow !== 0);

const validateCarrileroMove = (
  board: BoardCell[][],
  from: Position,
  to: Position,
): boolean => {
  const { dRow, dCol } = asVector(from, to);
  const distance = getDistance(dRow, dCol);

  if (!(isStraightMove(dRow, dCol) && distance > 0 && distance <= 2)) {
    return false;
  }

  return pathIsClear(board, from, to);
};

const validateDefensaMove = (from: Position, to: Position): boolean => {
  const { dRow, dCol } = asVector(from, to);
  return getDistance(dRow, dCol) === 1;
};

const validateMediocampistaMove = (
  board: BoardCell[][],
  from: Position,
  to: Position,
): boolean => {
  const { dRow, dCol } = asVector(from, to);

  if (!isDiagonalMove(dRow, dCol)) {
    return false;
  }

  return pathIsClear(board, from, to);
};

const validateDelanteroMove = (
  board: BoardCell[][],
  from: Position,
  to: Position,
): boolean => {
  const { dRow, dCol } = asVector(from, to);

  if (!(isStraightMove(dRow, dCol) || isDiagonalMove(dRow, dCol))) {
    return false;
  }

  return pathIsClear(board, from, to);
};

const ensurePieceBelongsToPlayer = (
  piece: Piece | null,
  player: PlayerId,
): piece is Piece => !!piece && piece.owner === player;

const ensureDestinationIsValid = (
  board: BoardCell[][],
  piece: Piece,
  to: Position,
): MoveValidationResult => {
  if (!isInsideBoard(to)) {
    return { valid: false, reason: "Movimiento fuera del tablero." };
  }

  const targetCell = board[to.row][to.col];

  if (targetCell && targetCell.owner === piece.owner) {
    return { valid: false, reason: "No puedes capturar una pieza aliada." };
  }

  if (isOwnGoalSquare(piece, to)) {
    return {
      valid: false,
      reason: "No puedes terminar tu movimiento dentro de tu propia portería.",
    };
  }

  if (isOpponentGoalSquare(piece, to) && !piece.canScore) {
    return {
      valid: false,
      reason: "Los defensas no pueden marcar goles.",
    };
  }

  return {
    valid: true,
    capture: Boolean(targetCell),
    goal: isOpponentGoalSquare(piece, to),
  };
};

const validatePieceSpecificRules = (
  board: BoardCell[][],
  piece: Piece,
  from: Position,
  to: Position,
): boolean => {
  switch (piece.type) {
    case "carrilero":
      return validateCarrileroMove(board, from, to);
    case "defensa":
      return validateDefensaMove(from, to);
    case "mediocampista":
      return validateMediocampistaMove(board, from, to);
    case "delantero":
      return validateDelanteroMove(board, from, to);
    default:
      return false;
  }
};

const applyPieceMovement = (
  board: BoardCell[][],
  piece: Piece,
  from: Position,
  to: Position,
): { updatedBoard: BoardCell[][]; capturedPiece?: Piece } => {
  const updatedBoard = cloneBoard(board);
  const destinationPiece = updatedBoard[to.row][to.col] ?? undefined;

  updatedBoard[from.row][from.col] = null;
  updatedBoard[to.row][to.col] = { ...piece };

  return {
    updatedBoard,
    capturedPiece: destinationPiece,
  };
};

export class RuleEngine {
  static createInitialState(startingPlayer: PlayerId = "home"): GameState {
    return {
      board: seedBoard(),
      turn: startingPlayer,
      score: {
        home: 0,
        away: 0,
      },
      lastMove: null,
      history: [],
      startingPlayer,
    };
  }

  static validateMove(
    state: GameState,
    move: Move,
    options?: { skipTurnCheck?: boolean },
  ): MoveValidationResult {
    if (!options?.skipTurnCheck && move.player !== state.turn) {
      return {
        valid: false,
        reason: "No es tu turno.",
      };
    }

    const originPiece = state.board[move.from.row]?.[move.from.col];

    if (!ensurePieceBelongsToPlayer(originPiece, move.player)) {
      return {
        valid: false,
        reason: "No hay una pieza tuya en la casilla de origen.",
      };
    }

    const destinationCheck = ensureDestinationIsValid(
      state.board,
      originPiece,
      move.to,
    );

    if (!destinationCheck.valid) {
      return destinationCheck;
    }

    const obeysPieceRules = validatePieceSpecificRules(
      state.board,
      originPiece,
      move.from,
      move.to,
    );

    if (!obeysPieceRules) {
      return {
        valid: false,
        reason: "Movimiento no permitido para esta pieza.",
      };
    }

    return destinationCheck;
  }

  static applyMove(state: GameState, move: Move): MoveOutcome {
    const validation = this.validateMove(state, move);

    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    const originPiece = state.board[move.from.row]![move.from.col]!;
    const { updatedBoard, capturedPiece } = applyPieceMovement(
      state.board,
      originPiece,
      move.from,
      move.to,
    );

    const nextScore = { ...state.score };
    let nextTurn = opponent(move.player);
    let updatedBoardState = updatedBoard;
    let goalPayload: MoveOutcome["goal"];

    if (validation.goal) {
      nextScore[move.player] += 1;
      updatedBoardState = seedBoard();
      nextTurn = opponent(move.player);

      goalPayload = {
        scoringPlayer: move.player,
      };
    }

    const moveRecord: MoveRecord = {
      moveNumber: state.history.length + 1,
      player: move.player,
      from: move.from,
      to: move.to,
      pieceId: originPiece.id,
      capturedPieceId: capturedPiece?.id,
      goal: goalPayload
        ? { scoringPlayer: goalPayload.scoringPlayer }
        : undefined,
      timestamp: new Date().toISOString(),
    };

    const nextState: GameState = {
      board: updatedBoardState,
      turn: validation.goal ? nextTurn : nextTurn,
      score: nextScore,
      lastMove: moveRecord,
      startingPlayer: state.startingPlayer,
      history: [...state.history, moveRecord],
    };

    return {
      nextState,
      capture: capturedPiece ?? undefined,
      goal: goalPayload,
    };
  }

  static getLegalMovesForPiece(
    state: GameState,
    position: Position,
  ): Position[] {
    const piece = state.board[position.row]?.[position.col];

    if (!piece) {
      return [];
    }

    const candidates: Position[] = [];
    const pushIfLegal = (candidate: Position) => {
      const result = this.validateMove(
        { ...state, turn: piece.owner },
        {
          player: piece.owner,
          from: position,
          to: candidate,
        },
        { skipTurnCheck: true },
      );

      if (result.valid) {
        candidates.push(candidate);
      }
    };

    switch (piece.type) {
      case "defensa": {
        for (let dRow = -1; dRow <= 1; dRow += 1) {
          for (let dCol = -1; dCol <= 1; dCol += 1) {
            if (dRow === 0 && dCol === 0) continue;
            const candidate = { row: position.row + dRow, col: position.col + dCol };
            if (isInsideBoard(candidate)) {
              pushIfLegal(candidate);
            }
          }
        }
        break;
      }
      case "carrilero": {
        const directions = [
          { dRow: -1, dCol: 0 },
          { dRow: 1, dCol: 0 },
          { dRow: 0, dCol: -1 },
          { dRow: 0, dCol: 1 },
        ];
        for (const { dRow, dCol } of directions) {
          for (let step = 1; step <= 2; step += 1) {
            const candidate = {
              row: position.row + dRow * step,
              col: position.col + dCol * step,
            };
            if (!isInsideBoard(candidate)) break;
            pushIfLegal(candidate);
          }
        }
        break;
      }
      case "mediocampista":
      case "delantero": {
        const directions =
          piece.type === "mediocampista"
            ? [
                { dRow: 1, dCol: 1 },
                { dRow: 1, dCol: -1 },
                { dRow: -1, dCol: 1 },
                { dRow: -1, dCol: -1 },
              ]
            : [
                { dRow: 1, dCol: 0 },
                { dRow: -1, dCol: 0 },
                { dRow: 0, dCol: 1 },
                { dRow: 0, dCol: -1 },
                { dRow: 1, dCol: 1 },
                { dRow: 1, dCol: -1 },
                { dRow: -1, dCol: 1 },
                { dRow: -1, dCol: -1 },
              ];

        for (const { dRow, dCol } of directions) {
          let step = 1;
          while (true) {
            const candidate = {
              row: position.row + dRow * step,
              col: position.col + dCol * step,
            };
            if (!isInsideBoard(candidate)) break;
            pushIfLegal(candidate);
            const cell = state.board[candidate.row]?.[candidate.col];
            if (cell) {
              break;
            }
            step += 1;
          }
        }
        break;
      }
      default:
        break;
    }

    return candidates;
  }

  static hasAnyLegalMove(state: GameState, player: PlayerId): boolean {
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        const piece = state.board[row][col];
        if (piece?.owner !== player) continue;
        const moves = this.getLegalMovesForPiece(state, { row, col });
        if (moves.length > 0) {
          return true;
        }
      }
    }

    return false;
  }

  static getLegalMoves(state: GameState, player: PlayerId): Move[] {
    const moves: Move[] = [];
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        const piece = state.board[row][col];
        if (!piece || piece.owner !== player) {
          continue;
        }
        const origin = { row, col };
        const destinations = this.getLegalMovesForPiece(state, origin);
        for (const to of destinations) {
          moves.push({
            player,
            from: origin,
            to,
          });
        }
      }
    }

    return moves;
  }
}

