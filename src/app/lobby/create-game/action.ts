"use server";

import { revalidatePath } from "next/cache";

import { createServerActionSupabaseClient } from "@/lib/supabaseServer";
import { RuleEngine } from "@/lib/ruleEngine";

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

