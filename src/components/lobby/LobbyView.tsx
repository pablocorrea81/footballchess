"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import type { GameState } from "@/lib/ruleEngine";
import { createGameAction } from "@/app/lobby/create-game/action";

type GameRow = Database["public"]["Tables"]["games"]["Row"] & {
  player_1_username?: string | null;
  player_2_username?: string | null;
};

type RawGameRow = Database["public"]["Tables"]["games"]["Row"] & {
  player1?: { username: string } | { username: string }[];
  player2?: { username: string } | { username: string }[];
};

const extractUsername = (
  profile: RawGameRow["player1"],
): string | null => {
  if (Array.isArray(profile)) {
    return profile[0]?.username ?? null;
  }
  return profile?.username ?? null;
};

const normalizeGames = (rows: RawGameRow[]): GameRow[] =>
  rows.map(({ player1, player2, ...rest }) => ({
    ...rest,
    player_1_username: extractUsername(player1),
    player_2_username: extractUsername(player2),
  }));

type LobbyViewProps = {
  profileId: string;
  initialGames: GameRow[];
};

const GAME_CHANNEL = "games:lobby";

export function LobbyView({ profileId, initialGames }: LobbyViewProps) {
  const supabase = createClientComponentClient<Database>();

  const [games, setGames] = useState<GameRow[]>(initialGames);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
        async () => {
          const { data } = (await supabase
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
              player1:profiles!games_player_1_id_fkey(username),
              player2:profiles!games_player_2_id_fkey(username)`,
            )
            .in("status", ["waiting", "in_progress"])
            .order("created_at", { ascending: true })) as PostgrestSingleResponse<
            RawGameRow[]
          >;

          if (data) {
            setGames(normalizeGames(data));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  const createGame = async () => {
    setError(null);
    setLoading(true);
    startTransition(async () => {
      try {
        await createGameAction(profileId);
        const { data } = (await supabase
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
            player1:profiles!games_player_1_id_fkey(username),
            player2:profiles!games_player_2_id_fkey(username)`,
          )
          .in("status", ["waiting", "in_progress"])
          .order("created_at", { ascending: true })) as PostgrestSingleResponse<
          RawGameRow[]
        >;
        if (data) {
          setGames(normalizeGames(data));
        }
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

  const joinGame = async (id: string) => {
    setLoading(true);
    setError(null);
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
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3 rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Partidas activas</h2>
          <p className="text-sm text-emerald-100/80">
            Lista compartida en tiempo real. Puedes crear o unirte a un juego
            abierto.
          </p>
        </div>
        <button
          onClick={createGame}
          disabled={loading || isPending}
          className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-700/50"
        >
          {loading ? "Procesando..." : "Crear partida"}
        </button>
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
          const startingPlayer =
            (game.game_state as GameState)?.startingPlayer ?? "home";
          const startsLabel =
            startingPlayer === "home"
              ? game.player_1_id === profileId
                ? "Tú comienzas"
                : "Jugador 1 empieza"
              : game.player_2_id === profileId
                ? "Tú comienzas"
                : "Jugador 2 empieza";
          const canJoin = game.status === "waiting" && !hasOpponent;
          const isInGame = isOwner || isOpponent;

          return (
            <li
              key={game.id}
              className="flex h-full flex-col justify-between rounded-3xl border border-white/10 bg-white/5 p-5 text-white shadow-lg backdrop-blur"
            >
              <div className="flex flex-col gap-2">
                <p className="text-xs uppercase tracking-widest text-emerald-200">
                  {game.status === "waiting" ? "Esperando rival" : "En progreso"}
                </p>
                <h3 className="text-lg font-semibold">
                  {game.player_1_username ?? "Jugador 1"}
                </h3>
                <p className="text-sm text-emerald-100/80">
                  vs{" "}
                  <span>
                    {game.player_2_username
                      ? game.player_2_username
                      : canJoin
                        ? "¿Te unes?"
                        : "Buscando..."}
                  </span>
                </p>
                <p className="text-xs uppercase tracking-widest text-emerald-200/80">
                  {startsLabel}
                </p>
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
                    Observando...
                  </span>
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

