import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SendOTPPayload = {
  email?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | SendOTPPayload
    | null;

  console.log("[send-otp] incoming body", body);

  const email = body?.email;

  if (typeof email !== "string" || !email.includes("@")) {
    console.warn("[send-otp] invalid email", email);
    return NextResponse.json(
      { error: "Correo inválido" },
      { status: 400 },
    );
  }

  // Use Supabase client to send OTP
  // This requires the anon key, not admin
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[send-otp] Missing Supabase credentials");
    return NextResponse.json(
      { error: "Error de configuración del servidor" },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  console.log("[send-otp] sending OTP to", email);

  // Send OTP code (6-digit) to email
  // Using shouldCreateUser: true to allow new users to sign up
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Don't set emailRedirectTo to ensure we get an OTP code, not a magic link
      shouldCreateUser: true, // Allow new users to sign up
    },
  });

  if (error) {
    console.error("[send-otp] signInWithOtp error", error);
    return NextResponse.json(
      { error: error.message ?? "No se pudo enviar el código" },
      { status: 500 },
    );
  }

  console.log("[send-otp] OTP sent successfully", {
    email,
  });

  return NextResponse.json({
    success: true,
    message: "Código enviado a tu correo. Revisa tu bandeja de entrada.",
  });
}

