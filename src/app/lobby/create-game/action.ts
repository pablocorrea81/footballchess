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
import { generateInviteCode } from "@/lib/inviteCode";

export async function createGameAction(
  profileId: string,
  winningScore: number = 3,
  timeoutEnabled: boolean = true,
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

  // Validate winning_score (must be 1, 2, or 3)
  if (![1, 2, 3].includes(winningScore)) {
    throw new Error("winning_score debe ser 1, 2 o 3.");
  }

  const startingPlayer = Math.random() < 0.5 ? "home" : "away";
  const initialState = RuleEngine.createInitialState(startingPlayer);
  const inviteCode = generateInviteCode();

  // Ensure invite code is unique (retry if collision occurs, though very unlikely)
  let attempts = 0;
  let finalInviteCode = inviteCode;
  while (attempts < 5) {
    const { data: existing } = await supabase
      .from("games")
      .select("id")
      .eq("invite_code", finalInviteCode)
      .single();
    
    if (!existing) {
      break; // Code is unique
    }
    
    finalInviteCode = generateInviteCode();
    attempts++;
  }

  const { error } = await supabase.from("games").insert({
    player_1_id: profileId,
    status: "waiting",
    game_state: initialState,
    score: initialState.score,
    invite_code: finalInviteCode,
    turn_started_at: null, // Will be set when game starts (status changes to in_progress)
    winning_score: winningScore,
    timeout_enabled: timeoutEnabled,
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
      turn_started_at: new Date().toISOString(), // Initialize turn_started_at when game starts
      winning_score: 3, // Default for bot games
      timeout_enabled: true, // Default for bot games
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

  // Only the creator (player_1_id) can delete the game
  if (game.player_1_id !== userId) {
    throw new Error("Sólo el creador puede eliminar la partida.");
  }

  // Creator can always delete their games, regardless of status
  // No restrictions needed - if user is the creator, they can delete

  const { error: deleteError } = await supabaseAdmin
    .from("games")
    .delete()
    .eq("id", gameId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  revalidatePath("/lobby");
}

