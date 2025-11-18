/**
 * Normalize phone number to WhatsApp format (international)
 * Formats accepted:
 * - International: +1234567890, 1234567890 (with country code)
 * - Uruguayan: 09X XXX XXX, 09XXXXXXX, +598XXXXXXXXX, 598XXXXXXXXX
 * - Other countries: +[country code][number]
 * 
 * Returns: number in format [country code][number] (without +)
 * WhatsApp format: country code + number (max 15 digits total)
 */
export function normalizePhoneToWhatsApp(phone: string): string | null {
  // Remove all spaces, dashes, parentheses, and other non-digit characters except +
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  
  // Remove + if present (we'll add it back in the format)
  const hadPlus = cleaned.startsWith('+');
  if (hadPlus) {
    cleaned = cleaned.substring(1);
  }
  
  // Remove all non-digit characters
  cleaned = cleaned.replace(/\D/g, '');
  
  // WhatsApp phone numbers must be between 7 and 15 digits (including country code)
  if (cleaned.length < 7 || cleaned.length > 15) {
    return null;
  }
  
  // Handle Uruguayan local format (09X...)
  if (cleaned.startsWith('09') && cleaned.length === 9) {
    // Uruguayan format: remove leading 0 and add country code 598
    return `598${cleaned.substring(1)}`;
  }
  
  // Handle other numbers starting with 0 (might be local format)
  // For 9-digit numbers starting with 0, assume Uruguayan
  if (cleaned.startsWith('0') && cleaned.length === 9) {
    return `598${cleaned.substring(1)}`;
  }
  
  // Handle numbers without leading 0 (likely already have country code)
  if (!cleaned.startsWith('0')) {
    // Numbers 10-15 digits: definitely have country code
    if (cleaned.length >= 10 && cleaned.length <= 15) {
      return cleaned;
    }
    
    // Numbers 8-9 digits: might have country code or be local
    // If 8 digits starting with 9, assume Uruguayan (needs country code)
    if (cleaned.length === 8 && cleaned.startsWith('9')) {
      return `598${cleaned}`;
    }
    
    // If 8-9 digits but not starting with 9, might be local format
    // Return as-is (user should have provided country code with +)
    if (cleaned.length >= 8 && cleaned.length <= 9) {
      return cleaned;
    }
    
    // Numbers 7 digits: too short, need country code
    if (cleaned.length === 7) {
      return null;
    }
  }
  
  // For numbers 7-9 digits starting with 0 or other patterns, return null
  // User needs to provide country code explicitly
  if (cleaned.length >= 7 && cleaned.length <= 9) {
    return null;
  }
  
  // For any other case (shouldn't happen with valid input), return cleaned
  return cleaned;
}

/**
 * Normalize Uruguayan phone number to WhatsApp format (legacy function for backward compatibility)
 * @deprecated Use normalizePhoneToWhatsApp instead for international support
 */
export function normalizeUruguayanPhoneToWhatsApp(phone: string): string | null {
  return normalizePhoneToWhatsApp(phone);
}

/**
 * Format phone number for display (international format)
 * Formats numbers with country code and groups digits for readability
 * For Uruguayan numbers: shows local format (09X XXX XXX) without country code
 */
export function formatPhoneForDisplay(phone: string): string {
  // Preserve the + sign and allowed characters
  // Allow +, digits, spaces, dashes, parentheses
  let formatted = phone.replace(/[^\d\+\s\-\(\)]/g, '');
  
  // If it starts with +, preserve it
  const hasPlus = formatted.trim().startsWith('+');
  
  // Remove all non-digits except +
  let cleaned = formatted.replace(/[\s\-\(\)]/g, '');
  
  // Remove + temporarily for processing
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  
  // Remove all non-digits
  cleaned = cleaned.replace(/\D/g, '');
  
  // If empty, return as-is
  if (!cleaned) {
    return formatted;
  }
  
  // Handle Uruguayan numbers: show in local format (09X XXX XXX) without country code
  // If it's a Uruguayan number with country code (598 + 8 digits), convert to local format
  if (cleaned.startsWith('598') && cleaned.length === 11) {
    const local = cleaned.substring(3); // Remove 598 (8 digits)
    // Format as 09X XXX XXX (local Uruguayan format)
    return `09${local.substring(0, 1)} ${local.substring(1, 4)} ${local.substring(4)}`;
  }
  
  // If it's already in Uruguayan local format (09X...), format as 09X XXX XXX
  if (cleaned.startsWith('09') && cleaned.length === 9) {
    return `${cleaned.substring(0, 3)} ${cleaned.substring(3, 6)} ${cleaned.substring(6)}`;
  }
  
  // If it's 8 digits starting with 9 (Uruguayan without leading 0), add the 0 and format
  if (cleaned.length === 8 && cleaned.startsWith('9')) {
    return `09${cleaned.substring(0, 1)} ${cleaned.substring(1, 4)} ${cleaned.substring(4)}`;
  }
  
  // For numbers with country code, detect and format
  if (cleaned.length >= 10) {
    let countryCode = '';
    let number = cleaned;
    
    // Try 3-digit country codes first (598, 351, etc.)
    const threeDigitCodes = ['598', '351', '352', '353', '354', '355', '356', '357', '358', '359'];
    if (cleaned.length >= 11) {
      const firstThree = cleaned.substring(0, 3);
      if (threeDigitCodes.includes(firstThree)) {
        countryCode = firstThree;
        number = cleaned.substring(3);
      }
    }
    
    // Try 2-digit country codes if 3-digit didn't match
    if (!countryCode && cleaned.length >= 11) {
      const twoDigitCodes = ['44', '34', '33', '39', '49', '52', '54', '55', '56', '57', '58', '51', '53', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98'];
      const firstTwo = cleaned.substring(0, 2);
      if (twoDigitCodes.includes(firstTwo)) {
        countryCode = firstTwo;
        number = cleaned.substring(2);
      }
    }
    
    // Try 1-digit country code (US/Canada) if 2-digit didn't match
    if (!countryCode && cleaned.length >= 10) {
      if (cleaned.startsWith('1') && (cleaned.length === 11 || cleaned.length === 10)) {
        countryCode = '1';
        number = cleaned.substring(1);
      }
    }
    
    // If we detected a country code, format it
    if (countryCode && number) {
      // Format the number part with spaces (every 3-4 digits)
      const numberParts: string[] = [];
      for (let i = 0; i < number.length; i += 3) {
        numberParts.push(number.substring(i, i + 3));
      }
      const formattedNumber = numberParts.join(' ');
      return `+${countryCode} ${formattedNumber}`;
    }
    
    // If no country code detected but number is long, assume it has one
    // Format as international with first 1-3 digits as country code
    if (cleaned.length >= 12) {
      // Likely has country code, format with first 1-3 digits
      const likelyCountryCode = cleaned.substring(0, cleaned.length >= 13 ? 3 : cleaned.length >= 11 ? 2 : 1);
      const likelyNumber = cleaned.substring(likelyCountryCode.length);
      const numberParts: string[] = [];
      for (let i = 0; i < likelyNumber.length; i += 3) {
        numberParts.push(likelyNumber.substring(i, i + 3));
      }
      return `+${likelyCountryCode} ${numberParts.join(' ')}`;
    }
  }
  
  // For shorter numbers (likely local format), format in groups
  if (cleaned.length > 6) {
    // Format in groups of 3
    const groups: string[] = [];
    for (let i = 0; i < cleaned.length; i += 3) {
      groups.push(cleaned.substring(i, i + 3));
    }
    return hasPlus ? `+${groups.join(' ')}` : groups.join(' ');
  } else if (cleaned.length > 3) {
    return hasPlus ? `+${cleaned.substring(0, 3)} ${cleaned.substring(3)}` : `${cleaned.substring(0, 3)} ${cleaned.substring(3)}`;
  }
  
  return hasPlus ? `+${cleaned}` : cleaned;
}

/**
 * Format phone number for display (Uruguayan format - legacy function)
 * @deprecated Use formatPhoneForDisplay instead for international support
 */
export function formatUruguayanPhoneForDisplay(phone: string): string {
  return formatPhoneForDisplay(phone);
}

/**
 * Generate WhatsApp invitation message
 * Uses ⚽ emoji for better compatibility with WhatsApp
 * The soccer ball emoji is widely supported and should render correctly
 */
export function generateWhatsAppInviteMessage(inviteCode: string, inviteUrl: string, gameCreator?: string): string {
  const creatorText = gameCreator ? `${gameCreator} te invita a ` : '';
  // Using ⚽ emoji throughout - it's widely supported by WhatsApp
  return `⚽ ¡Hola! ${creatorText}jugar Football Chess ⚽

⚽ Código de invitación: ${inviteCode} ⚽

Haz clic en este link para unirte a la partida:

${inviteUrl}

⚽ ¡Nos vemos en el campo! ⚽`;
}

/**
 * Generate WhatsApp Web/App link
 */
export function generateWhatsAppLink(phoneNumber: string, message: string): string {
  // Normalize phone number to international format
  // This will automatically add 598 for Uruguayan numbers (09X format)
  // For other countries, it expects the country code to be provided
  const normalizedPhone = normalizePhoneToWhatsApp(phoneNumber);
  if (!normalizedPhone) {
    throw new Error('Número de teléfono inválido. Para Uruguay: usa formato 09X XXX XXX. Para otros países: incluye el código de país (ej: +1 234 567 8900 para US/Canadá)');
  }
  
  // Encode message for URL
  const encodedMessage = encodeURIComponent(message);
  
  // Return WhatsApp link (works for both web and app)
  return `https://wa.me/${normalizedPhone}?text=${encodedMessage}`;
}

