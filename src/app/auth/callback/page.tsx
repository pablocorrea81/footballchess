"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export const dynamic = "force-dynamic";

const FALLBACK_REDIRECT = "/lobby";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hash = window.location.hash.slice(1);
    if (!hash) {
      router.replace("/login?error=session_missing_hash");
      return;
    }

    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      router.replace("/login?error=session_missing_tokens");
      return;
    }

    // Get redirect path from query params, default to lobby
    const searchParams = new URLSearchParams(window.location.search);
    let targetPath = searchParams.get("next") ?? FALLBACK_REDIRECT;
    
    // If redirecting to invite page, it will handle joining the game
    // Otherwise, redirect to lobby or the specified path

    let cancelled = false;

    const establishSession = async () => {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accessToken,
          refreshToken,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (!cancelled) {
          router.replace(
            `/login?error=${encodeURIComponent(payload?.error ?? "session_failed")}`,
          );
        }
        return;
      }

      await response.json().catch(() => null);

      if (!cancelled) {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
        window.location.replace(targetPath);
      }
    };

    void establishSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-950 p-6 text-white">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <span className="text-sm uppercase tracking-widest text-emerald-200">
          Football Chess
        </span>
        <h1 className="text-2xl font-semibold">Validando acceso…</h1>
        <p className="text-sm text-emerald-100/80">
          Estamos confirmando tu sesión segura. Serás redirigido automáticamente al lobby.
        </p>
      </div>
    </main>
  );
}

