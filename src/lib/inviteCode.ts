/**
 * Generate a unique invite code for games
 * Format: 6 characters, alphanumeric (uppercase), e.g., "ABC123"
 */
export function generateInviteCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  
  // Generate 6 random characters
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    code += chars[randomIndex];
  }
  
  return code;
}

/**
 * Validate invite code format
 * Must be exactly 6 alphanumeric characters (uppercase)
 */
export function isValidInviteCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code);
}

