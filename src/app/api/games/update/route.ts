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

    const { error } = await supabase
      .from("games")
      .update(updatePayload)
      .eq("id", gameId)
      .neq("status", "finished");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (game.is_bot_game) {
      await executeBotTurnIfNeeded(gameId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

