import Link from "next/link";
import { redirect } from "next/navigation";

import { LearnView } from "@/components/learn/LearnView";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LearnPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-sky-100 py-12 sm:py-16 lg:py-20">
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 sm:px-6">
        <header className="rounded-3xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-600 to-emerald-700 p-6 sm:p-8 text-white shadow-2xl">
          <p className="text-xs uppercase tracking-widest text-emerald-100/80">
            Modo aprendizaje
          </p>
          <h1 className="mt-2 text-2xl sm:text-3xl lg:text-4xl font-bold">
            Aprende a jugar Football Chess
          </h1>
          <p className="mt-3 text-sm sm:text-base text-emerald-50/90">
            Recorre los conceptos básicos, entiende las piezas y descubre cómo marcar goles
            antes de jugar tus primeras partidas competitivas.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <Link
              href="/lobby"
              className="inline-flex items-center rounded-full bg-white px-4 py-2 font-semibold text-emerald-700 shadow hover:bg-emerald-50"
            >
              ← Volver al Lobby
            </Link>
          </div>
        </header>

        <LearnView />
      </main>
    </div>
  );
}


