import "./globals.css";
import type { Metadata } from "next";

import { SupabaseListener } from "@/components/providers/SupabaseListener";
import { SupabaseProvider } from "@/components/providers/SupabaseProvider";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

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
      <body className="antialiased">
        <SupabaseProvider initialSession={session}>
          <SupabaseListener accessToken={session?.access_token ?? undefined} />
          {children}
        </SupabaseProvider>
      </body>
    </html>
  );
}
