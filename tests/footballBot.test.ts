import { describe, expect, it } from "vitest";

import { RuleEngine, type GameState, type PlayerId } from "@/lib/ruleEngine";
import { pickBotMove } from "@/lib/ai/footballBot";

const applyBotMove = (state: GameState, player: PlayerId): GameState => {
  const move = pickBotMove(state, player, "hard");
  expect(move).toBeTruthy();
  const validation = RuleEngine.validateMove(
    { ...state, turn: player },
    move!,
    { skipTurnCheck: true },
  );
  expect(validation.valid).toBe(true);
  const outcome = RuleEngine.applyMove(
    { ...state, turn: player },
    move!,
  );
  return outcome.nextState;
};

describe("FootballBot AI", () => {
  it("produces a legal move from the starting position", () => {
    const initialState = RuleEngine.createInitialState();
    const move = pickBotMove(initialState, "away");
    expect(move).toBeTruthy();
    if (!move) {
      return;
    }
    const validation = RuleEngine.validateMove(
      { ...initialState, turn: "away" },
      move,
      { skipTurnCheck: true },
    );
    expect(validation.valid).toBe(true);
  });

  it("can chain multiple moves without errors", () => {
    let state = RuleEngine.createInitialState();
    state = applyBotMove(state, "away");
    state = applyBotMove(state, "home");
    state = applyBotMove(state, "away");
    expect(state.history.length).toBeGreaterThanOrEqual(3);
  });
});


