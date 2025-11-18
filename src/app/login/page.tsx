import Link from "next/link";
import { MagicLinkForm } from "@/components/auth/MagicLinkForm";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";

type LoginPageProps = {
  searchParams?: Promise<{
    redirect?: string;
  }> | {
    redirect?: string;
  };
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Resolve searchParams if it's a Promise (Next.js 15+)
  const resolvedSearchParams = searchParams instanceof Promise ? await searchParams : searchParams;
  const redirectTo = resolvedSearchParams?.redirect;

  if (session) {
    // If there's a redirect parameter, use it; otherwise go to lobby
    if (redirectTo) {
      redirect(redirectTo);
    } else {
      redirect("/lobby");
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-sky-100 px-6 py-16">
      <MagicLinkForm redirectTo={redirectTo} />
      <Link
        href="/"
        className="mt-6 text-sm font-medium text-emerald-700 hover:text-emerald-900"
      >
        ← Volver al inicio
      </Link>
    </div>
  );
}

