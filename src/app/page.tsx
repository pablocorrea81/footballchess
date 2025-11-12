import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const gameRules = [
  {
    title: "🎯 Objetivo del Juego",
    description:
      "El primer jugador en marcar el número de goles establecido (1, 2 o 3) gana la partida. El creador de la partida puede elegir cuántos goles se necesitan para ganar.",
  },
  {
    title: "🏁 Inicio del Juego",
    description:
      "El tablero tiene 12 filas y 8 columnas. Cada jugador tiene 12 piezas en sus posiciones iniciales. Al comenzar, se realiza un sorteo aleatorio para determinar qué jugador mueve primero.",
  },
  {
    title: "⚽ Las Porterías",
    description:
      "Las porterías están ubicadas en las filas extremas (filas 1 y 12), en las columnas centrales (columnas D y E). Estas casillas están marcadas con un icono de portería (🥅) en el tablero.",
  },
  {
    title: "👤 Carrileros (2 piezas)",
    description:
      "Pueden moverse horizontal y verticalmente. Distancia máxima: 2 casillas. Pueden marcar goles.",
  },
  {
    title: "🛡️ Defensas (4 piezas)",
    description:
      "Pueden moverse 1 casilla en cualquier dirección (horizontal, vertical o diagonal). ⚠️ IMPORTANTE: Los defensas NO pueden marcar goles.",
  },
  {
    title: "⚙️ Mediocampistas (4 piezas)",
    description:
      "Pueden moverse en diagonal (como el alfil en ajedrez). Distancia: cualquier número de casillas. Pueden marcar goles.",
  },
  {
    title: "⚡ Delanteros (2 piezas)",
    description:
      "Pueden moverse en cualquier dirección (horizontal, vertical o diagonal, como la reina en ajedrez). Distancia: cualquier número de casillas. Pueden marcar goles.",
  },
  {
    title: "📋 Reglas Generales",
    description:
      "• No puedes saltar sobre otras piezas (amigas o enemigas).\n• Puedes capturar piezas del oponente moviéndote a su casilla.\n• No puedes terminar tu movimiento dentro de tu propia portería.\n• Si intentas un movimiento ilegal, debes hacer un movimiento válido diferente.\n• Si no tienes movimientos legales, pierdes el turno.\n• ⏱️ TIMEOUT: En partidas multijugador, puedes activar o desactivar el límite de tiempo. Si está activado, tienes 60 segundos para hacer tu movimiento. Si se agota el tiempo, pierdes tu turno automáticamente.",
  },
  {
    title: "🎊 Marcar un Gol",
    description:
      "Un gol se marca cuando una pieza (que no sea defensa) termina su movimiento en la portería del oponente. Después de un gol, el tablero se reinicia a las posiciones iniciales y el jugador que recibió el gol mueve primero en la nueva ronda.",
  },
];

type HomeProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function Home({ searchParams }: HomeProps) {
  const codeParam = searchParams?.code;
  if (typeof codeParam === "string" && codeParam.length > 0) {
    redirect(`/auth/callback?code=${codeParam}`);
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-sky-100 py-12 sm:py-16 lg:py-24">
      <main className="mx-auto flex max-w-5xl flex-col gap-8 sm:gap-12 lg:gap-16 px-4 sm:px-6">
        <header className="rounded-3xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-600 to-emerald-700 p-8 sm:p-10 shadow-2xl text-white">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            ⚽ Football Chess
          </h1>
          <p className="text-lg sm:text-xl text-emerald-50 mb-6">
            El juego que combina estrategia de ajedrez con la emoción del fútbol
          </p>
          <div className="flex flex-wrap items-center gap-4">
            {session ? (
              <>
                <Link
                  href="/lobby"
                  className="inline-flex items-center rounded-full bg-white text-emerald-600 px-6 py-3 font-semibold transition hover:bg-emerald-50 shadow-lg"
                >
                  🎮 Ir al Lobby
                </Link>
                <SignOutButton variant="dark" />
              </>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center rounded-full bg-white text-emerald-600 px-6 py-3 font-semibold transition hover:bg-emerald-50 shadow-lg"
              >
                🔐 Iniciar Sesión
              </Link>
            )}
          </div>
        </header>

        <section className="rounded-3xl border-2 border-emerald-200 bg-white/95 p-6 sm:p-8 lg:p-10 shadow-xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-emerald-950 mb-6">
            📖 Instrucciones del Juego
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {gameRules.map((rule, index) => (
              <article
                key={index}
                className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-md hover:shadow-lg transition-shadow"
              >
                <h3 className="text-xl font-bold text-emerald-950 mb-3">
                  {rule.title}
                </h3>
                <p className="text-base text-emerald-900/90 whitespace-pre-line leading-relaxed">
                  {rule.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border-2 border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6 sm:p-8 lg:p-10 shadow-xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-sky-950 mb-4">
            🎮 ¿Cómo Jugar?
          </h2>
          <ol className="space-y-4 text-base sm:text-lg text-sky-900/90">
            <li className="flex gap-3">
              <span className="font-bold text-sky-600">1.</span>
              <span>Inicia sesión o crea una cuenta usando Magic Link.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-sky-600">2.</span>
              <span>Ve al lobby para crear una nueva partida o unirte a una existente.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-sky-600">3.</span>
              <span>También puedes jugar contra la IA seleccionando "Partida vs IA".</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-sky-600">4.</span>
              <span>Selecciona una de tus piezas para ver sus movimientos legales.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-sky-600">5.</span>
              <span>Haz clic en una casilla válida para mover tu pieza.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-sky-600">6.</span>
              <span>¡Marca 3 goles antes que tu oponente para ganar!</span>
            </li>
          </ol>
        </section>
      </main>
    </div>
  );
}
