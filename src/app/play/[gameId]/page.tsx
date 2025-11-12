import { redirect } from "next/navigation";

import { GameView } from "@/components/game/GameView";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { RuleEngine, type GameState } from "@/lib/ruleEngine";
import type { Database } from "@/lib/database.types";
import type { PostgrestSingleResponse, PostgrestError } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { FOOTBALL_BOT_DEFAULT_NAME } from "@/lib/ai/footballBot";

type PlayPageProps = {
  params: Promise<{
    gameId: string;
  }> | {
    gameId: string;
  };
};

type GameRow = Database["public"]["Tables"]["games"]["Row"];

type RawGame = GameRow & {
  player_one?: { username: string; avatar_url: string | null } | { username: string; avatar_url: string | null }[];
  player_two?: { username: string; avatar_url: string | null } | { username: string; avatar_url: string | null }[];
};

const extractUsername = (
  profile: RawGame["player_one"] | RawGame["player_two"],
): string | null => {
  if (Array.isArray(profile)) {
    return profile[0]?.username ?? null;
  }
  return profile?.username ?? null;
};

const GAME_SELECT = `
        id,
        status,
        game_state,
        score,
        player_1_id,
        player_2_id,
        winner_id,
        is_bot_game,
        bot_player,
        bot_difficulty,
        bot_display_name,
        winning_score,
        timeout_enabled,
        turn_started_at,
        player_one:profiles!games_player_1_id_fkey(username, avatar_url),
        player_two:profiles!games_player_2_id_fkey(username, avatar_url)
      `;

export default async function PlayPage({ params }: PlayPageProps) {
  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  // Resolver params si es una Promise (Next.js 15+) o usar directamente
  const resolvedParams =
    params instanceof Promise ? await params : params;
  const rawGameId = resolvedParams?.gameId;
  const gameId =
    typeof rawGameId === "string" && rawGameId.trim() !== "" && rawGameId !== "undefined"
      ? rawGameId.trim()
      : null;

  if (!gameId) {
    console.error("[play] Invalid gameId:", rawGameId);
    redirect(`/lobby?error=game_not_found`);
  }
  let rawGame: RawGame | null = null;

  const { data: rlsGame, error: rlsError } = await supabase
    .from("games")
    .select(GAME_SELECT)
    .eq("id", gameId)
    .single();

  if (rlsError && (rlsError as PostgrestError).code !== "PGRST116") {
    console.error("[play] RLS game fetch error", rlsError);
  }

  if (rlsGame) {
    rawGame = rlsGame as RawGame;
  } else {
    try {
      const { data: adminData, error } = await supabaseAdmin
        .from("games")
        .select(GAME_SELECT)
        .eq("id", gameId)
        .single();

      if (error) {
        console.error("[play] supabaseAdmin fallback error", error);
      }

      rawGame = (adminData as RawGame | null) ?? null;
    } catch (adminError) {
      console.error("[play] unexpected admin fallback error", adminError);
    }
  }

  if (!rawGame) {
    const errorUrl = gameId
      ? `/lobby?error=game_not_found&game=${encodeURIComponent(gameId)}`
      : `/lobby?error=game_not_found`;
    redirect(errorUrl);
  }

  if (rawGame.is_bot_game && rawGame.player_1_id !== session.user.id) {
    redirect(`/lobby?error=bot_private&game=${encodeURIComponent(gameId)}`);
  }

  const isParticipant =
    rawGame.player_1_id === session.user.id ||
    (!!rawGame.player_2_id && rawGame.player_2_id === session.user.id);

  if (
    !rawGame.is_bot_game &&
    !isParticipant &&
    rawGame.status === "waiting" &&
    rawGame.player_2_id === null
  ) {
    try {
      const { data: joinedGame, error: joinError } = (await (supabaseAdmin.from(
        "games",
      ) as unknown as {
        update: (
          values: Record<string, unknown>,
        ) => ReturnType<typeof supabaseAdmin.from>;
      })
        .update({
          player_2_id: session.user.id,
          status: "in_progress",
          turn_started_at: new Date().toISOString(), // Initialize turn_started_at when game starts
        } as Record<string, unknown>)
        .eq("id", gameId)
        .is("player_2_id", null)
        .select(
          `
            id,
            status,
            game_state,
            score,
            player_1_id,
            player_2_id,
            winner_id,
            turn_started_at,
            player_one:profiles!games_player_1_id_fkey(username, avatar_url),
            player_two:profiles!games_player_2_id_fkey(username, avatar_url)
          `,
        )
        .single()) as PostgrestSingleResponse<RawGame>;

      if (joinError) {
        console.error("[play] joinGame error", joinError);
      }

      if (!joinError && joinedGame) {
        rawGame = joinedGame;
      }
    } catch (joinError) {
      console.error("[play] unexpected join error", joinError);
    }
  }

  const finalParticipant =
    rawGame.player_1_id === session.user.id ||
    (!!rawGame.player_2_id && rawGame.player_2_id === session.user.id);

  if (!finalParticipant) {
    redirect(
      `/lobby?error=not_participant&game=${encodeURIComponent(gameId)}`,
    );
  }

  const game = {
    ...rawGame,
    player_one_username: extractUsername(rawGame.player_one),
    player_two_username: extractUsername(rawGame.player_two),
    bot_display_name: rawGame.bot_display_name ?? FOOTBALL_BOT_DEFAULT_NAME,
  };

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

  // Get player labels - if username is null or empty, use fallback
  const playerLabels = {
    home: (game.player_one_username && game.player_one_username.trim() !== "") 
      ? game.player_one_username.trim() 
      : "Jugador 1",
    away: game.is_bot_game
      ? game.bot_display_name ?? FOOTBALL_BOT_DEFAULT_NAME
      : (game.player_two_username && game.player_two_username.trim() !== "") 
          ? game.player_two_username.trim() 
          : "Jugador 2",
  };
  
  console.log("[play] Player labels:", {
    player_one_username: game.player_one_username,
    player_two_username: game.player_two_username,
    playerLabels,
    is_bot_game: game.is_bot_game,
  });

  // Get user's show_move_hints preference
  const { data: userProfile } = await supabase
    .from("profiles")
    .select("show_move_hints")
    .eq("id", session.user.id)
    .single();

  const showMoveHints = userProfile?.show_move_hints ?? true;

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
      isBotGame={game.is_bot_game}
      botPlayer={game.bot_player as "home" | "away" | null}
      botDisplayName={game.bot_display_name ?? FOOTBALL_BOT_DEFAULT_NAME}
      showMoveHints={showMoveHints}
      winningScore={game.winning_score ?? 3}
      timeoutEnabled={game.timeout_enabled ?? true}
    />
  );
}

