import { describe, expect, it } from "vitest";

import {
  RuleEngine,
  type GameState,
  type Move,
  BOARD_ROWS,
  BOARD_COLS,
} from "@/lib/ruleEngine";

const createEmptyBoard = () =>
  Array.from({ length: BOARD_ROWS }, () =>
    Array.from({ length: BOARD_COLS }, () => null),
  );

describe("RuleEngine", () => {
  it("creates initial state with correct defaults", () => {
    const state = RuleEngine.createInitialState();

    expect(state.turn).toBe("home");
    expect(state.score).toEqual({ home: 0, away: 0 });
    expect(state.history).toEqual([]);
    expect(state.board[10][0]?.type).toBe("carrilero");
    expect(state.board[1][0]?.owner).toBe("away");
  });

  it("validates and applies a legal carrilero move", () => {
    let state = RuleEngine.createInitialState();

    const move: Move = {
      player: "home",
      from: { row: 10, col: 0 },
      to: { row: 8, col: 0 },
    };

    const validation = RuleEngine.validateMove(state, move);
    expect(validation.valid).toBe(true);

    const outcome = RuleEngine.applyMove(state, move);
    state = outcome.nextState;

    expect(state.board[8][0]).not.toBeNull();
    expect(state.board[10][0]).toBeNull();
    expect(state.turn).toBe("away");
    expect(state.history).toHaveLength(1);
  });

  it("rejects move when not the player's turn", () => {
    const state = RuleEngine.createInitialState();

    const awayMove: Move = {
      player: "away",
      from: { row: 1, col: 0 },
      to: { row: 3, col: 0 },
    };

    const validation = RuleEngine.validateMove(state, awayMove);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain("No es tu turno");
  });

  it("prevents defender from scoring in opponent goal", () => {
    const initialState = RuleEngine.createInitialState();
    const customState: GameState = {
      ...initialState,
      board: createEmptyBoard(),
      turn: "home",
      history: [],
    };

    customState.board[1][2] = {
      id: "home-defensa",
      owner: "home",
      type: "defensa",
      canScore: false,
    };

    const move: Move = {
      player: "home",
      from: { row: 1, col: 2 },
      to: { row: 0, col: 2 },
    };

    const validation = RuleEngine.validateMove(customState, move);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain(
      "Los defensas no pueden marcar goles",
    );
  });

  it("captures opponent piece and records history", () => {
    const initialState = RuleEngine.createInitialState();
    const customState: GameState = {
      ...initialState,
      board: createEmptyBoard(),
      turn: "home",
      history: [],
    };

    customState.board[6][3] = {
      id: "home-delantero-1",
      owner: "home",
      type: "delantero",
      canScore: true,
    };
    customState.board[4][3] = {
      id: "away-defensa-1",
      owner: "away",
      type: "defensa",
      canScore: false,
    };

    const move: Move = {
      player: "home",
      from: { row: 6, col: 3 },
      to: { row: 4, col: 3 },
    };

    const validation = RuleEngine.validateMove(customState, move);
    expect(validation.valid).toBe(true);

    const outcome = RuleEngine.applyMove(customState, move);
    expect(outcome.capture?.id).toBe("away-defensa-1");
    expect(outcome.nextState.board[4][3]?.owner).toBe("home");
    expect(outcome.nextState.history.at(-1)?.capturedPieceId).toBe(
      "away-defensa-1",
    );
  });

  it("increments score and resets board after a goal", () => {
    const initialState = RuleEngine.createInitialState();

    const goalState: GameState = {
      ...initialState,
      board: createEmptyBoard(),
      turn: "home",
      history: [],
    };
    goalState.board[1][3] = {
      id: "home-delantero-goal",
      owner: "home",
      type: "delantero",
      canScore: true,
    };

    const move: Move = {
      player: "home",
      from: { row: 1, col: 3 },
      to: { row: 0, col: 3 },
    };

    const validation = RuleEngine.validateMove(goalState, move);
    expect(validation.valid).toBe(true);
    expect(validation.goal).toBe(true);

    const outcome = RuleEngine.applyMove(goalState, move);

    expect(outcome.nextState.score.home).toBe(1);
    expect(outcome.nextState.turn).toBe("away");
    expect(outcome.goal?.scoringPlayer).toBe("home");

    const resetState = RuleEngine.createInitialState();
    expect(outcome.nextState.board).toEqual(resetState.board);
  });
});

