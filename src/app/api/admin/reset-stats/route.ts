import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", session.user.id)
      .single();

    // Also check if email is pabloco@gmail.com (for backward compatibility)
    const isAdminByEmail = session.user.email === "pabloco@gmail.com";
    const isAdmin = profile?.is_admin === true || isAdminByEmail;

    if (!isAdmin) {
      return NextResponse.json({ error: "No tienes permisos de administrador" }, { status: 403 });
    }

    const body = (await request.json()) as { playerId?: string; resetAll?: boolean };

    if (body.resetAll) {
      // Reset all finished games (set status back to in_progress or delete them)
      // Actually, we'll delete all finished games to reset stats
      const { error: deleteError } = await supabaseAdmin
        .from("games")
        .delete()
        .eq("status", "finished");

      if (deleteError) {
        console.error("[admin] Error deleting finished games:", deleteError);
        return NextResponse.json(
          { error: "Error al reiniciar todas las estadísticas" },
          { status: 500 },
        );
      }

      return NextResponse.json({ ok: true, message: "Todas las estadísticas han sido reiniciadas" });
    }

    if (body.playerId) {
      // Reset stats for a specific player by deleting their finished games
      const { error: deleteError } = await supabaseAdmin
        .from("games")
        .delete()
        .eq("status", "finished")
        .or(`player_1_id.eq.${body.playerId},player_2_id.eq.${body.playerId}`);

      if (deleteError) {
        console.error("[admin] Error deleting player games:", deleteError);
        return NextResponse.json(
          { error: "Error al reiniciar las estadísticas del jugador" },
          { status: 500 },
        );
      }

      return NextResponse.json({
        ok: true,
        message: `Estadísticas del jugador ${body.playerId} reiniciadas`,
      });
    }

    return NextResponse.json({ error: "Debes especificar playerId o resetAll" }, { status: 400 });
  } catch (error) {
    console.error("[admin] Error in reset-stats:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 },
    );
  }
}

