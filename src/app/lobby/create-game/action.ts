"use server";

import { revalidatePath } from "next/cache";

import { createServerActionSupabaseClient } from "@/lib/supabaseServer";
import { RuleEngine, type PlayerId } from "@/lib/ruleEngine";
import {
  FOOTBALL_BOT_DEFAULT_DIFFICULTY,
  FOOTBALL_BOT_DEFAULT_NAME,
  executeBotTurnIfNeeded,
} from "@/lib/ai/footballBot";

export async function createGameAction(profileId: string) {
  const supabase = createServerActionSupabaseClient();

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    throw new Error("No authenticated session.");
  }

  if (sessionData.session.user.id !== profileId) {
    throw new Error("No autorizado para crear partidas con este perfil.");
  }

  const startingPlayer = Math.random() < 0.5 ? "home" : "away";
  const initialState = RuleEngine.createInitialState(startingPlayer);

  const { error } = await supabase.from("games").insert({
    player_1_id: profileId,
    status: "waiting",
    game_state: initialState,
    score: initialState.score,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/lobby");
}

export async function createBotGameAction(
  profileId: string,
  difficulty: "easy" | "medium" | "hard" = FOOTBALL_BOT_DEFAULT_DIFFICULTY,
) {
  const supabase = createServerActionSupabaseClient();

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    throw new Error("No authenticated session.");
  }

  if (sessionData.session.user.id !== profileId) {
    throw new Error("No autorizado para crear partidas con este perfil.");
  }

  const startingPlayer = Math.random() < 0.5 ? "home" : "away";
  const botPlayer: PlayerId = "away";
  const initialState = RuleEngine.createInitialState(startingPlayer);

  const { data, error } = await supabase
    .from("games")
    .insert({
      player_1_id: profileId,
      status: startingPlayer === botPlayer ? "in_progress" : "in_progress",
      player_2_id: null,
      game_state: initialState,
      score: initialState.score,
      is_bot_game: true,
      bot_player: botPlayer,
      bot_difficulty: difficulty,
      bot_display_name: FOOTBALL_BOT_DEFAULT_NAME,
    })
    .select("id, game_state")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "No se pudo crear la partida contra la IA.");
  }

  if (startingPlayer === botPlayer) {
    await executeBotTurnIfNeeded(data.id);
  }

  revalidatePath("/lobby");
}

