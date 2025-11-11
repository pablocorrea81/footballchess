"use server";

import { NextResponse } from "next/server";

import { createRouteSupabaseClient } from "@/lib/supabaseServer";

const DEFAULT_REDIRECT_PATH = "/lobby";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const redirectPath = url.searchParams.get("next") ?? DEFAULT_REDIRECT_PATH;

  if (!code) {
    const missingCodeUrl = new URL("/login?error=missing_code", url.origin);
    return NextResponse.redirect(missingCodeUrl);
  }

  const carrier = NextResponse.next();
  const supabase = createRouteSupabaseClient(carrier);

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const errorUrl = new URL(
      `/login?error=${encodeURIComponent(error.message)}`,
      url.origin,
    );
    return NextResponse.redirect(errorUrl);
  }

  const response = NextResponse.redirect(new URL(redirectPath, url.origin));

  carrier.cookies.getAll().forEach(({ name, value, ...options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}

