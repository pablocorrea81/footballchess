"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type HashSessionHandlerProps = {
  redirectTo?: string;
};

export function HashSessionHandler({ redirectTo = "/lobby" }: HashSessionHandlerProps) {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hash = window.location.hash.replace("#", "");
    if (!hash) {
      return;
    }

    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      return;
    }

    let cancelled = false;

    const establishSession = async () => {
      try {
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
            const errorParam = payload?.error ?? "session_failed";
            router.replace(`/login?error=${encodeURIComponent(errorParam)}`);
          }
          return;
        }

        await response.json().catch(() => null);

        if (!cancelled) {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          window.location.replace(redirectTo);
        }
      } catch {
        if (!cancelled) {
          router.replace("/login?error=session_network");
        }
      }
    };

    void establishSession();

    return () => {
      cancelled = true;
    };
  }, [redirectTo, router]);

  return null;
}
