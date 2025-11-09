import { cookies } from "next/headers";
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

const withCookies = () => {
  const cookieStore = cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name) {
        return cookieStore.get(name)?.value;
      },
      set(name, value, options) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // noop - cookies are read-only in this context
        }
      },
      remove(name, options) {
        try {
          cookieStore.delete({ name, ...options });
        } catch {
          // noop - cookies are read-only in this context
        }
      },
    },
  });
};

export const createServerSupabaseClient = () => withCookies();

export const createRouteSupabaseClient = () => withCookies();

export const createServerActionSupabaseClient = () => withCookies();

