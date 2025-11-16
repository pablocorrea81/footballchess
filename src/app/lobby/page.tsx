import Link from "next/link";
import { redirect } from "next/navigation";

import { LobbyView } from "@/components/lobby/LobbyView";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import type { Database } from "@/lib/database.types";

type RawGameRow = Database["public"]["Tables"]["games"]["Row"] & {
  player1?: { username: string; avatar_url: string | null } | { username: string; avatar_url: string | null }[];
  player2?: { username: string; avatar_url: string | null } | { username: string; avatar_url: string | null }[];
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
    .select("id, username, avatar_url")
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
      invite_code,
      turn_started_at,
      winning_score,
      timeout_enabled,
      finished_at,
      player1:profiles!games_player_1_id_fkey(username, avatar_url),
      player2:profiles!games_player_2_id_fkey(username, avatar_url)`,
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
            <Link
              href="/profile"
              className="flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 transition hover:bg-emerald-500/30"
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.username}
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  {profile?.username?.charAt(0).toUpperCase() ?? "J"}
                </div>
              )}
              <span>{profile?.username ?? "Jugador"}</span>
            </Link>
            <Link
              href="/stats"
              className="rounded-full border border-emerald-400/40 px-3 py-1 text-emerald-100 transition hover:border-emerald-200 hover:text-white"
            >
              📊 Estadísticas
            </Link>
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

