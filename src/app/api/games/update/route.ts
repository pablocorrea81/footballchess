"use server";

import { NextResponse } from "next/server";

import { createRouteSupabaseClient } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  const supabase = createRouteSupabaseClient();

  try {
    const { gameId, update } = await request.json();

    if (!gameId || typeof update !== "object") {
      return NextResponse.json(
        { error: "Missing gameId or update payload" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("games")
      .update(update)
      .eq("id", gameId)
      .neq("status", "finished");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

