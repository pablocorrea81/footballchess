import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { StatsView } from "@/components/stats/StatsView";
import { getGlobalRankings, getHardBotRankings, getProBotRankings } from "@/lib/stats/statsHelpers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StatsPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .eq("id", session.user.id)
    .single();

  // Fetch rankings
  const [globalRankings, hardBotRankings, proBotRankings] = await Promise.all([
    getGlobalRankings(100),
    getHardBotRankings(100),
    getProBotRankings(100),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-950 py-16">
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6">
        <header className="rounded-3xl border border-white/10 bg-white/10 p-8 text-white shadow-xl">
          <p className="text-sm uppercase tracking-widest text-emerald-200">
            Estadísticas y Rankings
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Rankings</h1>
          <p className="mt-2 text-sm text-emerald-100/80">
            Estadísticas de partidas jugadas, partidas ganadas y enfrentamientos entre jugadores.
          </p>
          <div className="mt-6 flex items-center gap-3 text-sm text-emerald-100">
            {profile && (
              <Link
                href="/profile"
                className="flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 transition hover:bg-emerald-500/30"
              >
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.username}
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                    {profile.username?.charAt(0).toUpperCase() ?? "J"}
                  </div>
                )}
                <span>{profile.username ?? "Jugador"}</span>
              </Link>
            )}
            <Link
              href="/lobby"
              className="rounded-full border border-emerald-400/40 px-3 py-1 text-emerald-100 transition hover:border-emerald-200 hover:text-white"
            >
              ← Volver al lobby
            </Link>
          </div>
        </header>

        <StatsView
          profileId={session.user.id}
          initialGlobalRankings={globalRankings}
          initialHardBotRankings={hardBotRankings}
          initialProBotRankings={proBotRankings}
        />
      </main>
    </div>
  );
}

