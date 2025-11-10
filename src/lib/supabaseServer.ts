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

type CookieStore = {
  get: (name: string) => { value: string } | undefined;
  set: (options: Record<string, unknown>) => void;
  delete: (options: Record<string, unknown>) => void;
};

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

const readCookieStore = (): CookieStore | null => {
  const store = cookies() as unknown;

  if (
    store &&
    typeof (store as { get?: unknown }).get === "function" &&
    typeof (store as { set?: unknown }).set === "function" &&
    typeof (store as { delete?: unknown }).delete === "function"
  ) {
    return store as CookieStore;
  }

  return null;
};

const withCookies = (response?: NextResponse) =>
  createServerClient<Database, "public">(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name) {
        const store = readCookieStore();
        const value = store?.get(name)?.value;
        console.log("[supabaseServer:get]", name, value ? "found" : "missing");
        return value;
      },
      set(name, value, options) {
        try {
          if (response) {
            console.log("[supabaseServer:set]", name, "via response", options);
            response.cookies.set(name, value, normalizeOptions(options));
          } else {
            console.log("[supabaseServer:set]", name, "directly", options);
            const store = readCookieStore();
            store?.set({ name, value, ...options });
          }
        } catch (error) {
          console.error("[supabaseServer:set:error]", error);
          // noop - cookies are read-only in some contexts
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
            console.log("[supabaseServer:remove]", name, "directly", options);
            const store = readCookieStore();
            store?.delete({ name, ...options });
          }
        } catch (error) {
          console.error("[supabaseServer:remove:error]", error);
          // noop - cookies are read-only in some contexts
        }
      },
    },
  });

export const createServerSupabaseClient = () => withCookies();

export const createRouteSupabaseClient = (response?: NextResponse) =>
  withCookies(response);

export const createServerActionSupabaseClient = () => withCookies();

