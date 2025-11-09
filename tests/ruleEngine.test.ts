import { describe, expect, it } from "vitest";

import {
  RuleEngine,
  type GameState,
  type Move,
} from "@/lib/ruleEngine";

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

  it("increments score and resets board after a goal", () => {
    const initialState = RuleEngine.createInitialState();

    // fabricate state where player home can score immediately
    const goalState: GameState = {
      ...initialState,
      board: initialState.board.map((row) => row.map((cell) => null)),
      turn: "home",
      history: [],
    };
    // place a delantero at (1,3) so it can move to goal row 0
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
    expect(outcome.nextState.board).toEqual(RuleEngine.createInitialState().board);
  });
});

