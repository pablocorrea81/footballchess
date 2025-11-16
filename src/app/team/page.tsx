import Link from "next/link";
import { redirect } from "next/navigation";

import { TeamView } from "@/components/team/TeamView";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TeamPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: team } = await supabase
    .from("teams")
    .select("id, name, primary_color, secondary_color, emblem_url")
    .eq("owner_id", session.user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-sky-100 py-12 sm:py-16 lg:py-20">
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 sm:px-6">
        <header className="rounded-3xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-600 to-emerald-700 p-6 sm:p-8 text-white shadow-2xl">
          <p className="text-xs uppercase tracking-widest text-emerald-100/80">
            Mi equipo
          </p>
          <h1 className="mt-2 text-2xl sm:text-3xl lg:text-4xl font-bold">
            Configura tu club
          </h1>
          <p className="mt-3 text-sm sm:text-base text-emerald-50/90">
            Elige el nombre y los colores de tu equipo. En el futuro, las
            partidas multijugador se mostrarán como equipo vs equipo.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <Link
              href="/lobby"
              className="inline-flex items-center rounded-full bg-white px-4 py-2 font-semibold text-emerald-700 shadow hover:bg-emerald-50"
            >
              ← Volver al Lobby
            </Link>
          </div>
        </header>

        <TeamView
          initialTeam={
            team
              ? {
                  id: team.id,
                  name: team.name,
                  primaryColor: team.primary_color,
                  secondaryColor: team.secondary_color,
                  emblemUrl: team.emblem_url,
                }
              : null
          }
        />
      </main>
    </div>
  );
}


