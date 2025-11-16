import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { AdminView } from "@/components/admin/AdminView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
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
    redirect("/lobby?error=not_admin");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-950 py-16">
      <main className="mx-auto flex max-w-4xl flex-col gap-10 px-6">
        <header className="rounded-3xl border border-red-500/30 bg-red-500/10 p-8 text-white shadow-xl">
          <p className="text-sm uppercase tracking-widest text-red-200">
            Panel de Administración
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Administración</h1>
          <p className="mt-2 text-sm text-red-100/80">
            Gestiona las estadísticas del juego. ⚠️ Las acciones aquí son irreversibles.
          </p>
        </header>

        <AdminView />
      </main>
    </div>
  );
}

