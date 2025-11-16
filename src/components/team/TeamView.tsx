"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { upsertTeamAction } from "@/app/team/action";

type TeamViewProps = {
  initialTeam: {
    id: string;
    name: string;
    primaryColor: string;
    secondaryColor: string;
    emblemUrl: string | null;
  } | null;
};

export function TeamView({ initialTeam }: TeamViewProps) {
  const router = useRouter();
  const [name, setName] = useState<string>(initialTeam?.name ?? "Mi Club");
  const [primaryColor, setPrimaryColor] = useState<string>(
    initialTeam?.primaryColor ?? "#16a34a",
  );
  const [secondaryColor, setSecondaryColor] = useState<string>(
    initialTeam?.secondaryColor ?? "#0f766e",
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        await upsertTeamAction({
          name,
          primaryColor,
          secondaryColor,
        });
        setSuccess("Equipo guardado correctamente.");
        router.refresh();
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "No se pudo guardar el equipo.",
        );
      }
    });
  };

  return (
    <section className="rounded-3xl border border-emerald-200 bg-white/95 p-6 sm:p-8 shadow-xl">
      <h2 className="text-xl sm:text-2xl font-bold text-emerald-950">
        Datos del equipo
      </h2>
      <p className="mt-1 text-sm text-emerald-900/80">
        El nombre y los colores de tu equipo se usarán en el lobby y dentro de
        las partidas en futuras versiones.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div className="space-y-2">
          <label
            htmlFor="team-name"
            className="text-sm font-medium text-emerald-900"
          >
            Nombre del equipo
          </label>
          <input
            id="team-name"
            type="text"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 shadow-sm focus:border-emerald-400 focus:outline-none"
            placeholder="Ej: Club Atlético FootballChess"
          />
          <p className="text-xs text-emerald-900/60">
            Máximo 40 caracteres. Este nombre se mostrará a tus rivales.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label
              htmlFor="primary-color"
              className="text-sm font-medium text-emerald-900"
            >
              Color principal
            </label>
            <div className="flex items-center gap-3">
              <input
                id="primary-color"
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-16 cursor-pointer rounded border border-emerald-200 bg-white"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 shadow-sm focus:border-emerald-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="secondary-color"
              className="text-sm font-medium text-emerald-900"
            >
              Color secundario
            </label>
            <div className="flex items-center gap-3">
              <input
                id="secondary-color"
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="h-10 w-16 cursor-pointer rounded border border-emerald-200 bg-white"
              />
              <input
                type="text"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="flex-1 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-950 shadow-sm focus:border-emerald-400 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Vista previa simple */}
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-emerald-900">
            Vista previa rápida
          </p>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 flex-1 items-center justify-center rounded-xl border border-emerald-200 text-xs font-semibold text-white shadow-sm"
              style={{
                background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
              }}
            >
              {name || "Mi Club"}
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800">
            {success}
          </div>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Guardando..." : "Guardar equipo"}
          </button>
        </div>
      </form>
    </section>
  );
}


