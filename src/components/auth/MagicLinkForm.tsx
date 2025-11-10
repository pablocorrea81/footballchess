"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useSupabase } from "@/components/providers/SupabaseProvider";

export function MagicLinkForm() {
  const { supabase, session } = useSupabase();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      router.replace("/lobby");
    }
  }, [session, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");
    setMessage(null);

    const response = await fetch("/api/auth/direct-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, accessCode }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setStatus("error");
      setMessage(payload?.error ?? "No se pudo validar el acceso.");
      return;
    }

    const { emailOtp } = (await response.json()) as { emailOtp: string };

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: emailOtp,
      type: "magiclink",
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    if (data?.session) {
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }

    setStatus("success");
    setMessage("Acceso concedido, redirigiendo al lobby…");
    await supabase.auth.getSession();
    router.replace("/lobby");
    router.refresh();
  };

  return session ? null : (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-emerald-100 bg-white/90 p-6 shadow-md"
    >
      <h1 className="text-2xl font-semibold text-emerald-950">
        Acceso con código
      </h1>
      <p className="text-emerald-900/80">
        Ingresa tu correo para identificarte y el código compartido del equipo.
      </p>
      <label className="flex flex-col gap-2 text-sm text-emerald-900/80">
        Correo electrónico
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-base text-emerald-950 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          placeholder="tu@correo.com"
          autoComplete="email"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm text-emerald-900/80">
        Código de acceso
        <input
          type="password"
          required
          value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
          className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-base text-emerald-950 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          placeholder="Ingresa el código"
          autoComplete="current-password"
        />
      </label>
      <button
        type="submit"
        disabled={status === "loading"}
        className="rounded-xl bg-emerald-600 px-4 py-2 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
      >
        {status === "loading" ? "Validando..." : "Ingresar"}
      </button>
      {message && (
        <p
          className={`text-sm ${
            status === "error" ? "text-red-600" : "text-emerald-700"
          }`}
        >
          {message}
        </p>
      )}
    </form>
  );
}

