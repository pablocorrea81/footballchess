"use server";

import { revalidatePath } from "next/cache";

import { createServerActionSupabaseClient } from "@/lib/supabaseServer";

export async function upsertTeamAction(input: {
  name: string;
  primaryColor: string;
  secondaryColor: string;
}) {
  const supabase = createServerActionSupabaseClient();

  const {
    data: sessionData,
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    throw new Error("Sesión no válida.");
  }

  const userId = sessionData.session.user.id;
  const name = input.name.trim();

  if (!name) {
    throw new Error("El nombre del equipo no puede estar vacío.");
  }

  // Enforce max length to keep UI limpia
  if (name.length > 40) {
    throw new Error("El nombre del equipo debe tener 40 caracteres o menos.");
  }

  const primaryColor = input.primaryColor || "#16a34a";
  const secondaryColor = input.secondaryColor || "#0f766e";

  // Intentar upsert basado en owner_id único
  const { error } = await supabase
    .from("teams")
    .upsert(
      {
        owner_id: userId,
        name,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
      },
      {
        onConflict: "owner_id",
      },
    );

  if (error) {
    console.error("[team/upsert] Error upserting team:", error);
    throw new Error(error.message || "No se pudo guardar el equipo.");
  }

  revalidatePath("/team");
  revalidatePath("/lobby");
}


