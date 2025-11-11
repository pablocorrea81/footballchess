"use server";

import { NextResponse } from "next/server";

import { createRouteSupabaseClient } from "@/lib/supabaseServer";

type SessionPayload = {
  accessToken?: unknown;
  refreshToken?: unknown;
};

type SerializedCookie = {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  expires?: Date;
  maxAge?: number;
  sameSite?: "lax" | "strict" | "none";
  secure?: boolean;
  httpOnly?: boolean;
  priority?: "low" | "medium" | "high";
  partitioned?: boolean;
};

const serializeCookie = (cookie: SerializedCookie): string => {
  const parts: string[] = [`${cookie.name}=${cookie.value}`];

  if (cookie.path) {
    parts.push(`Path=${cookie.path}`);
  }

  if (cookie.domain) {
    parts.push(`Domain=${cookie.domain}`);
  }

  if (typeof cookie.maxAge === "number") {
    parts.push(`Max-Age=${cookie.maxAge}`);
  }

  if (cookie.expires instanceof Date && !Number.isNaN(cookie.expires.valueOf())) {
    parts.push(`Expires=${cookie.expires.toUTCString()}`);
  }

  if (cookie.sameSite) {
    const sameSiteValue =
      cookie.sameSite === "none"
        ? "None"
        : cookie.sameSite === "strict"
          ? "Strict"
          : "Lax";
    parts.push(`SameSite=${sameSiteValue}`);
  }

  if (cookie.secure) {
    parts.push("Secure");
  }

  if (cookie.httpOnly) {
    parts.push("HttpOnly");
  }

  if (cookie.priority) {
    const priorityValue =
      cookie.priority === "low"
        ? "Low"
        : cookie.priority === "high"
          ? "High"
          : "Medium";
    parts.push(`Priority=${priorityValue}`);
  }

  if (cookie.partitioned) {
    parts.push("Partitioned");
  }

  return parts.join("; ");
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

  const debugCookies =
    process.env.NODE_ENV !== "production"
      ? cookiesToSet.map((cookie) => ({
          name: cookie.name,
          valueLength: cookie.value.length,
          hasDomain: Boolean(cookie.domain),
          hasHttpOnly: Boolean(cookie.httpOnly),
          hasSecure: Boolean(cookie.secure),
          sameSite: cookie.sameSite ?? null,
        }))
      : undefined;

  const response = NextResponse.json({
    success: true,
    session: data.session,
    debug: debugCookies,
  });

  const cookiesToSet = carrier.cookies.getAll();
  cookiesToSet.forEach((cookie) => {
    response.headers.append("Set-Cookie", serializeCookie(cookie));
  });

  return response;
}
