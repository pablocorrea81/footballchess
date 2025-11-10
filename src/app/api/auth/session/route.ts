"use server";

import { NextResponse } from "next/server";

import { createRouteSupabaseClient } from "@/lib/supabaseServer";

type SessionPayload = {
  accessToken?: unknown;
  refreshToken?: unknown;
};

export async function POST(request: Request) {
  const { accessToken, refreshToken } = (await request.json().catch(() => ({}))) as SessionPayload;

  if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
    return NextResponse.json({ error: "Missing tokens" }, { status: 400 });
  }

  const carrier = NextResponse.next();
  const supabase = createRouteSupabaseClient(carrier);

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  const response = NextResponse.json({
    success: true,
    session: data.session,
  });

  const cookiesToSet = carrier.cookies.getAll();
  cookiesToSet.forEach((cookie) => {
    const { name, value, ...options } = cookie;
    response.cookies.set(name, value, options);
  });

  return response;
}
