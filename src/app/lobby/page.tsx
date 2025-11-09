import Link from "next/link";
import { redirect } from "next/navigation";

import { LobbyView } from "@/components/lobby/LobbyView";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export default async function LobbyPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("id", session.user.id)
    .single();

  const { data: games } = await supabase
    .from("games")
    .select(
      "id, status, created_at, player_1_id, player_2_id, score, profiles!games_player_1_id_fkey(username), profiles!games_player_2_id_fkey(username)",
    )
    .in("status", ["waiting", "in_progress"])
    .order("created_at", { ascending: true });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-950 py-16">
      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6">
        <header className="rounded-3xl border border-white/10 bg-white/10 p-8 text-white shadow-xl">
          <p className="text-sm uppercase tracking-widest text-emerald-200">
            Lobby de partidas
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Bienvenido/a</h1>
          <p className="mt-2 text-sm text-emerald-100/80">
            Crea una partida nueva o únete a un juego esperando contrincante.
          </p>
          <div className="mt-6 flex items-center gap-3 text-sm text-emerald-100">
            <span className="rounded-full bg-emerald-500/20 px-3 py-1">
              Sesión: {profile?.username ?? "Jugador"}
            </span>
            <Link
              href="/"
              className="rounded-full border border-emerald-400/40 px-3 py-1 text-emerald-100 transition hover:border-emerald-200 hover:text-white"
            >
              Volver al inicio
            </Link>
          </div>
        </header>

        <LobbyView profileId={session.user.id} initialGames={games ?? []} />
      </main>
    </div>
  );
}

