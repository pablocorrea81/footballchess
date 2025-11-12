import "./globals.css";
import type { Metadata } from "next";

import { SupabaseListener } from "@/components/providers/SupabaseListener";
import { SupabaseProvider } from "@/components/providers/SupabaseProvider";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Football Chess",
  description:
    "Juego web multijugador de Football Chess con Supabase y Next.js.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <html lang="es">
      <body className="antialiased flex flex-col min-h-screen">
        <SupabaseProvider initialSession={session}>
          <SupabaseListener accessToken={session?.access_token ?? undefined} />
          <div className="flex-1">
            {children}
          </div>
          <footer className="border-t border-emerald-200 bg-white/80 py-6 mt-auto">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <p className="text-center text-sm text-emerald-900/80">
                Creado por Santino Correa
              </p>
            </div>
          </footer>
        </SupabaseProvider>
      </body>
    </html>
  );
}
