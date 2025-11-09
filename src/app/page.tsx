import Link from "next/link";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

const setupSteps = [
  {
    title: "1. Configura Supabase",
    description:
      "Crea el proyecto, habilita Auth y Realtime, y añade las tablas `profiles` y `games`.",
  },
  {
    title: "2. Conecta el Frontend",
    description:
      "Guarda las claves en `.env.local`, despliega en Vercel y replica las variables ahí mismo.",
  },
  {
    title: "3. Construye el Lobby",
    description:
      "Implementa la lista de partidas `waiting` y el flujo para crear o unirse a un juego.",
  },
  {
    title: "4. Motor de Reglas",
    description:
      "Modela el tablero inicial y codifica la lógica de Football Chess en `RuleEngine`.",
  },
];

export default async function Home() {
  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-sky-100 py-24">
      <main className="mx-auto flex max-w-4xl flex-col gap-16 px-6">
        <header className="rounded-3xl border border-emerald-100 bg-white/80 p-10 shadow-lg shadow-emerald-100">
          <p className="text-sm font-medium uppercase tracking-widest text-emerald-600">
            footballchess.club
          </p>
          <h1 className="mt-4 text-4xl font-semibold text-emerald-950 sm:text-5xl">
            Football Chess Multiplayer
          </h1>
          <p className="mt-6 text-lg text-emerald-900/80">
            Base inicial lista. Supabase será la fuente de verdad del tablero,
            mientras que Next.js renderiza el lobby y la partida en tiempo
            real. Sigue los pasos para conectar todo y lanzar la primera
            versión jugable.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            {session ? (
              <>
                <Link
                  href="/lobby"
                  className="inline-flex items-center rounded-full bg-emerald-600 px-5 py-2 text-white transition hover:bg-emerald-700"
                >
                  Ir al lobby
                </Link>
                <SignOutButton />
              </>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center rounded-full bg-emerald-600 px-5 py-2 text-white transition hover:bg-emerald-700"
              >
                Iniciar sesión con Magic Link
              </Link>
            )}
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          {setupSteps.map((step) => (
            <article
              key={step.title}
              className="group rounded-2xl border border-emerald-100 bg-white/90 p-6 shadow-md transition hover:-translate-y-1 hover:shadow-lg"
            >
              <h2 className="text-xl font-semibold text-emerald-950">
                {step.title}
              </h2>
              <p className="mt-3 text-base text-emerald-900/80">
                {step.description}
              </p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-sky-100 bg-white/90 p-8 shadow-md">
          <h2 className="text-2xl font-semibold text-sky-900">
            Variables requeridas
          </h2>
          <p className="mt-4 text-sky-900/80">
            Crea un archivo `.env.local` con tus claves de Supabase antes de
            arrancar el servidor local:
          </p>
          <pre className="mt-4 rounded-xl bg-slate-950 px-4 py-3 text-sm text-slate-50">
            NEXT_PUBLIC_SUPABASE_URL=...
            {"\n"}
            NEXT_PUBLIC_SUPABASE_ANON_KEY=...
          </pre>
        </section>
      </main>
    </div>
  );
}
