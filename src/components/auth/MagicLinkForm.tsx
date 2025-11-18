"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useSupabase } from "@/components/providers/SupabaseProvider";

type MagicLinkFormProps = {
  redirectTo?: string;
};

export function MagicLinkForm({ redirectTo }: MagicLinkFormProps) {
  const { session } = useSupabase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = redirectTo || searchParams?.get("redirect");
  const [email, setEmail] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "sending-otp" | "verifying-otp" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      // If there's a redirect parameter, use it; otherwise go to lobby
      if (redirectParam) {
        router.replace(redirectParam);
      } else {
        router.replace("/lobby");
      }
    }
  }, [session, router, redirectParam]);

  const handleSendOTP = async () => {
    if (!email || !email.includes("@")) {
      setMessage("Por favor ingresa un email válido");
      setStatus("error");
      return;
    }

    setStatus("sending-otp");
    setMessage(null);

    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus("error");
        setMessage(data.error ?? "No se pudo enviar el código");
        return;
      }

      setOtpSent(true);
      setStatus("idle");
      setMessage(data.message ?? "Código enviado a tu correo. Revisa tu bandeja de entrada.");
    } catch (error) {
      console.error("[magic-link] send OTP error", error);
      setStatus("error");
      setMessage("Error al enviar el código. Intenta nuevamente.");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    // If access code is provided, use direct login
    if (accessCode && accessCode.trim() !== "") {
      setStatus("loading");
      
      const response = await fetch("/api/auth/direct-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          email, 
          accessCode,
          redirectTo: redirectParam || undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setStatus("error");
        setMessage(payload?.error ?? "No se pudo validar el acceso.");
        console.error("[magic-link] direct login failed", payload);
        return;
      }

      const { actionLink } = (await response.json()) as { actionLink: string };

      if (!actionLink) {
        setStatus("error");
        setMessage("No se pudo generar el enlace de acceso.");
        console.error("[magic-link] missing action link");
        return;
      }

      setStatus("success");
      setMessage("Acceso concedido, redirigiendo al acceso seguro…");
      console.log("[magic-link] redirecting to action link");
      window.location.href = actionLink;
      return;
    }

    // If OTP code is provided, verify it
    if (otpCode && otpCode.trim() !== "") {
      setStatus("verifying-otp");

      try {
        const response = await fetch("/api/auth/verify-otp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            token: otpCode,
            redirectTo: redirectParam || undefined,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setStatus("error");
          setMessage(data.error ?? "Código inválido o expirado");
          return;
        }

        if (data.actionLink) {
          setStatus("success");
          setMessage("Acceso concedido, redirigiendo…");
          window.location.href = data.actionLink;
        } else {
          setStatus("error");
          setMessage("No se pudo completar el acceso.");
        }
      } catch (error) {
        console.error("[magic-link] verify OTP error", error);
        setStatus("error");
        setMessage("Error al verificar el código. Intenta nuevamente.");
      }
      return;
    }

    // If neither code is provided, show error
    setStatus("error");
    setMessage("Por favor ingresa el código de acceso o solicita un código por email");
  };

  return session ? null : (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-emerald-100 bg-white/90 p-6 shadow-md"
    >
      <h1 className="text-2xl font-semibold text-emerald-950">
        Iniciar sesión
      </h1>
      <p className="text-emerald-900/80">
        Ingresa tu correo y elige una forma de acceso:
      </p>
      
      <label className="flex flex-col gap-2 text-sm text-emerald-900/80">
        Correo electrónico
        <input
          type="email"
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            // Reset OTP state when email changes
            if (otpSent) {
              setOtpSent(false);
              setOtpCode("");
            }
          }}
          className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-base text-emerald-950 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          placeholder="tu@correo.com"
          autoComplete="email"
          disabled={status === "loading" || status === "verifying-otp" || status === "sending-otp"}
        />
      </label>

      {/* Access Code Option */}
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-2 text-sm text-emerald-900/80">
          <span>Código de acceso (opcional)</span>
          <span className="text-xs text-emerald-700/70">Usa el código compartido del equipo</span>
          <input
            type="password"
            value={accessCode}
            onChange={(event) => {
              setAccessCode(event.target.value);
              // Clear OTP when access code is entered
              if (event.target.value.trim() !== "") {
                setOtpCode("");
                setOtpSent(false);
              }
            }}
            className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-base text-emerald-950 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            placeholder="DonBosco2013"
            autoComplete="current-password"
            disabled={status === "loading" || status === "verifying-otp" || status === "sending-otp" || otpSent}
          />
        </label>
      </div>

      {/* OTP Option */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 border-t border-emerald-200"></div>
          <span className="text-xs text-emerald-700/70">O</span>
          <div className="flex-1 border-t border-emerald-200"></div>
        </div>
        
        {!otpSent ? (
          <button
            type="button"
            onClick={handleSendOTP}
            disabled={!email || !email.includes("@") || status === "loading" || status === "sending-otp" || status === "verifying-otp" || accessCode.trim() !== ""}
            className="rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "sending-otp" ? "Enviando..." : "Enviar código por email"}
          </button>
        ) : (
          <label className="flex flex-col gap-2 text-sm text-emerald-900/80">
            <span>Código recibido por email</span>
            <input
              type="text"
              value={otpCode}
              onChange={(event) => {
                // Only allow numbers, max 8 digits (Supabase sends 8-digit codes)
                const value = event.target.value.replace(/\D/g, "").slice(0, 8);
                setOtpCode(value);
                // Clear access code when OTP is entered
                if (value.trim() !== "") {
                  setAccessCode("");
                }
              }}
              className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-base text-emerald-950 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 text-center text-2xl tracking-widest"
              placeholder="00000000"
              maxLength={8}
              disabled={status === "loading" || status === "verifying-otp" || status === "sending-otp"}
            />
            <button
              type="button"
              onClick={handleSendOTP}
              disabled={status === "sending-otp"}
              className="text-xs text-emerald-600 hover:text-emerald-800 underline self-start"
            >
              {status === "sending-otp" ? "Reenviando..." : "Reenviar código"}
            </button>
          </label>
        )}
      </div>

      <button
        type="submit"
        disabled={status === "loading" || status === "verifying-otp" || status === "sending-otp" || (!accessCode.trim() && !otpCode.trim())}
        className="rounded-xl bg-emerald-600 px-4 py-2 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
      >
        {status === "loading" ? "Validando..." : status === "verifying-otp" ? "Verificando código..." : status === "sending-otp" ? "Enviando..." : "Ingresar"}
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

