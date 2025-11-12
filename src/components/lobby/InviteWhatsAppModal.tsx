"use client";

import { useState, useCallback } from "react";
import {
  generateWhatsAppInviteMessage,
  generateWhatsAppLink,
  normalizeUruguayanPhoneToWhatsApp,
} from "@/lib/whatsappUtils";

type InviteWhatsAppModalProps = {
  gameId: string;
  inviteCode: string | null;
  creatorName: string;
  onClose: () => void;
};

export function InviteWhatsAppModal({
  gameId,
  inviteCode,
  creatorName,
  onClose,
}: InviteWhatsAppModalProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const handlePhoneChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    
    // Remove all non-digit characters for processing
    const cleaned = value.replace(/\D/g, '');
    
    // Limit to 9 digits max (09 + 8 digits for Uruguayan format)
    if (cleaned.length > 9) {
      return;
    }
    
    // Format as user types: XXX XXX XXX (groups of 3)
    let formatted = '';
    if (cleaned.length === 0) {
      formatted = '';
    } else if (cleaned.length <= 3) {
      // First 3 digits: 092
      formatted = cleaned;
    } else if (cleaned.length <= 6) {
      // First 6 digits: 092 922
      formatted = `${cleaned.substring(0, 3)} ${cleaned.substring(3)}`;
    } else {
      // All 9 digits: 092 922 281
      formatted = `${cleaned.substring(0, 3)} ${cleaned.substring(3, 6)} ${cleaned.substring(6)}`;
    }
    
    setPhoneNumber(formatted);
    setError(null);
  }, []);

  const handleSendInvite = useCallback(() => {
    if (!inviteCode) {
      setError("No hay código de invitación disponible.");
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      // Remove all non-digit characters for normalization
      const cleanedPhone = phoneNumber.replace(/\D/g, '');
      
      if (!cleanedPhone || cleanedPhone.length < 9) {
        setError("Número de teléfono inválido. Ingresa 9 dígitos (ej: 092 922 281).");
        setIsValidating(false);
        return;
      }
      
      // Normalize phone number
      const normalized = normalizeUruguayanPhoneToWhatsApp(cleanedPhone);
      
      if (!normalized) {
        setError("Número de teléfono inválido. Ingresa un número uruguayo válido (debe empezar con 09 y tener 9 dígitos, ej: 092 922 281).");
        setIsValidating(false);
        return;
      }

      // Generate invite URL
      const inviteUrl = `${window.location.origin}/invite/${inviteCode}`;
      
      // Generate message
      const message = generateWhatsAppInviteMessage(inviteCode, inviteUrl, creatorName);
      
      // Generate WhatsApp link
      const whatsappLink = generateWhatsAppLink(normalized, message);
      
      // Open WhatsApp
      window.open(whatsappLink, '_blank');
      
      // Close modal after a short delay
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      console.error("Error sending WhatsApp invite:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Error al generar el link de WhatsApp. Por favor intenta de nuevo.",
      );
      setIsValidating(false);
    }
  }, [phoneNumber, inviteCode, creatorName, onClose]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && phoneNumber.trim()) {
      handleSendInvite();
    }
  }, [phoneNumber, handleSendInvite]);

  // Use phoneNumber directly (already formatted in handlePhoneChange)
  const displayPhone = phoneNumber;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-md rounded-3xl border-2 border-white/20 bg-gradient-to-br from-emerald-950/95 to-emerald-900/95 p-6 text-white shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-emerald-200 hover:text-white transition"
          aria-label="Cerrar"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mb-3 flex justify-center">
            <div className="rounded-full bg-green-500/20 p-4">
              <span className="text-4xl">💬</span>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Invitar por WhatsApp
          </h2>
          <p className="text-sm text-emerald-100/80">
            ¿A qué número quieres invitar?
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 rounded-xl border-2 border-red-400/60 bg-red-500/20 p-3 text-sm text-red-100">
            ⚠️ {error}
          </div>
        )}

        {/* Phone input */}
        <div className="mb-6">
          <label
            htmlFor="phone"
            className="block text-sm font-semibold text-emerald-100 mb-2"
          >
            Número de teléfono
          </label>
          <input
            id="phone"
            type="tel"
            value={displayPhone}
            onChange={handlePhoneChange}
            onKeyPress={handleKeyPress}
            placeholder="092 922 281"
            className="w-full rounded-xl border-2 border-emerald-200/30 bg-white/10 px-4 py-3 text-base text-white placeholder-emerald-200/50 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200/50 font-mono"
            autoFocus
            disabled={isValidating}
            maxLength={11} // XXX XXX XXX (11 characters with spaces: 3+1+3+1+3)
          />
          <p className="mt-2 text-xs text-emerald-200/60">
            Formato uruguayo: 092 922 281 (9 dígitos agrupados de 3 en 3)
          </p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isValidating}
            className="flex-1 rounded-full border-2 border-white/30 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20 hover:border-white/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            onClick={handleSendInvite}
            disabled={!phoneNumber.trim() || isValidating}
            className="flex-1 rounded-full border-2 border-green-400 bg-green-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isValidating ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Enviando...</span>
              </>
            ) : (
              <>
                <span>💬</span>
                <span>Abrir WhatsApp</span>
              </>
            )}
          </button>
        </div>

        {/* Info */}
        <div className="mt-4 rounded-xl bg-white/5 p-3 text-xs text-emerald-200/60">
          💡 El link se abrirá en WhatsApp Web o en la app de WhatsApp si está instalada en tu dispositivo.
        </div>
      </div>
    </div>
  );
}

