import { NextResponse } from "next/server";

import { createRouteSupabaseClient } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  const { accessToken, refreshToken } = (await request.json().catch(() => ({}))) as {
    accessToken?: unknown;
    refreshToken?: unknown;
  };

  if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
    return NextResponse.json(
      { error: "Missing tokens" },
      { status: 400 },
    );
  }

  const cookieCarrier = NextResponse.next();
  const supabase = createRouteSupabaseClient(cookieCarrier);

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 401 },
    );
  }

  const cookiesToSet = cookieCarrier.cookies.getAll();
  const response = NextResponse.json({
    success: true,
    session: data.session,
  });

  cookiesToSet.forEach((cookie) => {
    response.cookies.set({
      ...cookie,
    });
  });

  return response;
}



