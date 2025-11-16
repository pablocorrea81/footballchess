"use server";

import { NextResponse } from "next/server";

import { createRouteSupabaseClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Database, Json } from "@/lib/database.types";

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

    const { data: gameData, error: fetchError } = await supabaseAdmin
      .from("games")
      .select("player_1_id, player_2_id, status, is_bot_game")
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
      status: string;
      is_bot_game: boolean;
    };

    if (game.status !== "in_progress") {
      return NextResponse.json(
        { error: "Game is not in progress" },
        { status: 400 },
      );
    }

    const userId = session.user.id;
    const isParticipant =
      game.player_1_id === userId ||
      (game.player_2_id !== null && game.player_2_id === userId);

    if (!isParticipant) {
      return NextResponse.json(
        { error: "You are not a participant in this game" },
        { status: 403 },
      );
    }

    // Determine winner: the opponent
    let winnerId: string | null = null;
    if (game.is_bot_game) {
      // For bot games, if the player surrenders, the bot wins
      // Since the bot doesn't have a userId, we set winner_id to null
      // The UI will detect that it's a bot game and show the bot as the winner
      // based on bot_player and the fact that the human player surrendered
      winnerId = null;
    } else {
      // For multiplayer games, determine the winner based on who surrendered
      if (game.player_1_id === userId) {
        // Current player is player_1, winner is player_2
        winnerId = game.player_2_id;
      } else if (game.player_2_id === userId) {
        // Current player is player_2, winner is player_1
        winnerId = game.player_1_id;
      }
    }

    console.log("[api/games/surrender] Surrendering game:", {
      gameId,
      userId,
      winnerId,
      isBotGame: game.is_bot_game,
    });

    // Update game: set status to finished, winner_id, and finished_at
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabaseAdmin.from("games") as any)
      .update({
        status: "finished",
        winner_id: winnerId,
        finished_at: new Date().toISOString(),
      })
      .eq("id", gameId)
      .eq("status", "in_progress");

    if (updateError) {
      console.error("[api/games/surrender] Update error:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 },
      );
    }

    console.log("[api/games/surrender] Surrender executed successfully");

    return NextResponse.json({
      ok: true,
      winnerId,
    });
  } catch (error) {
    console.error("[api/games/surrender] Exception:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

