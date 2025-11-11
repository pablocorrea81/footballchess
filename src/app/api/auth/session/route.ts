"use server";

import { NextResponse } from "next/server";
import { createRouteSupabaseClient } from "@/lib/supabaseServer";

type SessionPayload = {
  accessToken?: unknown;
  refreshToken?: unknown;
};

type SerializableCookie = {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: number | string | Date;
  sameSite?: "lax" | "strict" | "none";
  secure?: boolean;
  httpOnly?: boolean;
  priority?: "low" | "medium" | "high";
  partitioned?: boolean;
};

const serializeCookie = (cookie: SerializableCookie): string => {
  const {
    name,
    value,
    path,
    domain,
    maxAge,
    expires,
    sameSite,
    secure,
    httpOnly,
    priority,
    partitioned,
  } = cookie;

  const parts: string[] = [`${name}=${value}`];

  if (path) {
    parts.push(`Path=${path}`);
  }

  if (domain) {
    parts.push(`Domain=${domain}`);
  }

  if (typeof maxAge === "number") {
    parts.push(`Max-Age=${maxAge}`);
  }

  if (expires !== undefined) {
    const normalized =
      typeof expires === "number"
        ? new Date(expires)
        : expires instanceof Date
          ? expires
          : new Date(expires);

    if (!Number.isNaN(normalized.valueOf())) {
      parts.push(`Expires=${normalized.toUTCString()}`);
    }
  }

  if (sameSite) {
    const sameSiteValue =
      sameSite === "none"
        ? "None"
        : sameSite === "strict"
          ? "Strict"
          : "Lax";
    parts.push(`SameSite=${sameSiteValue}`);
  }

  if (secure) {
    parts.push("Secure");
  }

  if (httpOnly) {
    parts.push("HttpOnly");
  }

  if (priority) {
    const priorityValue =
      priority === "low"
        ? "Low"
        : priority === "high"
          ? "High"
          : "Medium";
    parts.push(`Priority=${priorityValue}`);
  }

  if (partitioned) {
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

  const cookiesToSet = carrier.cookies.getAll();

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

  cookiesToSet.forEach((cookie) => {
    const serializable: SerializableCookie = {
      name: cookie.name,
      value: cookie.value,
      path: cookie.path,
      domain: cookie.domain,
      maxAge:
        typeof cookie.maxAge === "number"
          ? cookie.maxAge
          : typeof cookie.maxAge === "string"
            ? Number.parseInt(cookie.maxAge, 10)
            : undefined,
      expires: cookie.expires,
      sameSite:
        typeof cookie.sameSite === "string" ? cookie.sameSite : undefined,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      priority:
        typeof cookie.priority === "string" ? cookie.priority : undefined,
      partitioned: cookie.partitioned,
    };

    response.headers.append("Set-Cookie", serializeCookie(serializable));
  });

  return response;
}
