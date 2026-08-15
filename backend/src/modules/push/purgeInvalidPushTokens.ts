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
    // Keep partnersite / dashboard web FCM tokens. Local Firebase misconfig often
    // returns NOT_FOUND once; wiping them leaves the browser panel with no push
    // channel until the next hard refresh — while phone Expo tokens still work.
    const native = await sql`
      DELETE FROM public.native_device_push_tokens
      WHERE native_token = ANY(${unique}::text[])
        AND lower(coalesce(platform, '')) <> 'web'
        AND lower(coalesce(source, '')) NOT IN ('partnersite', 'browser', 'dashboard')
      RETURNING id
    `;
    const kept = await sql`
      SELECT count(*)::int AS c
      FROM public.native_device_push_tokens
      WHERE native_token = ANY(${unique}::text[])
        AND (
          lower(coalesce(platform, '')) = 'web'
          OR lower(coalesce(source, '')) IN ('partnersite', 'browser', 'dashboard')
        )
    `;
    const keptN = Number((kept[0] as { c?: number } | undefined)?.c ?? 0);
    console.warn(
      `[push] purged ${native.length} invalid native token(s)` +
        (keptN > 0 ? ` (kept ${keptN} web/partnersite token(s))` : ""),
    );
  } catch (e) {
    console.warn("[push] dead token purge failed:", (e as Error).message);
  }
}
