"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useSupabase } from "@/components/providers/SupabaseProvider";

export function HashSessionHandler() {
  const { supabase } = useSupabase();
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

    void (async () => {
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      window.history.replaceState(null, "", window.location.pathname);
      router.replace("/lobby");
      router.refresh();
    })();
  }, [router, supabase]);

  return null;
}


