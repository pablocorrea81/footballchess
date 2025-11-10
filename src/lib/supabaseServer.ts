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
      get(name) {
        try {
          const store = cookies();
          const getter = (store as { get?: (key: string) => { value: string } | undefined }).get;
          const value = getter ? getter.call(store, name)?.value : undefined;
          console.log("[supabaseServer:get]", name, value ? "found" : "missing");
          return value;
        } catch (error) {
          console.error("[supabaseServer:get:error]", name, error);
          return undefined;
        }
      },
      set(name, value, options) {
        try {
          if (response) {
            console.log("[supabaseServer:set]", name, "via response", options);
            response.cookies.set(name, value, normalizeOptions(options));
          } else {
            console.warn(
              "[supabaseServer:set]", name, "skipped (read-only request context)",
            );
          }
        } catch (error) {
          console.error("[supabaseServer:set:error]", name, error);
        }
      },
      remove(name, options) {
        try {
          if (response) {
            console.log("[supabaseServer:remove]", name, "via response", options);
            response.cookies.set(name, "", {
              ...(normalizeOptions(options) ?? {}),
              maxAge: 0,
            });
          } else {
            console.warn(
              "[supabaseServer:remove]", name, "skipped (read-only request context)",
            );
          }
        } catch (error) {
          console.error("[supabaseServer:remove:error]", name, error);
        }
      },
    },
  });

export const createServerSupabaseClient = () => withCookies();

export const createRouteSupabaseClient = (response?: NextResponse) =>
  withCookies(response);

export const createServerActionSupabaseClient = () => withCookies();

