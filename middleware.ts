import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const APEX_DOMAIN = "footballchess.club";
const WWW_HOST = `www.${APEX_DOMAIN}`;

export function middleware(request: NextRequest) {
  const hostname = request.nextUrl.hostname;

  // Force apex domain so Supabase cookies are shared consistently
  if (hostname === WWW_HOST) {
    const url = request.nextUrl.clone();
    url.hostname = APEX_DOMAIN;
    return NextResponse.redirect(url, { status: 308 });
  }

  const code = request.nextUrl.searchParams.get("code");
  if (request.nextUrl.pathname === "/" && code) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/callback";
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};


