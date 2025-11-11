import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
}

if (!supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable");
}

type SupabaseCookieOptions = {
  domain?: string;
  path?: string;
  maxAge?: number;
  expires?: string | Date;
  sameSite?: "lax" | "strict" | "none";
  secure?: boolean;
  httpOnly?: boolean;
};

const normalizeOptions = (
  options?: SupabaseCookieOptions,
): Partial<ResponseCookie> | undefined => {
  if (!options) {
    return undefined;
  }

  const { expires, ...rest } = options;
  const normalized: Partial<ResponseCookie> = {
    ...rest,
  };

  if (typeof expires === "string") {
    normalized.expires = new Date(expires);
  } else if (expires instanceof Date) {
    normalized.expires = expires;
  }

  return normalized;
};

const withCookies = (response?: NextResponse) =>
  createServerClient<Database, "public">(supabaseUrl, supabaseAnonKey, {
    cookies: {
      async getAll() {
        try {
          const store = cookies();
          return store.getAll().map(({ name, value }) => ({ name, value }));
        } catch (error) {
          console.error("[supabaseServer:getAll:error]", error);
          return [];
        }
      },
      async setAll(cookiesToSet) {
        if (!response) {
          console.warn(
            "[supabaseServer:setAll] skipped (read-only request context)",
          );
          return;
        }

        cookiesToSet.forEach(({ name, value, options }) => {
          const normalized = normalizeOptions(options);
          if (!value) {
            response.cookies.set(name, "", {
              ...(normalized ?? {}),
              maxAge: 0,
            });
          } else {
            response.cookies.set(name, value, normalized);
          }
        });
      },
    },
  });

export const createServerSupabaseClient = () => withCookies();

export const createRouteSupabaseClient = (response?: NextResponse) =>
  withCookies(response);

export const createServerActionSupabaseClient = () => withCookies();

