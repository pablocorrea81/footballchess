"use server";

import { NextResponse } from "next/server";

import { createRouteSupabaseClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { RuleEngine, type GameState, type PlayerId } from "@/lib/ruleEngine";
import type { Database, Json } from "@/lib/database.types";

const TURN_TIMEOUT_SECONDS = 60;

export async function POST(request: Request) {
  const supabase = createRouteSupabaseClient();

  try {
    const { gameId } = (await request.json()) as {
      gameId?: string;
    };

    if (!gameId) {
      return NextResponse.json(
        { error: "Missing gameId" },
        { status: 400 },
      );
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch current game state
    const { data: gameData, error: fetchError } = await supabaseAdmin
      .from("games")
      .select("player_1_id, player_2_id, game_state, status, turn_started_at, is_bot_game")
      .eq("id", gameId)
      .single();

    if (fetchError || !gameData) {
      return NextResponse.json(
        { error: fetchError?.message ?? "Game not found" },
        { status: 404 },
      );
    }

    const game = gameData as {
      player_1_id: string;
      player_2_id: string | null;
      game_state: unknown;
      status: string;
      turn_started_at: string | null;
      is_bot_game: boolean;
    };

    if (game.status !== "in_progress") {
      return NextResponse.json(
        { error: "Game is not in progress" },
        { status: 400 },
      );
    }

    const gameState = (game.game_state as GameState | null) ?? RuleEngine.createInitialState();
    const currentTurn = gameState.turn;
    const turnStartedAt = game.turn_started_at ? new Date(game.turn_started_at) : null;

    // Verify timeout: Check if turn_started_at is more than 60 seconds ago
    if (!turnStartedAt) {
      // No turn_started_at set, skip timeout check (shouldn't happen, but be safe)
      return NextResponse.json({ error: "No turn_started_at set" }, { status: 400 });
    }

    const now = new Date();
    const elapsedSeconds = Math.floor((now.getTime() - turnStartedAt.getTime()) / 1000);

    if (elapsedSeconds < TURN_TIMEOUT_SECONDS) {
      // Timeout hasn't been reached yet
      return NextResponse.json(
        { error: `Timeout not reached. Elapsed: ${elapsedSeconds}s, required: ${TURN_TIMEOUT_SECONDS}s` },
        { status: 400 },
      );
    }

    // Determine which player's turn it is
    const currentPlayerId = currentTurn === "home" ? game.player_1_id : game.player_2_id;
    
    // Verify that the current player is the one who timed out (security check)
    if (currentPlayerId !== session.user.id) {
      return NextResponse.json(
        { error: "You can only timeout your own turn" },
        { status: 403 },
      );
    }

    // Execute timeout: Switch turn to opponent
    const opponentTurn: PlayerId = currentTurn === "home" ? "away" : "home";
    
    console.log("[api/games/timeout] Executing timeout:", {
      gameId,
      currentTurn,
      opponentTurn,
      elapsedSeconds,
      currentPlayerId: session.user.id,
    });

    // Update game state to switch turn
    const updatedGameState: GameState = {
      ...gameState,
      turn: opponentTurn,
    };

    // Update game in database
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabaseAdmin.from("games") as any)
      .update({
        game_state: updatedGameState as unknown as Json,
        turn_started_at: new Date().toISOString(), // Update to now for opponent's turn
      })
      .eq("id", gameId)
      .eq("status", "in_progress");

    if (updateError) {
      console.error("[api/games/timeout] Update error:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 },
      );
    }

    console.log("[api/games/timeout] Timeout executed successfully");

    return NextResponse.json({ 
      ok: true,
      newTurn: opponentTurn,
      elapsedSeconds,
    });
  } catch (error) {
    console.error("[api/games/timeout] Exception:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

