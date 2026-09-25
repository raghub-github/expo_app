/**
 * Remove dead Expo / FCM tokens from all push-token tables.
 * Called when Expo or Firebase reports DeviceNotRegistered / invalid / unregistered.
 * Failures here must never break the send path.
 */
import { getSql } from "../../db/client.js";

export function isTerminalPushDeliveryError(code?: string | null, message?: string | null): boolean {
  const blob = `${code ?? ""} ${message ?? ""}`.toLowerCase();
  if (!blob.trim()) return false;
  // InvalidCredentials from Expo usually means the Expo project is missing an FCM
  // service-account upload (developer fault) — do NOT treat as a dead device token.
  if (blob.includes("invalidcredentials") || blob.includes("fcm server key")) {
    return false;
  }
  return (
    blob.includes("devicenotregistered") ||
    blob.includes("invalid-registration") ||
    blob.includes("registration-token-not-registered") ||
    blob.includes("unregistered") ||
    blob.includes("not-registered") ||
    blob.includes("requested entity was not found")
  );
}

export async function purgeInvalidPushTokens(tokens: string[]): Promise<void> {
  const unique = [...new Set(tokens.map((t) => t.trim()).filter(Boolean))];
  if (unique.length === 0) return;
  try {
    const sql = getSql();
    await sql`DELETE FROM public.expo_push_tokens WHERE expo_push_token = ANY(${unique}::text[])`;
    await sql`DELETE FROM public.merchant_store_push_tokens WHERE token = ANY(${unique}::text[])`;
    // Permanent FCM unregistration applies to Android and web rows. Leaving
    // unregistered web tokens in place made every later campaign retry them.
    const native = await sql`
      DELETE FROM public.native_device_push_tokens
      WHERE native_token = ANY(${unique}::text[])
      RETURNING id, platform
    `;
    console.warn(`[push] purged ${native.length} invalid native token(s)`);
  } catch (e) {
    console.warn("[push] dead token purge failed:", (e as Error).message);
  }
}
