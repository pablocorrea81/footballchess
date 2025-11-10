import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ACCESS_CODE =
  process.env.DIRECT_LOGIN_ACCESS_CODE ?? "DonBosco2013";

type DirectLoginPayload = {
  email?: unknown;
  accessCode?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | DirectLoginPayload
    | null;

  const email = body?.email;
  const accessCode = body?.accessCode;

  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json(
      { error: "Correo inválido" },
      { status: 400 },
    );
  }

  if (typeof accessCode !== "string" || accessCode !== ACCESS_CODE) {
    return NextResponse.json(
      { error: "Código de acceso incorrecto" },
      { status: 401 },
    );
  }

<<<<<<< HEAD
  const { error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (createError && !createError.message?.includes("already registered")) {
    return NextResponse.json(
      { error: createError.message ?? "No se pudo preparar el acceso" },
      { status: 500 },
    );
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
=======
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      shouldCreateUser: true,
    },
>>>>>>> 273f60c0040b26c2299429f7a8b8728c88dfc4cd
  });

  if (error || !data?.properties?.email_otp) {
    return NextResponse.json(
      { error: error?.message ?? "No se pudo generar el acceso" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    emailOtp: data.properties.email_otp,
  });
}


