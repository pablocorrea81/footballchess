"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function AdminView() {
  const router = useRouter();
  const [playerId, setPlayerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleResetPlayerStats = async () => {
    if (!playerId.trim()) {
      setMessage({ type: "error", text: "Por favor ingresa un ID de jugador" });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/reset-stats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ playerId: playerId.trim() }),
      });

      const data = (await response.json()) as { ok?: boolean; error?: string; message?: string };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Error al reiniciar estadísticas");
      }

      setMessage({ type: "success", text: data.message || "Estadísticas reiniciadas correctamente" });
      setPlayerId("");
      // Refresh the page after a delay
      setTimeout(() => {
        router.refresh();
      }, 2000);
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Error desconocido",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetAllStats = async () => {
    if (!confirm("¿Estás seguro de que quieres reiniciar TODAS las estadísticas? Esta acción es irreversible.")) {
      return;
    }

    if (!confirm("Esta acción eliminará TODAS las partidas finalizadas. ¿Continuar?")) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/reset-stats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ resetAll: true }),
      });

      const data = (await response.json()) as { ok?: boolean; error?: string; message?: string };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Error al reiniciar estadísticas");
      }

      setMessage({ type: "success", text: data.message || "Todas las estadísticas han sido reiniciadas" });
      // Refresh the page after a delay
      setTimeout(() => {
        router.refresh();
      }, 2000);
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Error desconocido",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Reset Player Stats */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-semibold text-white">Reiniciar Estadísticas de un Jugador</h2>
        <p className="mb-4 text-sm text-emerald-100/70">
          Ingresa el ID del jugador para eliminar todas sus partidas finalizadas.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <input
            type="text"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            placeholder="ID del jugador (UUID)"
            className="flex-1 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white placeholder-emerald-100/50 focus:border-emerald-400 focus:outline-none"
            disabled={loading}
          />
          <button
            onClick={handleResetPlayerStats}
            disabled={loading || !playerId.trim()}
            className="rounded-lg border-2 border-red-500 bg-red-600 px-6 py-2 font-semibold text-white transition hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Procesando..." : "Reiniciar"}
          </button>
        </div>
      </div>

      {/* Reset All Stats */}
      <div className="rounded-2xl border-2 border-red-500/50 bg-red-500/10 p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-semibold text-white">⚠️ Reiniciar TODAS las Estadísticas</h2>
        <p className="mb-4 text-sm text-red-100/80">
          Esta acción eliminará TODAS las partidas finalizadas de TODOS los jugadores. Esta acción es
          <strong className="text-red-200"> IRREVERSIBLE</strong>.
        </p>
        <button
          onClick={handleResetAllStats}
          disabled={loading}
          className="rounded-lg border-2 border-red-600 bg-red-700 px-6 py-3 font-bold text-white transition hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Procesando..." : "⚠️ Reiniciar TODAS las Estadísticas"}
        </button>
      </div>

      {/* Message Display */}
      {message && (
        <div
          className={`rounded-xl border-2 p-4 ${
            message.type === "success"
              ? "border-green-500/50 bg-green-500/20 text-green-100"
              : "border-red-500/50 bg-red-500/20 text-red-100"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Back to Lobby */}
      <div className="flex justify-center">
        <Link
          href="/lobby"
          className="rounded-full border-2 border-emerald-400/60 bg-emerald-600/80 px-6 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-500 hover:border-emerald-300"
        >
          ← Volver al Lobby
        </Link>
      </div>
    </div>
  );
}

