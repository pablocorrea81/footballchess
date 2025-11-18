import { NextResponse } from "next/server";

import { createRouteSupabaseClient } from "@/lib/supabaseServer";
import { getPlayerTrophies, getPlayerTrophyStats } from "@/lib/trophies/trophyHelpers";

export async function GET(request: Request) {
  const supabase = createRouteSupabaseClient();

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const playerId = session.user.id;

    // Get query params
    const { searchParams } = new URL(request.url);
    const statsOnly = searchParams.get("stats") === "true";

    if (statsOnly) {
      // Return only statistics
      const stats = await getPlayerTrophyStats(playerId);
      return NextResponse.json(stats);
    }

    // Return full trophy list
    const trophies = await getPlayerTrophies(playerId);
    return NextResponse.json({ trophies });
  } catch (error) {
    console.error("[api/trophies] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

