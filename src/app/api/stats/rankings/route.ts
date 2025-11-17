"use server";

import { NextResponse } from "next/server";
import { createRouteSupabaseClient } from "@/lib/supabaseServer";
import { getGlobalRankings, getHardBotRankings, getProBotRankings } from "@/lib/stats/statsHelpers";

export async function GET(request: Request) {
  try {
    const supabase = createRouteSupabaseClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "global"; // "global", "hard-bot", or "pro-bot"
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    let rankings;
    if (type === "hard-bot") {
      rankings = await getHardBotRankings(limit);
    } else if (type === "pro-bot") {
      rankings = await getProBotRankings(limit);
    } else {
      rankings = await getGlobalRankings(limit);
    }

    return NextResponse.json({ ok: true, rankings, type });
  } catch (error) {
    console.error("[api/stats/rankings] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

