import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Lista de rutas sospechosas que deben ser bloqueadas (bots escaneando)
const BLOCKED_PATHS = [
  /^\/wp-admin/i,
  /^\/wordpress/i,
  /^\/wp-content/i,
  /^\/wp-includes/i,
  /^\/administrator/i,
  /^\/phpmyadmin/i,
  /^\/mysql/i,
  /^\/admin\/install/i,
  /^\/\.env/i,
  /^\/\.git/i,
  /^\/config\.php/i,
  /^\/wp-config\.php/i,
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Bloquear rutas sospechosas (bots escaneando)
  for (const blockedPath of BLOCKED_PATHS) {
    if (blockedPath.test(pathname)) {
      // Log para monitoreo (los logs van a Vercel)
      console.log(`[Security] Blocked suspicious path: ${pathname}`);
      return new NextResponse(null, { status: 404 });
    }
  }

  // Manejar redirects de autenticación
  const code = request.nextUrl.searchParams.get("code");
  if (pathname === "/" && code) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/callback";
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};


