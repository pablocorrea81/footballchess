import Link from "next/link";
import { redirect } from "next/navigation";

import { LobbyView } from "@/components/lobby/LobbyView";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import type { Database } from "@/lib/database.types";

type RawGameRow = Database["public"]["Tables"]["games"]["Row"] & {
  player1?: { username: string; avatar_url: string | null } | { username: string; avatar_url: string | null }[];
  player2?: { username: string; avatar_url: string | null } | { username: string; avatar_url: string | null }[];
  team1?: { name: string; primary_color: string; secondary_color: string } | { name: string; primary_color: string; secondary_color: string }[];
  team2?: { name: string; primary_color: string; secondary_color: string } | { name: string; primary_color: string; secondary_color: string }[];
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

const getTeamName = (team: RawGameRow["team1"]): string | null => {
  if (Array.isArray(team)) {
    return team[0]?.name ?? null;
  }
  return team?.name ?? null;
};

const getTeamPrimaryColor = (team: RawGameRow["team1"]): string | null => {
  if (Array.isArray(team)) {
    return team[0]?.primary_color ?? null;
  }
  return team?.primary_color ?? null;
};

const getTeamSecondaryColor = (team: RawGameRow["team1"]): string | null => {
  if (Array.isArray(team)) {
    return team[0]?.secondary_color ?? null;
  }
  return team?.secondary_color ?? null;
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

  // Get user's team
  const { data: userTeam } = await supabase
    .from("teams")
    .select("name, primary_color, secondary_color")
    .eq("owner_id", session.user.id)
    .maybeSingle();

  // Check if user is admin
  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", session.user.id)
    .single();
  
  const isAdminByEmail = session.user.email === "pabloco@gmail.com";
  const isAdmin = adminProfile?.is_admin === true || isAdminByEmail;

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
      bot_style,
      is_bot_game,
      bot_player,
      bot_display_name,
      invite_code,
      turn_started_at,
      winning_score,
      timeout_enabled,
      finished_at,
      team_1_id,
      team_2_id,
      player1:profiles!games_player_1_id_fkey(username, avatar_url),
      player2:profiles!games_player_2_id_fkey(username, avatar_url),
      team1:teams!games_team_1_id_fkey(name, primary_color, secondary_color),
      team2:teams!games_team_2_id_fkey(name, primary_color, secondary_color)`,
    )
    .in("status", ["waiting", "in_progress"])
    .order("created_at", { ascending: true });

  const games =
    rawGames?.map((game) => ({
      ...game,
      player_1_username: getUsername(game.player1),
      player_2_username: getUsername(game.player2),
      team_1_name: getTeamName(game.team1),
      team_2_name: getTeamName(game.team2),
      team_1_primary_color: getTeamPrimaryColor(game.team1),
      team_1_secondary_color: getTeamSecondaryColor(game.team1),
      team_2_primary_color: getTeamPrimaryColor(game.team2),
      team_2_secondary_color: getTeamSecondaryColor(game.team2),
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
          <div className="mt-6 flex items-center gap-3 text-sm text-emerald-100 flex-wrap">
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
            {userTeam && (
              <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 border border-white/20">
                {userTeam.primary_color && (
                  <div
                    className="h-5 w-5 rounded-full border-2 border-white/40 shadow-sm"
                    style={{
                      background: `linear-gradient(135deg, ${userTeam.primary_color}, ${userTeam.secondary_color || userTeam.primary_color})`,
                    }}
                  />
                )}
                <span className="font-semibold text-emerald-50">{userTeam.name}</span>
              </div>
            )}
            <Link
              href="/team"
              className="rounded-full border border-emerald-400/40 px-3 py-1 text-emerald-100 transition hover:border-emerald-200 hover:text-white"
            >
              🏟️ {userTeam ? "Editar equipo" : "Mi equipo"}
            </Link>
            <Link
              href="/stats"
              className="rounded-full border border-emerald-400/40 px-3 py-1 text-emerald-100 transition hover:border-emerald-200 hover:text-white"
            >
              📊 Estadísticas
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                className="rounded-full border border-red-400/60 bg-red-500/20 px-3 py-1 text-red-100 transition hover:border-red-300 hover:bg-red-500/30"
              >
                ⚙️ Admin
              </Link>
            )}
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

