"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import type { GameState } from "@/lib/ruleEngine";
import {
  createBotGameAction,
  createGameAction,
  deleteGameAction,
} from "@/app/lobby/create-game/action";

type GameRow = Database["public"]["Tables"]["games"]["Row"] & {
  player_1_username?: string | null;
  player_2_username?: string | null;
  player_1_avatar_url?: string | null;
  player_2_avatar_url?: string | null;
};

type RawGameRow = Database["public"]["Tables"]["games"]["Row"] & {
  player1?: { username: string; avatar_url: string | null } | { username: string; avatar_url: string | null }[];
  player2?: { username: string; avatar_url: string | null } | { username: string; avatar_url: string | null }[];
};

const extractUsername = (
  profile: RawGameRow["player1"],
): string | null => {
  if (Array.isArray(profile)) {
    return profile[0]?.username ?? null;
  }
  return profile?.username ?? null;
};

const extractAvatarUrl = (
  profile: RawGameRow["player1"],
): string | null => {
  if (Array.isArray(profile)) {
    return profile[0]?.avatar_url ?? null;
  }
  return profile?.avatar_url ?? null;
};

const normalizeGames = (rows: RawGameRow[]): GameRow[] =>
  rows.map((row) => {
    const { player1, player2, ...rest } = row;
    const baseRow = rest as Database["public"]["Tables"]["games"]["Row"];
    return {
      ...baseRow,
      player_1_username: extractUsername(player1),
      player_2_username: extractUsername(player2),
      player_1_avatar_url: extractAvatarUrl(player1),
      player_2_avatar_url: extractAvatarUrl(player2),
    };
  });

type LobbyViewProps = {
  profileId: string;
  initialGames: GameRow[];
  initialError?: string;
};

const GAME_CHANNEL = "games:lobby";

const GAME_SELECT = `
  id,
  status,
  created_at,
  player_1_id,
  player_2_id,
  game_state,
  score,
  winner_id,
  is_bot_game,
  bot_player,
  bot_difficulty,
  bot_display_name,
  invite_code,
  player1:profiles!games_player_1_id_fkey(username, avatar_url),
  player2:profiles!games_player_2_id_fkey(username, avatar_url)
`;

export function LobbyView({ profileId, initialGames, initialError }: LobbyViewProps) {
  const router = useRouter();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, supabaseAnonKey),
    [supabaseUrl, supabaseAnonKey],
  );

  const [games, setGames] = useState<GameRow[]>(initialGames);
  const [loading, setLoading] = useState(false);
  const [botLoading, setBotLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError || null);
  const [isPending, startTransition] = useTransition();
  const [selectedDifficulty, setSelectedDifficulty] = useState<"easy" | "medium" | "hard">("easy");
  const [showDifficultySelector, setShowDifficultySelector] = useState(false);

  const refreshGames = useCallback(async () => {
    try {
      const { data } = (await supabase
        .from("games")
        .select(GAME_SELECT)
        .in("status", ["waiting", "in_progress"])
        .order("created_at", { ascending: true })) as PostgrestSingleResponse<
        RawGameRow[]
      >;

      if (data) {
        setGames(normalizeGames(data));
      }
    } catch (refreshError) {
      console.error("[lobby] Error refreshing games:", refreshError);
    }
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel(GAME_CHANNEL)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
        },
        () => {
          // Refresh games list when changes are detected
          void refreshGames();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, refreshGames]);

  const createGame = async () => {
    setError(null);
    setLoading(true);
    startTransition(async () => {
      try {
        await createGameAction(profileId);
        // Refresh games list and server page
        await refreshGames();
        router.refresh();
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "No se pudo crear la partida.",
        );
      } finally {
        setLoading(false);
      }
    });
  };

  const createBotGame = async () => {
    setError(null);
    setBotLoading(true);
    startTransition(async () => {
      try {
        await createBotGameAction(profileId, selectedDifficulty);
        // Refresh games list and server page
        await refreshGames();
        router.refresh();
        setShowDifficultySelector(false);
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "No se pudo crear la partida contra la IA.",
        );
      } finally {
        setBotLoading(false);
      }
    });
  };

  const joinGame = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("games")
        .update({
          player_2_id: profileId,
          status: "in_progress",
        })
        .eq("id", id)
        .eq("player_2_id", null)
        .eq("status", "waiting");

      if (updateError) {
        setError(updateError.message);
      } else {
        // Refresh games list after joining
        await refreshGames();
        router.refresh();
      }
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : "No se pudo unir a la partida.",
      );
    } finally {
      setLoading(false);
    }
  };

  const deleteGame = async (id: string) => {
    setDeleteLoadingId(id);
    setError(null);
    try {
      await deleteGameAction(id);
      // Refresh games list and server page
      await refreshGames();
      router.refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "No se pudo eliminar la partida.",
      );
    } finally {
      setDeleteLoadingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Partidas activas</h2>
          <p className="text-sm text-emerald-100/80">
            Lista compartida en tiempo real. Puedes crear, enfrentarte a la IA o unirte a un
            juego abierto.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            {showDifficultySelector ? (
              <div className="flex flex-col gap-2 rounded-2xl border-2 border-sky-400/60 bg-sky-900/80 p-4 shadow-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-sky-100">Selecciona dificultad:</span>
                  <button
                    onClick={() => setShowDifficultySelector(false)}
                    className="text-sky-200 hover:text-white text-lg"
                  >
                    ×
                  </button>
                </div>
                <div className="flex gap-2">
                  {(["easy", "medium", "hard"] as const).map((diff) => (
                    <button
                      key={diff}
                      onClick={() => {
                        setSelectedDifficulty(diff);
                        // Don't close modal - user needs to click "Crear partida vs IA"
                      }}
                      className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                        selectedDifficulty === diff
                          ? "bg-sky-500 text-white shadow-lg"
                          : "bg-sky-700/50 text-sky-200 hover:bg-sky-600/70"
                      }`}
                    >
                      {diff === "easy" ? "🟢 Fácil" : diff === "medium" ? "🟡 Medio" : "🔴 Difícil"}
                    </button>
                  ))}
                </div>
                <button
                  onClick={createBotGame}
                  disabled={botLoading || isPending}
                  className="mt-2 rounded-full border-2 border-sky-300/50 bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-700/50 disabled:opacity-60"
                >
                  {botLoading ? "Invocando IA..." : `Crear partida vs IA (${selectedDifficulty === "easy" ? "Fácil" : selectedDifficulty === "medium" ? "Medio" : "Difícil"})`}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDifficultySelector(true)}
                disabled={botLoading || isPending}
                className="rounded-full border border-sky-300/50 px-4 py-2 text-sm font-medium text-sky-100 transition hover:border-sky-200 hover:text-white disabled:cursor-not-allowed disabled:border-sky-100/30 disabled:text-sky-100/40"
              >
                {botLoading ? "Invocando IA..." : "🤖 Partida vs IA"}
              </button>
            )}
          </div>
          <button
            onClick={createGame}
            disabled={loading || isPending}
            className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-700/50"
          >
            {loading ? "Procesando..." : "Crear partida"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {games?.map((game) => {
          const isOwner = game.player_1_id === profileId;
          const isOpponent = game.player_2_id === profileId;
          const hasOpponent = Boolean(game.player_2_id);
          const isBot = Boolean(game.is_bot_game);
          const startingPlayer =
            ((game.game_state as unknown) as GameState)?.startingPlayer ??
            "home";
          const startsLabel =
            startingPlayer === "home"
              ? game.player_1_id === profileId
                ? "Tú comienzas"
                : "Jugador 1 empieza"
              : game.player_2_id === profileId
                ? "Tú comienzas"
                : isBot
                  ? `${game.bot_display_name ?? "FootballBot"} inicia`
                  : "Jugador 2 empieza";
          const canJoin =
            !isBot && game.status === "waiting" && !hasOpponent;
          const isInGame = isOwner || isOpponent;
          const canDelete =
            isOwner && (
              game.status === "waiting" ||
              game.status === "finished" ||
              (isBot && game.status === "in_progress")
            );
          const opponentLabel = isBot
            ? game.bot_display_name ?? "FootballBot"
            : game.player_2_username
              ? game.player_2_username
              : canJoin
                ? "¿Te unes?"
                : "Buscando...";

          return (
            <li
              key={game.id}
              className="flex h-full flex-col justify-between rounded-3xl border border-white/10 bg-white/5 p-5 text-white shadow-lg backdrop-blur"
            >
              <div className="flex flex-col gap-3">
                <p className="text-xs uppercase tracking-widest text-emerald-200">
                  {isBot
                    ? "Modo IA"
                    : game.status === "waiting"
                      ? "Esperando rival"
                      : "En progreso"}
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    {game.player_1_avatar_url ? (
                      <img
                        src={game.player_1_avatar_url}
                        alt={game.player_1_username ?? "Jugador 1"}
                        className="h-8 w-8 rounded-full border-2 border-emerald-400/50 object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-emerald-400/50 bg-emerald-600 text-xs font-bold text-white">
                        {game.player_1_username?.charAt(0).toUpperCase() ?? "J"}
                      </div>
                    )}
                    <h3 className="text-lg font-semibold">
                      {game.player_1_username ?? "Jugador 1"}
                    </h3>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-emerald-100/60">vs</span>
                  <div className="flex items-center gap-2">
                    {isBot ? (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-sky-400/50 bg-sky-600 text-xs font-bold text-white">
                        🤖
                      </div>
                    ) : game.player_2_avatar_url ? (
                      <img
                        src={game.player_2_avatar_url}
                        alt={opponentLabel}
                        className="h-8 w-8 rounded-full border-2 border-sky-400/50 object-cover"
                      />
                    ) : game.player_2_username ? (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-sky-400/50 bg-sky-600 text-xs font-bold text-white">
                        {game.player_2_username.charAt(0).toUpperCase()}
                      </div>
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/30 bg-white/10 text-xs font-bold text-white/50">
                        ?
                      </div>
                    )}
                    <p className="text-sm text-emerald-100/80">
                      {opponentLabel}
                    </p>
                  </div>
                </div>
                <p className="text-xs uppercase tracking-widest text-emerald-200/80">
                  {startsLabel}
                </p>
                {isBot && game.bot_difficulty && (
                  <p className="text-xs text-emerald-100/60">
                    Dificultad:{" "}
                    <span className="font-semibold text-emerald-200">
                      {game.bot_difficulty === "easy"
                        ? "🟢 Fácil"
                        : game.bot_difficulty === "medium"
                          ? "🟡 Medio"
                          : "🔴 Difícil"}
                    </span>
                  </p>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                {isInGame ? (
                  <Link
                    href={`/play/${game.id}`}
                    className="inline-flex items-center rounded-full bg-emerald-500 px-4 py-2 text-emerald-950 transition hover:bg-emerald-400"
                  >
                    Entrar a la partida
                  </Link>
                ) : canJoin ? (
                  <button
                    onClick={() => joinGame(game.id)}
                    disabled={loading}
                    className="rounded-full border border-emerald-400/60 px-4 py-2 text-emerald-100 transition hover:border-emerald-200 hover:text-white disabled:opacity-60"
                  >
                    Unirme al juego
                  </button>
                ) : (
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-emerald-100/60">
                    {isBot ? "Solo jugador invitado" : "Observando..."}
                  </span>
                )}

                {/* Share button for waiting games */}
                {isOwner && game.status === "waiting" && !isBot && game.invite_code && (
                  <button
                    onClick={async () => {
                      const inviteUrl = `${window.location.origin}/invite/${game.invite_code}`;
                      try {
                        await navigator.clipboard.writeText(inviteUrl);
                        // You could add a toast notification here
                        alert(`Link de invitación copiado: ${inviteUrl}`);
                      } catch (err) {
                        // Fallback for browsers that don't support clipboard API
                        prompt("Copia este link para invitar a un amigo:", inviteUrl);
                      }
                    }}
                    className="rounded-full border border-blue-400/60 px-3 py-1 text-xs text-blue-200 transition hover:border-blue-200 hover:text-white"
                    title="Copiar link de invitación"
                  >
                    📤 Compartir
                  </button>
                )}

                {canDelete && (
                  <button
                    onClick={() => deleteGame(game.id)}
                    disabled={deleteLoadingId === game.id}
                    className="rounded-full border border-red-400/60 px-3 py-1 text-xs text-red-200 transition hover:border-red-200 hover:text-white disabled:opacity-60"
                  >
                    {deleteLoadingId === game.id ? "Eliminando..." : "Eliminar"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {games.length === 0 && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center text-sm text-emerald-100/80">
          No hay partidas disponibles. ¡Crea una nueva para comenzar!
        </div>
      )}
    </div>
  );
}

