import Link from "next/link";
import { MagicLinkForm } from "@/components/auth/MagicLinkForm";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect("/lobby");
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

