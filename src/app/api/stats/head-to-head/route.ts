"use server";

import { NextResponse } from "next/server";
import { createRouteSupabaseClient } from "@/lib/supabaseServer";
import { getHeadToHeadStats } from "@/lib/stats/statsHelpers";

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
    const player1Id = searchParams.get("player1");
    const player2Id = searchParams.get("player2");

    if (!player1Id || !player2Id) {
      return NextResponse.json(
        { error: "Missing player1 or player2 parameter" },
        { status: 400 },
      );
    }

    const stats = await getHeadToHeadStats(player1Id, player2Id);

    if (!stats) {
      return NextResponse.json({ error: "Players not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    console.error("[api/stats/head-to-head] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

