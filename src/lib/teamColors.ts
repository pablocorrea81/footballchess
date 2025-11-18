/**
 * Utility functions for team colors and piece styling
 */

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Calculate color distance using Euclidean distance in RGB space
 * Returns a value between 0 (identical) and ~441 (maximum difference)
 */
function colorDistance(
  color1: string,
  color2: string,
): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!rgb1 || !rgb2) {
    return 0;
  }

  const dr = rgb1.r - rgb2.r;
  const dg = rgb1.g - rgb2.g;
  const db = rgb1.b - rgb2.b;

  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Check if two colors are too similar (threshold: 50 in RGB space)
 */
export function areColorsTooSimilar(
  color1: string | null,
  color2: string | null,
): boolean {
  if (!color1 || !color2) {
    return false;
  }

  // Normalize colors (ensure they start with #)
  const normalized1 = color1.startsWith("#") ? color1 : `#${color1}`;
  const normalized2 = color2.startsWith("#") ? color2 : `#${color2}`;

  const distance = colorDistance(normalized1, normalized2);
  return distance < 50; // Threshold for "too similar"
}

/**
 * Generate an alternative color for away team when colors are too similar
 * Creates a darker/lighter version with better contrast
 */
export function generateAlternativeColor(
  originalColor: string | null,
  isPrimary: boolean = true,
): string {
  if (!originalColor) {
    // Default colors if no team color
    return isPrimary ? "#3b82f6" : "#1e40af"; // Blue shades
  }

  const normalized = originalColor.startsWith("#") ? originalColor : `#${originalColor}`;
  const rgb = hexToRgb(normalized);

  if (!rgb) {
    return normalized;
  }

  // Create an alternative by:
  // 1. Inverting brightness significantly (darker if light, lighter if dark)
  // 2. Adding a slight hue shift for better differentiation
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  const isLight = brightness > 128;

  if (isLight) {
    // Make it significantly darker (for better contrast)
    const factor = 0.5;
    return `#${Math.round(rgb.r * factor)
      .toString(16)
      .padStart(2, "0")}${Math.round(rgb.g * factor)
      .toString(16)
      .padStart(2, "0")}${Math.round(rgb.b * factor)
      .toString(16)
      .padStart(2, "0")}`;
  } else {
    // Make it significantly lighter (for better contrast)
    const factor = 1.6;
    return `#${Math.min(255, Math.round(rgb.r * factor))
      .toString(16)
      .padStart(2, "0")}${Math.min(255, Math.round(rgb.g * factor))
      .toString(16)
      .padStart(2, "0")}${Math.min(255, Math.round(rgb.b * factor))
      .toString(16)
      .padStart(2, "0")}`;
  }
}

/**
 * Get piece colors for home and away teams
 * Returns colors with fallbacks and alternative colors if needed
 */
export function getPieceColors(
  homePrimary: string | null,
  homeSecondary: string | null,
  awayPrimary: string | null,
  awaySecondary: string | null,
): {
  home: { bg: string; border: string; text: string };
  away: { bg: string; border: string; text: string };
} {
  // Default colors
  const defaultHomePrimary = "#10b981"; // emerald-500
  const defaultHomeSecondary = "#d1fae5"; // emerald-200
  const defaultAwayPrimary = "#0ea5e9"; // sky-500
  const defaultAwaySecondary = "#bae6fd"; // sky-200

  // Use team colors or defaults
  const homePrimaryColor = homePrimary || defaultHomePrimary;
  const homeSecondaryColor = homeSecondary || defaultHomeSecondary;
  let awayPrimaryColor = awayPrimary || defaultAwayPrimary;
  let awaySecondaryColor = awaySecondary || defaultAwaySecondary;

  // Check if colors are too similar
  const primaryTooSimilar = areColorsTooSimilar(homePrimaryColor, awayPrimaryColor);
  const secondaryTooSimilar = areColorsTooSimilar(
    homeSecondaryColor,
    awaySecondaryColor,
  );

  // Generate alternative colors for away team if needed
  if (primaryTooSimilar || secondaryTooSimilar) {
    if (primaryTooSimilar) {
      awayPrimaryColor = generateAlternativeColor(awayPrimaryColor, true);
    }
    if (secondaryTooSimilar) {
      awaySecondaryColor = generateAlternativeColor(awaySecondaryColor, false);
    }
  }

  // Determine text color based on background brightness
  const getTextColor = (bgColor: string): string => {
    const rgb = hexToRgb(bgColor);
    if (!rgb) return "#1f2937"; // Default dark text

    const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
    return brightness > 128 ? "#1f2937" : "#ffffff"; // Dark text for light bg, white for dark bg
  };

  return {
    home: {
      bg: homePrimaryColor,
      border: homeSecondaryColor,
      text: getTextColor(homePrimaryColor),
    },
    away: {
      bg: awayPrimaryColor,
      border: awaySecondaryColor,
      text: getTextColor(awayPrimaryColor),
    },
  };
}

/**
 * Convert hex color to Tailwind-compatible RGB for use in className
 * Returns format: rgb(r, g, b) for use in style prop
 */
export function hexToRgbString(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "rgb(16, 185, 129)"; // Default emerald-500
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

