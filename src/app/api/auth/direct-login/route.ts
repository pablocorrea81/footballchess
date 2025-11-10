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

  console.log("[direct-login] incoming body", body);

  const requestUrl = new URL(request.url);

  const email = body?.email;
  const accessCode = body?.accessCode;

  if (typeof email !== "string" || !email.includes("@")) {
    console.warn("[direct-login] invalid email", email);
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

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${requestUrl.protocol}//${requestUrl.host}`;

  console.log("[direct-login] generating link", {
    siteUrl,
    email,
  });

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
    },
  });

  const actionLink = data?.properties?.action_link;

  if (error || !actionLink) {
    console.error("[direct-login] generateLink error", error);
    return NextResponse.json(
      { error: error?.message ?? "No se pudo generar el acceso" },
      { status: 500 },
    );
  }

  console.log("[direct-login] action link generated", {
    actionLink,
  });

  return NextResponse.json({
    actionLink,
  });
}


