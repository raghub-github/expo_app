/**
 * User Avatar Utilities
 * 
 * Functions to get user profile images from various sources:
 * - Gmail profile pictures
 * - Gravatar
 * - Supabase user metadata
 */

import CryptoJS from "crypto-js";

/**
 * Generate MD5 hash for Gravatar
 */
function md5Hash(str: string): string {
  return CryptoJS.MD5(str.toLowerCase().trim()).toString();
}

/**
 * Get Gravatar URL for an email
 */
export function getGravatarUrl(email: string, size: number = 40): string {
  const hash = md5Hash(email);
  // Use d=mp so missing Gravatar returns 200 (silhouette), not 404 — avoids console noise and broken <img>.
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=mp&r=pg`;
}

/**
 * Check if email is a Gmail address
 */
export function isGmailEmail(email: string): boolean {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  return domain === "gmail.com" || domain === "googlemail.com";
}

/**
 * Deterministic pastel background color from a string (email).
 * Same input → same color across sessions, so an avatar looks stable.
 */
function stringToPastelColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  // 40% saturation, 55% lightness → readable, WCAG-decent contrast with white text.
  return `hsl(${hue}, 40%, 55%)`;
}

/**
 * Generate an inline SVG data URL for an initials avatar. Zero network requests,
 * zero external tracking, no browser Tracking Prevention warnings.
 */
export function generateInitialsAvatarDataUrl(
  seed: string,
  initials: string,
  size: number = 40,
): string {
  const bg = stringToPastelColor(seed);
  const fontSize = Math.floor(size * 0.42);
  const safeInitials = initials.slice(0, 2).replace(/[<>&"]/g, "");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="${bg}" rx="${size / 2}"/>` +
    `<text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" ` +
    `font-size="${fontSize}" font-weight="600" fill="#fff">${safeInitials}</text>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${typeof btoa === "function" ? btoa(svg) : Buffer.from(svg).toString("base64")}`;
}

/**
 * Get user avatar URL from multiple sources.
 * Priority:
 *   1. Supabase user metadata (avatar_url, picture, avatar — from Google OAuth)
 *   2. Locally-generated initials SVG data URL (no external requests)
 *
 * Gravatar was previously used as the fallback but triggered Edge Tracking
 * Prevention warnings and made every user card do a third-party network
 * request. The generated data URL avoids both.
 */
export function getUserAvatarUrl(
  email: string | null | undefined,
  userMetadata?: Record<string, any>,
  size: number = 40
): string | null {
  if (!email) return null;

  // First, check if avatar is in user metadata (from Supabase/Google OAuth)
  if (userMetadata?.avatar_url) return userMetadata.avatar_url;
  if (userMetadata?.picture) return userMetadata.picture;
  if (userMetadata?.avatar) return userMetadata.avatar;

  // Fallback — generated initials avatar (client-side, no network request).
  const initials = getUserInitials(userMetadata?.full_name ?? userMetadata?.name ?? null, email);
  return generateInitialsAvatarDataUrl(email, initials, size);
}

/**
 * Get user initials for fallback avatar
 */
export function getUserInitials(
  name: string | null | undefined,
  email: string | null | undefined
): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
  
  if (email) {
    return email.substring(0, 2).toUpperCase();
  }
  
  return "U";
}
