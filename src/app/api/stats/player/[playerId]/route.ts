"use server";

import { NextResponse } from "next/server";
import { createRouteSupabaseClient } from "@/lib/supabaseServer";
import { getPlayerStats } from "@/lib/stats/statsHelpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ playerId: string }> | { playerId: string } },
) {
  try {
    const supabase = createRouteSupabaseClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = params instanceof Promise ? await params : params;
    const { playerId } = resolvedParams;

    if (!playerId) {
      return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
    }

    const stats = await getPlayerStats(playerId);

    if (!stats) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    console.error("[api/stats/player] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

