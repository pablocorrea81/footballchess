"use server";

import { NextResponse } from "next/server";

import { createRouteSupabaseClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Database } from "@/lib/database.types";

export async function POST(request: Request) {
  const supabase = createRouteSupabaseClient();

  try {
    const { username, avatar_url } = (await request.json()) as {
      username?: string;
      avatar_url?: string | null;
    };

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!username || username.trim().length === 0) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 },
      );
    }

    const updatePayload = {
      username: username.trim(),
      avatar_url: avatar_url ?? null,
    } as Database["public"]["Tables"]["profiles"]["Update"];

    // Use admin client to update, bypassing RLS
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("profiles") as any)
      .update(updatePayload)
      .eq("id", session.user.id);

    if (error) {
      console.error("[api/profile/update] Update error:", error);
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

