"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { useSupabase } from "@/components/providers/SupabaseProvider";

type ProfileViewProps = {
  profileId: string;
  initialUsername: string;
  initialAvatarUrl: string | null;
  initialShowMoveHints: boolean;
};

export function ProfileView({
  profileId,
  initialUsername,
  initialAvatarUrl,
  initialShowMoveHints,
}: ProfileViewProps) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [username, setUsername] = useState(initialUsername);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [showMoveHints, setShowMoveHints] = useState(initialShowMoveHints);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAvatarUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      try {
        setError(null);
        setSuccess(null);
        setUploading(true);

        if (!event.target.files || event.target.files.length === 0) {
          return;
        }

        const file = event.target.files[0];
        const fileExt = file.name.split(".").pop();
        const fileName = `${profileId}-${Math.random()}.${fileExt}`;
        const filePath = `${profileId}/${fileName}`;

        // Delete old avatar if it exists
        if (avatarUrl && avatarUrl.includes("/avatars/")) {
          const urlParts = avatarUrl.split("/avatars/");
          if (urlParts.length > 1) {
            const oldPath = urlParts[1].split("?")[0]; // Remove query params
            await supabase.storage.from("avatars").remove([oldPath]);
          }
        }

        // Upload new avatar
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: true,
          });

        if (uploadError) {
          throw uploadError;
        }

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from("avatars").getPublicUrl(filePath);

        setAvatarUrl(publicUrl);
        setSuccess("Avatar subido correctamente. No olvides guardar los cambios.");
      } catch (uploadError) {
        console.error("Error uploading avatar:", uploadError);
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "Error al subir el avatar",
        );
      } finally {
        setUploading(false);
      }
    },
    [profileId, avatarUrl, supabase],
  );

  const handleSave = useCallback(async () => {
    try {
      setError(null);
      setSuccess(null);
      setSaving(true);

      // Use API route to update profile to avoid TypeScript issues
      const response = await fetch("/api/profile/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          avatar_url: avatarUrl,
          show_move_hints: showMoveHints,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Error al actualizar el perfil");
      }

      setSuccess("Perfil actualizado correctamente.");
      router.refresh();
    } catch (updateError) {
      console.error("Error updating profile:", updateError);
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Error al actualizar el perfil",
      );
    } finally {
      setSaving(false);
    }
  }, [username, avatarUrl, showMoveHints, router]);

  const handleRemoveAvatar = useCallback(async () => {
    try {
      setError(null);
      setSuccess(null);
      setUploading(true);

      if (avatarUrl && avatarUrl.includes("/avatars/")) {
        const urlParts = avatarUrl.split("/avatars/");
        if (urlParts.length > 1) {
          const path = urlParts[1].split("?")[0]; // Remove query params
          await supabase.storage.from("avatars").remove([path]);
        }
      }

      setAvatarUrl(null);
      setSuccess("Avatar eliminado. No olvides guardar los cambios.");
    } catch (removeError) {
      console.error("Error removing avatar:", removeError);
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Error al eliminar el avatar",
      );
    } finally {
      setUploading(false);
    }
  }, [avatarUrl, supabase]);

  return (
    <div className="rounded-3xl border-2 border-emerald-200 bg-white/95 p-6 sm:p-8 lg:p-10 shadow-xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold text-emerald-950">
          Mi Perfil
        </h1>
        <Link
          href="/lobby"
          className="rounded-full border-2 border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50 hover:border-emerald-300"
        >
          ← Volver al Lobby
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border-2 border-rose-400 bg-rose-50 p-4 text-sm text-rose-800">
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-xl border-2 border-emerald-400 bg-emerald-50 p-4 text-sm text-emerald-800">
          ✅ {success}
        </div>
      )}

      <div className="space-y-6">
        {/* Avatar Section */}
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="h-24 w-24 rounded-full border-4 border-emerald-200 object-cover shadow-lg sm:h-32 sm:w-32"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-emerald-200 bg-emerald-100 text-3xl font-bold text-emerald-600 shadow-lg sm:h-32 sm:w-32 sm:text-4xl">
                  {username.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="avatar-upload"
                className="cursor-pointer rounded-full border-2 border-emerald-400 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 sm:text-sm"
              >
                {uploading ? "Subiendo..." : "📷 Subir Avatar"}
              </label>
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                disabled={uploading}
                className="hidden"
              />
              {avatarUrl && (
                <button
                  onClick={handleRemoveAvatar}
                  disabled={uploading}
                  className="rounded-full border-2 border-rose-400 bg-white px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 sm:text-sm"
                >
                  🗑️ Eliminar
                </button>
              )}
            </div>
          </div>
          <div className="flex-1">
            <p className="text-sm text-emerald-900/80">
              Sube una imagen para tu avatar. Formatos soportados: JPG, PNG, GIF.
              Tamaño máximo recomendado: 2MB.
            </p>
          </div>
        </div>

        {/* Username Section */}
        <div>
          <label
            htmlFor="username"
            className="block text-sm font-semibold text-emerald-950 mb-2"
          >
            Nombre de usuario
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-xl border-2 border-emerald-200 bg-white px-4 py-3 text-base text-emerald-950 placeholder-emerald-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            placeholder="Ingresa tu nombre de usuario"
            maxLength={50}
          />
          <p className="mt-2 text-xs text-emerald-900/60">
            Este nombre se mostrará en las partidas y en el lobby.
          </p>
        </div>

        {/* Show Move Hints Section */}
        <div className="flex items-center justify-between rounded-xl border-2 border-emerald-200 bg-white px-4 py-3">
          <div className="flex-1">
            <label
              htmlFor="show-move-hints"
              className="block text-sm font-semibold text-emerald-950 mb-1"
            >
              Mostrar ayuda de movimientos
            </label>
            <p className="text-xs text-emerald-900/60">
              Al pasar el mouse sobre una pieza durante 5 segundos, se mostrará una ayuda con los movimientos posibles.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              id="show-move-hints"
              type="checkbox"
              checked={showMoveHints}
              onChange={(e) => setShowMoveHints(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-emerald-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-emerald-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving || username.trim().length === 0}
            className="rounded-full border-2 border-emerald-400 bg-emerald-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {saving ? "Guardando..." : "💾 Guardar Cambios"}
          </button>
          {username.trim() !== initialUsername || avatarUrl !== initialAvatarUrl || showMoveHints !== initialShowMoveHints ? (
            <p className="text-xs text-emerald-900/60">
              Tienes cambios sin guardar
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

