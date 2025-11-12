"use server";

import { NextResponse } from "next/server";

import { createRouteSupabaseClient } from "@/lib/supabaseServer";
import { executeBotTurnIfNeeded } from "@/lib/ai/footballBot";
import type { Database } from "@/lib/database.types";

export async function POST(request: Request) {
  const supabase = createRouteSupabaseClient();

  try {
    const { gameId, update } = (await request.json()) as {
      gameId?: string;
      update?: Record<string, unknown>;
    };

    if (!gameId || typeof update !== "object") {
      return NextResponse.json(
        { error: "Missing gameId or update payload" },
        { status: 400 },
      );
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: game, error: fetchError } = await supabase
      .from("games")
      .select("player_1_id, player_2_id, is_bot_game, status")
      .eq("id", gameId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 404 });
    }

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const userId = session.user.id;
    const isParticipant =
      game.player_1_id === userId ||
      (game.player_2_id !== null && game.player_2_id === userId);

    if (!isParticipant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updatePayload =
      update as Database["public"]["Tables"]["games"]["Update"];

    console.log("[api/games/update] Updating game:", gameId, "payload:", JSON.stringify(updatePayload));

    const { error, data: updateResult } = await supabase
      .from("games")
      .update(updatePayload)
      .eq("id", gameId)
      .neq("status", "finished")
      .select();

    if (error) {
      console.error("[api/games/update] Update error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.log("[api/games/update] Update successful:", JSON.stringify(updateResult?.[0], null, 2));

    // Only execute bot turn if this is a bot game and the update was successful
    if (game.is_bot_game) {
      console.log("[api/games/update] Bot game detected, preparing to execute bot turn for game:", gameId);
      if (updateResult && updateResult[0]) {
        const updatedGame = updateResult[0] as Database["public"]["Tables"]["games"]["Row"];
        console.log("[api/games/update] Updated game state turn:", (updatedGame.game_state as unknown as { turn?: string })?.turn);
      }
      
      // Increased delay to ensure the database update is fully committed and visible
      // This helps prevent race conditions where the bot reads stale data
      console.log("[api/games/update] Waiting 500ms before executing bot turn...");
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      try {
        console.log("[api/games/update] Executing bot turn for game:", gameId);
        await executeBotTurnIfNeeded(gameId);
        console.log("[api/games/update] Bot turn execution completed successfully");
      } catch (botError) {
        console.error("[api/games/update] Bot turn error:", botError);
        if (botError instanceof Error) {
          console.error("[api/games/update] Bot error message:", botError.message);
          console.error("[api/games/update] Bot error stack:", botError.stack);
        } else {
          console.error("[api/games/update] Bot error (non-Error):", JSON.stringify(botError, null, 2));
        }
        // Don't fail the request if bot turn fails
      }
    } else {
      console.log("[api/games/update] Not a bot game, skipping bot turn execution");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

