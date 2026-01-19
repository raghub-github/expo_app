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
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404&r=pg`;
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
 * Get user avatar URL from multiple sources
 * Priority:
 * 1. Supabase user metadata (avatar_url, picture, avatar - from Google OAuth)
 * 2. Google profile picture API (for Gmail users)
 * 3. Gravatar (works for any email)
 * 4. null (fallback to default icon)
 */
export function getUserAvatarUrl(
  email: string | null | undefined,
  userMetadata?: Record<string, any>,
  size: number = 40
): string | null {
  if (!email) return null;

  // First, check if avatar is in user metadata (from Supabase/Google OAuth)
  // Supabase stores Google profile pictures in different fields
  if (userMetadata?.avatar_url) {
    return userMetadata.avatar_url;
  }
  if (userMetadata?.picture) {
    return userMetadata.picture;
  }
  if (userMetadata?.avatar) {
    return userMetadata.avatar;
  }

  // For Gmail users, try to get profile picture from Google
  // Note: This requires the user to be logged in via Google OAuth
  // If they're not, we'll fall back to Gravatar
  if (isGmailEmail(email)) {
    // Try Google profile picture API (this works if user logged in via Google)
    // Format: https://lh3.googleusercontent.com/a/{identifier}
    // But we need the identifier from OAuth, which should be in metadata
    
    // If we have app_metadata from Google OAuth, we can construct the URL
    // For now, we'll try Gravatar first, then fall back
  }

  // Try Gravatar (works for Gmail and other emails if they have Gravatar)
  return getGravatarUrl(email, size);
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
