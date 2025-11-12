/**
 * Normalize Uruguayan phone number to WhatsApp format
 * Formats accepted:
 * - 09X XXX XXX
 * - 09XXXXXXX
 * - +598XXXXXXXXX
 * - 598XXXXXXXXX
 * 
 * Returns: number in format 598XXXXXXXXX (without +)
 */
export function normalizeUruguayanPhoneToWhatsApp(phone: string): string | null {
  // Remove all spaces, dashes, parentheses, and other non-digit characters except +
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  
  // Remove + if present
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  
  // If starts with 598 (country code), remove it temporarily to process
  let hasCountryCode = false;
  if (cleaned.startsWith('598')) {
    cleaned = cleaned.substring(3);
    hasCountryCode = true;
  }
  
  // Remove leading 0 if present (Uruguayan local format)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  // Validate: should be 8 digits (Uruguayan mobile numbers are 8 digits after removing 0)
  if (!/^\d{8}$/.test(cleaned)) {
    return null;
  }
  
  // Validate: should start with 9 (Uruguayan mobile numbers start with 9)
  if (!cleaned.startsWith('9')) {
    return null;
  }
  
  // Return in WhatsApp format: 598XXXXXXXXX
  return `598${cleaned}`;
}

/**
 * Format phone number for display (Uruguayan format: 09X XXX XXX)
 */
export function formatUruguayanPhoneForDisplay(phone: string): string {
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');
  
  // If it's in international format (598XXXXXXXXX), convert to local
  if (cleaned.startsWith('598') && cleaned.length === 11) {
    const local = cleaned.substring(3); // Remove 598
    return `0${local.substring(0, 1)} ${local.substring(1, 4)} ${local.substring(4, 7)} ${local.substring(7)}`;
  }
  
  // If it's already in local format (09XXXXXXXX), format it
  if (cleaned.length === 9 && cleaned.startsWith('0')) {
    return `${cleaned.substring(0, 2)} ${cleaned.substring(2, 5)} ${cleaned.substring(5, 8)} ${cleaned.substring(8)}`;
  }
  
  // If it's 8 digits, add 0 prefix
  if (cleaned.length === 8) {
    return `0${cleaned.substring(0, 1)} ${cleaned.substring(1, 4)} ${cleaned.substring(4, 7)} ${cleaned.substring(7)}`;
  }
  
  return phone;
}

/**
 * Generate WhatsApp invitation message
 */
export function generateWhatsAppInviteMessage(inviteCode: string, inviteUrl: string, gameCreator?: string): string {
  const creatorText = gameCreator ? ` ${gameCreator} te invita` : '';
  return `¡Hola!${creatorText} a jugar Football Chess 🎮⚽

Código de invitación: ${inviteCode}

Haz clic en este link para unirte a la partida:
${inviteUrl}

¡Nos vemos en el campo! ⚽🎮`;
}

/**
 * Generate WhatsApp Web/App link
 */
export function generateWhatsAppLink(phoneNumber: string, message: string): string {
  // Ensure phone number is in correct format (598XXXXXXXXX)
  const normalizedPhone = normalizeUruguayanPhoneToWhatsApp(phoneNumber);
  if (!normalizedPhone) {
    throw new Error('Número de teléfono inválido');
  }
  
  // Encode message for URL
  const encodedMessage = encodeURIComponent(message);
  
  // Return WhatsApp link (works for both web and app)
  return `https://wa.me/${normalizedPhone}?text=${encodedMessage}`;
}

