"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useSupabase } from "@/components/providers/SupabaseProvider";

type SignOutButtonProps = {
  variant?: "light" | "dark";
};

export function SignOutButton({ variant = "light" }: SignOutButtonProps) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
    router.refresh();
  };

  // Light variant for dark backgrounds (like home page header)
  if (variant === "dark") {
    return (
      <button
        onClick={handleSignOut}
        disabled={loading}
        className="rounded-full border-2 border-white/40 bg-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/30 hover:border-white/60 disabled:opacity-60 shadow-lg backdrop-blur-sm"
      >
        {loading ? "Cerrando..." : "🚪 Cerrar sesión"}
      </button>
    );
  }

  // Light variant for light backgrounds
  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className="rounded-full border-2 border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-60 shadow-lg"
    >
      {loading ? "Cerrando..." : "🚪 Cerrar sesión"}
    </button>
  );
}

