import Link from "next/link";

import { MagicLinkForm } from "@/components/auth/MagicLinkForm";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export default async function LoginPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 bg-gradient-to-br from-emerald-50 via-white to-sky-100 px-6">
        <div className="rounded-3xl border border-emerald-100 bg-white/90 p-8 text-center shadow-md">
          <h1 className="text-2xl font-semibold text-emerald-950">
            Ya estás autenticado
          </h1>
          <p className="mt-4 text-emerald-900/80">
            Continúa hacia el lobby para crear o unirte a una partida.
          </p>
          <Link
            href="/lobby"
            className="mt-6 inline-flex items-center rounded-full bg-emerald-600 px-5 py-2 text-white transition hover:bg-emerald-700"
          >
            Ir al lobby
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-sky-100 px-6 py-16">
      <MagicLinkForm />
      <Link
        href="/"
        className="mt-6 text-sm font-medium text-emerald-700 hover:text-emerald-900"
      >
        ← Volver al inicio
      </Link>
    </div>
  );
}

