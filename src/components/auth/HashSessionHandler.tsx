"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function HashSessionHandler() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hash = window.location.hash.replace("#", "");
    console.log("[hash-handler] hash detected", hash);
    if (!hash) {
      return;
    }

    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      console.warn("[hash-handler] missing tokens", {
        accessToken,
        refreshToken,
      });
      return;
    }

    void (async () => {
      console.log("[hash-handler] setting session via API");
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accessToken,
          refreshToken,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        console.error("[hash-handler] failed to set session", payload);
        return;
      }

      console.log("[hash-handler] session set, cleaning hash");
      window.history.replaceState(null, "", window.location.pathname);
      router.replace("/lobby");
      router.refresh();
    })();
  }, [router]);

  return null;
}


