import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type VerifyOTPPayload = {
  email?: unknown;
  token?: unknown;
  redirectTo?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | VerifyOTPPayload
    | null;

  console.log("[verify-otp] incoming body", { email: body?.email, hasToken: !!body?.token });

  const requestUrl = new URL(request.url);

  const email = body?.email;
  const token = body?.token;
  const redirectTo = typeof body?.redirectTo === "string" ? body.redirectTo : undefined;

  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json(
      { error: "Correo inválido" },
      { status: 400 },
    );
  }

  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json(
      { error: "Código inválido" },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[verify-otp] Missing Supabase credentials");
    return NextResponse.json(
      { error: "Error de configuración del servidor" },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  console.log("[verify-otp] verifying OTP for", email);

  // Verify OTP code
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    console.error("[verify-otp] verifyOtp error", error);
    return NextResponse.json(
      { error: error.message ?? "Código inválido o expirado" },
      { status: 401 },
    );
  }

  if (!data.session) {
    console.error("[verify-otp] No session after OTP verification");
    return NextResponse.json(
      { error: "No se pudo crear la sesión" },
      { status: 500 },
    );
  }

  console.log("[verify-otp] OTP verified successfully", {
    email,
    userId: data.session.user.id,
  });

  // Generate action link for the session to redirect properly
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${requestUrl.protocol}//${requestUrl.host}`;

  const callbackUrl = redirectTo
    ? `${siteUrl}/auth/callback?next=${encodeURIComponent(redirectTo)}`
    : `${siteUrl}/auth/callback`;

  // Create a redirect URL with tokens in hash (as expected by callback page)
  // The callback page will extract these tokens and establish the session
  const actionLink = `${callbackUrl}#access_token=${encodeURIComponent(data.session.access_token)}&refresh_token=${encodeURIComponent(data.session.refresh_token)}&type=email`;

  console.log("[verify-otp] OTP verified, redirecting to", callbackUrl);

  return NextResponse.json({
    success: true,
    actionLink,
  });
}

