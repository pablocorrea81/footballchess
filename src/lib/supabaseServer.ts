import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
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
): SupabaseCookieOptions | undefined => {
  if (!options) {
    return undefined;
  }

  const normalized: SupabaseCookieOptions = {
    ...options,
  };

  if (typeof normalized.expires === "string") {
    normalized.expires = new Date(normalized.expires);
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
        return store?.get(name)?.value;
      },
      set(name, value, options) {
        try {
          if (response) {
            response.cookies.set(name, value, normalizeOptions(options));
          } else {
            const store = readCookieStore();
            store?.set({ name, value, ...options });
          }
        } catch {
          // noop - cookies are read-only in some contexts
        }
      },
      remove(name, options) {
        try {
          if (response) {
            response.cookies.set(name, "", {
              ...(normalizeOptions(options) ?? {}),
              maxAge: 0,
            });
          } else {
            const store = readCookieStore();
            store?.delete({ name, ...options });
          }
        } catch {
          // noop - cookies are read-only in some contexts
        }
      },
    },
  });

export const createServerSupabaseClient = () => withCookies();

export const createRouteSupabaseClient = (response?: NextResponse) =>
  withCookies(response);

export const createServerActionSupabaseClient = () => withCookies();

