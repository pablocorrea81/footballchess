export const dynamic = "force-dynamic";

export default function AuthCallbackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-950 p-6 text-white">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <span className="text-sm uppercase tracking-widest text-emerald-200">
          Football Chess
        </span>
        <h1 className="text-2xl font-semibold">Validando acceso…</h1>
        <p className="text-sm text-emerald-100/80">
          Estamos confirmando tu sesión segura. Serás redirigido automáticamente al
          lobby en unos segundos.
        </p>
      </div>
    </main>
  );
}
