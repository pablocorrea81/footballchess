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
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
    shortcut: "/icon.svg",
  },
  openGraph: {
    title: "Football Chess",
    description: "Juego web multijugador de Football Chess con Supabase y Next.js.",
    type: "website",
    images: [
      {
        url: "/icon.svg",
        width: 512,
        height: 512,
        alt: "Football Chess",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Football Chess",
    description: "Juego web multijugador de Football Chess con Supabase y Next.js.",
    images: ["/icon.svg"],
  },
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
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                <p className="text-center text-sm text-emerald-900/80">
                  Creado por Santino Correa
                </p>
                <a
                  href="mailto:santinocorreacaraballo@gmail.com?subject=Feedback%20-%20Football%20Chess&body=Hola%20Santino%2C%0A%0AMi%20feedback%20sobre%20Football%20Chess%3A%0A%0A"
                  className="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 hover:border-emerald-300 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  💬 Feedback
                </a>
              </div>
            </div>
          </footer>
        </SupabaseProvider>
      </body>
    </html>
  );
}
