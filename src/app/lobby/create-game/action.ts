"use server";

import { revalidatePath } from "next/cache";

import { createServerActionSupabaseClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { RuleEngine, type PlayerId } from "@/lib/ruleEngine";
import {
  FOOTBALL_BOT_DEFAULT_DIFFICULTY,
  FOOTBALL_BOT_DEFAULT_NAME,
  executeBotTurnIfNeeded,
} from "@/lib/ai/footballBot";

export async function createGameAction(profileId: string) {
  const supabase = createServerActionSupabaseClient();

  const {
    data: sessionData,
    error: sessionError,
  } = await supabase.auth.getSession();

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

  const {
    data: sessionData,
    error: sessionError,
  } = await supabase.auth.getSession();

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

export async function deleteGameAction(gameId: string) {
  const supabase = createServerActionSupabaseClient();

  const {
    data: sessionData,
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    throw new Error("Sesión no válida.");
  }

  const userId = sessionData.session.user.id;

  const {
    data: game,
    error: fetchError,
  } = await supabase
    .from("games")
    .select("player_1_id, player_2_id, status, is_bot_game")
    .eq("id", gameId)
    .single();

  if (fetchError || !game) {
    throw new Error("No se encontró la partida.");
  }

  if (game.player_1_id !== userId) {
    throw new Error("Sólo el creador puede eliminar la partida.");
  }

  // Permitir eliminar partidas con bots en cualquier estado, o partidas normales en waiting/finished
  const canDelete =
    game.is_bot_game ||
    game.status === "waiting" ||
    game.status === "finished";

  if (!canDelete) {
    throw new Error("No se puede eliminar una partida en progreso (excepto partidas contra IA).");
  }

  const { error: deleteError } = await supabaseAdmin
    .from("games")
    .delete()
    .eq("id", gameId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  revalidatePath("/lobby");
}

