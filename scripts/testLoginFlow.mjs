import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRole) {
  throw new Error("Missing Supabase environment variables.");
}

const adminClient = createClient(supabaseUrl, supabaseServiceRole, {
  auth: {
    persistSession: false,
  },
});

const publicClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  },
});

const email = `test-login-${randomUUID()}@example.com`;
const password = "Test1234!";

console.log("Creating test user:", email);

const { error: createError } = await adminClient.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (createError) {
  throw new Error(`Failed to create user: ${createError.message}`);
}

console.log("Signing in with password to obtain session tokens...");

const { data: signInData, error: signInError } = await publicClient.auth.signInWithPassword({
  email,
  password,
});

if (signInError || !signInData.session) {
  throw new Error(`Failed to sign in: ${signInError?.message ?? "Unknown error"}`);
}

const { access_token: accessToken, refresh_token: refreshToken } = signInData.session;

console.log("Posting tokens to /api/auth/session ...");

const sessionResponse = await fetch("https://footballchess.club/api/auth/session", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ accessToken, refreshToken }),
});

console.log("Session response status:", sessionResponse.status);

if (!sessionResponse.ok) {
  const payload = await sessionResponse.json().catch(() => ({}));
  console.error("Session response payload:", payload);
  throw new Error("Setting session failed");
}

const sessionPayload = await sessionResponse.json();
console.log("Session payload debug:", sessionPayload.debug);

const rawHeaders = sessionResponse.headers.raw?.() ?? {};
const setCookieHeaders =
  sessionResponse.headers.getSetCookie?.() ??
  rawHeaders["set-cookie"] ??
  Object.entries(rawHeaders)
    .filter(([key]) => key.toLowerCase() === "set-cookie")
    .flatMap(([, value]) => value);

if (!setCookieHeaders || setCookieHeaders.length === 0) {
  throw new Error("No Set-Cookie headers were returned by the session endpoint.");
}

console.log("Cookies set:", setCookieHeaders.map((cookie) => cookie.split(";")[0]).join("; "));
console.log("Raw Set-Cookie headers:", setCookieHeaders);

const cookieHeader = setCookieHeaders
  .map((cookie) => cookie.split(";")[0])
  .join("; ");

console.log("Fetching /lobby with established cookies...");

const lobbyResponse = await fetch("https://footballchess.club/lobby", {
  headers: {
    cookie: cookieHeader,
  },
  redirect: "manual",
});

console.log("Lobby response status:", lobbyResponse.status);
console.log("Lobby response location:", lobbyResponse.headers.get("location") ?? "<none>");

if (lobbyResponse.status === 302) {
  throw new Error("Lobby redirected, session may not be recognized.");
}

if (!lobbyResponse.ok) {
  throw new Error(`Lobby fetch failed with status ${lobbyResponse.status}`);
}

console.log("Login flow test succeeded.");

