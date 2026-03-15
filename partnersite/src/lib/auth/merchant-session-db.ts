/**
 * Merchant session table: one active session per device (enforced by DB unique index).
 * - Same device_id always comes from client (localStorage) or cookie so it is stable.
 * - On login: replace session for this device (deactivate existing, insert one).
 * - On logout (this device only): deactivate this device's session; do not invalidate others.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const SESSION_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

/** Deactivate all active sessions for this device_id. */
export async function deactivateSessionsForDevice(deviceId: string): Promise<void> {
  const db = getSupabase();
  const { error } = await db
    .from("merchant_sessions")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("device_id", deviceId)
    .eq("is_active", true);
  if (error) {
    console.error("[merchant-session-db] deactivateSessionsForDevice error:", error);
  }
}

/**
 * Replace session for this device: deactivate any existing, then insert one.
 * Uses unique index (device_id WHERE is_active = true) so only one active per device.
 * If two requests race, one insert may get unique violation — we treat as success (other request won).
 */
export async function replaceSessionForDevice(
  deviceId: string,
  merchantId: number
): Promise<{ id: string; expiresAt: string }> {
  const db = getSupabase();
  await deactivateSessionsForDevice(deviceId);

  const expiresAt = new Date(Date.now() + SESSION_TTL_SEC * 1000).toISOString();
  const { data, error } = await db
    .from("merchant_sessions")
    .insert({
      merchant_id: merchantId,
      device_id: deviceId,
      refresh_token_hash: null,
      expires_at: expiresAt,
      is_active: true,
    })
    .select("id, expires_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      // unique_violation: another request already inserted for this device
      const { data: existing } = await db
        .from("merchant_sessions")
        .select("id, expires_at")
        .eq("device_id", deviceId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (existing) return { id: existing.id, expiresAt: existing.expires_at };
    }
    console.error("[merchant-session-db] replaceSessionForDevice insert error:", error);
    throw new Error("Failed to create session");
  }
  return { id: data.id, expiresAt: data.expires_at };
}

/** Legacy: create after deactivate (call replaceSessionForDevice instead). */
export async function createMerchantSession(params: {
  merchantId: number;
  deviceId: string;
  refreshTokenHash?: string | null;
}): Promise<{ id: string; expiresAt: string }> {
  return replaceSessionForDevice(params.deviceId, params.merchantId);
}

/** Deactivate only this device (logout this device; other devices stay logged in). */
export async function deactivateSessionForDevice(deviceId: string): Promise<void> {
  return deactivateSessionsForDevice(deviceId);
}

export async function hasActiveSessionForDevice(
  merchantId: number,
  deviceId: string
): Promise<boolean> {
  if (!merchantId || !deviceId?.trim()) return false;
  const db = getSupabase();
  const { data, error } = await db
    .from("merchant_sessions")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("device_id", deviceId.trim())
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return !!data?.id;
}

/** Server-side fallback only; client should send device_id in body. */
export function generateDeviceId(): string {
  return `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}
