import Link from "next/link";
import { redirect } from "next/navigation";

import { LobbyView } from "@/components/lobby/LobbyView";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import type { Database } from "@/lib/database.types";

type RawGameRow = Database["public"]["Tables"]["games"]["Row"] & {
  player1?: { username: string } | { username: string }[];
  player2?: { username: string } | { username: string }[];
};

type LobbyPageProps = {
  searchParams?: {
    error?: string;
    game?: string;
  };
};

const getUsername = (
  profile: RawGameRow["player1"],
): string | null => {
  if (Array.isArray(profile)) {
    return profile[0]?.username ?? null;
  }
  return profile?.username ?? null;
};

const mapErrorCode = (code?: string, gameId?: string | null): string | null => {
  if (!code) {
    return null;
  }

  switch (code) {
    case "game_not_found":
      return gameId
        ? `La partida ${gameId} no existe o ha sido eliminada.`
        : "La partida no existe o ha sido eliminada.";
    case "not_participant":
      return "Necesitas ser participante de la partida para poder verla.";
    case "bot_private":
      return "Las partidas contra la IA sólo pueden ser abiertas por su creador.";
    default:
      return "No se pudo acceder a la partida seleccionada.";
  }
};

export default async function LobbyPage({ searchParams }: LobbyPageProps) {
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

  const { data: rawGames } = await supabase
    .from("games")
    .select(
      `id,
      status,
      created_at,
      player_1_id,
      player_2_id,
      game_state,
      score,
      winner_id,
      bot_difficulty,
      is_bot_game,
      bot_player,
      bot_display_name,
      player1:profiles!games_player_1_id_fkey(username),
      player2:profiles!games_player_2_id_fkey(username)`,
    )
    .in("status", ["waiting", "in_progress"])
    .order("created_at", { ascending: true });

  const games =
    rawGames?.map((game) => ({
      ...game,
      player_1_username: getUsername(game.player1),
      player_2_username: getUsername(game.player2),
    })) ?? [];

  const initialError = mapErrorCode(searchParams?.error, searchParams?.game ?? null);

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

        <LobbyView
          profileId={session.user.id}
          initialGames={games}
          initialError={initialError ?? undefined}
        />
      </main>
    </div>
  );
}

