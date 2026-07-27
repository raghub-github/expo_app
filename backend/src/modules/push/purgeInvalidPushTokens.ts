/**
 * Remove dead Expo / FCM tokens from all push-token tables.
 * Called when Expo or Firebase reports DeviceNotRegistered / invalid / unregistered.
 * Failures here must never break the send path.
 */
import { getSql } from "../../db/client.js";

export function isTerminalPushDeliveryError(code?: string | null, message?: string | null): boolean {
  const blob = `${code ?? ""} ${message ?? ""}`.toLowerCase();
  if (!blob.trim()) return false;
  return (
    blob.includes("devicenotregistered") ||
    blob.includes("invalidcredentials") ||
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
    await sql`DELETE FROM public.native_device_push_tokens WHERE native_token = ANY(${unique}::text[])`;
    console.warn(
      `[push] purged ${unique.length} invalid/unregistered push token(s) from DB`,
    );
  } catch (e) {
    console.warn("[push] dead token purge failed:", (e as Error).message);
  }
}
