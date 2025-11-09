"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useSupabase } from "@/components/providers/SupabaseProvider";

export function SignOutButton() {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
    router.refresh();
  };

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className="rounded-full border border-emerald-200 px-4 py-2 text-sm text-emerald-800 transition hover:border-emerald-400 hover:text-emerald-900 disabled:opacity-60"
    >
      {loading ? "Cerrando..." : "Cerrar sesión"}
    </button>
  );
}

