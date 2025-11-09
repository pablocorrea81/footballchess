import { notFound, redirect } from "next/navigation";

import { GameView } from "@/components/game/GameView";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { RuleEngine, type GameState } from "@/lib/ruleEngine";
import type { Database } from "@/lib/database.types";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";

type PlayPageProps = {
  params: {
    gameId: string;
  };
};

type GameRow = Database["public"]["Tables"]["games"]["Row"];

type RawGame = GameRow & {
  player_one?:
    | { username: string }
    | { username: string }[];
  player_two?:
    | { username: string }
    | { username: string }[];
};

const extractUsername = (
  profile:
    | RawGame["player_one"]
    | RawGame["player_two"],
): string | null => {
  if (Array.isArray(profile)) {
    return profile[0]?.username ?? null;
  }
  return profile?.username ?? null;
};

export default async function PlayPage({ params }: PlayPageProps) {
  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: rawGame, error } = (await supabase
    .from("games")
    .select(
      `
        id,
        status,
        game_state,
        score,
        player_1_id,
        player_2_id,
        winner_id,
        player_one:profiles!games_player_1_id_fkey(username),
        player_two:profiles!games_player_2_id_fkey(username)
      `,
    )
    .eq("id", params.gameId)
    .single()) as PostgrestSingleResponse<RawGame>;

  if (error || !rawGame) {
    notFound();
  }

  const game = {
    ...rawGame,
    player_one_username: extractUsername(rawGame.player_one),
    player_two_username: extractUsername(rawGame.player_two),
  };

  const isPlayer =
    game.player_1_id === session.user.id ||
    (!!game.player_2_id && game.player_2_id === session.user.id);

  if (!isPlayer) {
    redirect("/lobby");
  }

  const baseState = RuleEngine.createInitialState();
  const rawState = (game.game_state as Partial<GameState> | null) ?? baseState;
  const parsedState: GameState = {
    ...baseState,
    ...rawState,
    board: rawState.board ?? baseState.board,
    turn: rawState.turn ?? baseState.turn,
    score: (rawState.score as GameState["score"]) ?? baseState.score,
    lastMove: rawState.lastMove ?? null,
    history: rawState.history ?? [],
    startingPlayer: rawState.startingPlayer ?? baseState.startingPlayer,
  };

  const playerRole = game.player_1_id === session.user.id ? "home" : "away";
  const opponentRole = playerRole === "home" ? "away" : "home";

  const playerLabels = {
    home: game.player_one_username ?? "Jugador 1",
    away: game.player_two_username ?? "Jugador 2",
  };

  return (
    <GameView
      initialGameId={game.id}
      initialState={parsedState}
      initialScore={game.score as GameState["score"]}
      initialStatus={game.status}
      profileId={session.user.id}
      playerLabels={playerLabels}
      playerRole={playerRole}
      opponentRole={opponentRole}
      playerIds={{ home: game.player_1_id, away: game.player_2_id }}
      initialWinnerId={game.winner_id}
    />
  );
}

