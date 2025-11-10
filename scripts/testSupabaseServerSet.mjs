import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  throw new Error("Missing Supabase env vars");
}

const email = `test-${Date.now()}@example.com`;
const password = "Test1234!";

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const { error: createError } = await adminClient.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (createError) {
  throw createError;
}

const client = createServerClient(supabaseUrl, supabaseAnonKey, {
  cookies: {
    get(name) {
      console.log("[test:get]", name);
      return undefined;
    },
    set(name, value, options) {
      console.log("[test:set]", name, Boolean(value), options ?? {});
    },
    remove(name, options) {
      console.log("[test:remove]", name, options ?? {});
    },
  },
});

const { data, error } = await client.auth.signInWithPassword({
  email,
  password,
});

console.log("signIn error?", error?.message ?? "none");
console.log("session tokens?", Boolean(data.session?.access_token));
