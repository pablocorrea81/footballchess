"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { useSupabase } from "@/components/providers/SupabaseProvider";

type InviteViewProps = {
  inviteCode: string;
  gameId: string;
};

export function InviteView({ inviteCode, gameId }: InviteViewProps) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleInviteSignup = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (!email || !email.includes("@")) {
        throw new Error("Por favor ingresa un email válido.");
      }

      // Call API to join game directly (creates user automatically)
      const response = await fetch("/api/invite/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          inviteCode: inviteCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo unir a la partida.");
      }

      // If we have an action link, redirect to it (auto-login)
      if (data.actionLink) {
        setMessage("¡Bienvenido! Redirigiendo a la partida...");
        // Small delay to show message, then redirect to magic link for auto-login
        setTimeout(() => {
          window.location.href = data.actionLink;
        }, 500);
      } else if (data.gameId) {
        // If no action link but we have gameId, redirect to game page
        // User will need to login manually if not already authenticated
        setMessage("¡Te has unido a la partida! Redirigiendo...");
        setTimeout(() => {
          router.push(`/play/${data.gameId}`);
        }, 1500);
      } else {
        setMessage("¡Te has unido a la partida!");
        setTimeout(() => {
          router.push("/lobby");
        }, 1500);
      }
    } catch (inviteError) {
      console.error("Error joining invite:", inviteError);
      setError(
        inviteError instanceof Error
          ? inviteError.message
          : "No se pudo unir a la partida. Por favor intenta de nuevo.",
      );
    } finally {
      setLoading(false);
    }
  }, [email, inviteCode, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border-2 border-white/20 bg-gradient-to-br from-emerald-950/80 to-emerald-900/60 p-8 text-white shadow-2xl">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">
              🎮 Invitación a Partida
            </h1>
            <p className="text-emerald-100/80">
              Te invitaron a jugar Football Chess
            </p>
            <div className="mt-4 inline-block rounded-full bg-emerald-500/20 px-4 py-2 border border-emerald-400/50">
              <span className="text-sm font-mono font-bold text-emerald-200">
                Código: {inviteCode}
              </span>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border-2 border-red-400/60 bg-red-500/20 p-4 text-sm text-red-100">
              ⚠️ {error}
            </div>
          )}

          {message && (
            <div className="mb-4 rounded-xl border-2 border-emerald-400/60 bg-emerald-500/20 p-4 text-sm text-emerald-100">
              ✅ {message}
            </div>
          )}

          <form onSubmit={handleInviteSignup} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-emerald-100 mb-2"
              >
                Tu email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                className="w-full rounded-xl border-2 border-emerald-200/30 bg-white/10 px-4 py-3 text-base text-white placeholder-emerald-200/50 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200/50"
                disabled={loading || !!message}
              />
              <p className="mt-2 text-xs text-emerald-200/60">
                Solo ingresa tu email y entrarás directamente a la partida. No necesitas validar tu email.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !!message || !email}
              className="w-full rounded-full border-2 border-emerald-400 bg-emerald-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? "Uniéndote a la partida..." : message ? "✓ ¡Listo!" : "Entrar a la partida"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-white/20">
            <p className="text-xs text-center text-emerald-200/60 mb-3">
              ¿Ya tienes una cuenta?
            </p>
            <Link
              href={`/login?redirect=/invite/${inviteCode}`}
              className="block w-full text-center rounded-full border-2 border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 hover:border-white/50"
            >
              Iniciar sesión
            </Link>
          </div>

          <div className="mt-4 text-center">
            <Link
              href="/"
              className="text-xs text-emerald-200/60 hover:text-emerald-200 transition"
            >
              ← Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

