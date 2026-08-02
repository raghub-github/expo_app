/**
 * Cryptographically safe, human-readable referral codes.
 */

import { randomBytes } from "crypto";
import { getSql } from "../../db/client.js";
import type { ReferralUserType } from "./referral.config.service.js";
import { getReferralSettings } from "./referral.config.service.js";

/** Crockford-like alphabet without ambiguous chars (0/O, 1/I/L). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateSecureReferralCode(prefix: string, length = 8): string {
  const p = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const bytes = randomBytes(length);
  let body = "";
  for (let i = 0; i < length; i++) {
    body += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `${p}${body}`;
}

export async function isCodeBlacklisted(code: string): Promise<boolean> {
  const sql = getSql();
  const normalized = code.trim().toUpperCase();
  const rows = await sql<Array<{ ok: string }>>`
    SELECT 1::text AS ok FROM referral_code_blacklist
    WHERE ${normalized} LIKE UPPER(code_pattern)
       OR UPPER(code_pattern) = ${normalized}
    LIMIT 1
  `.catch(() => []);
  return rows.length > 0;
}

/**
 * Existing referral code for a user, if any. Checks the unified table first,
 * then the legacy customers/riders columns so already-registered users keep
 * the code they have been sharing.
 */
export async function findExistingReferralCode(
  userType: ReferralUserType,
  userId: number,
): Promise<string | null> {
  const sql = getSql();

  const [unified] = await sql<Array<{ referral_code: string }>>`
    SELECT referral_code
    FROM referral_codes
    WHERE user_type = ${userType}::referral_user_type
      AND user_id = ${userId}
      AND suspended = false
    LIMIT 1
  `.catch(() => [] as Array<{ referral_code: string }>);
  if (unified?.referral_code?.trim()) return unified.referral_code.trim().toUpperCase();

  if (userType === "customer") {
    const [row] = await sql<Array<{ referral_code: string | null }>>`
      SELECT referral_code FROM customers WHERE id = ${userId} LIMIT 1
    `;
    const code = row?.referral_code?.trim();
    return code ? code.toUpperCase() : null;
  }

  const [row] = await sql<Array<{ referral_code: string | null }>>`
    SELECT referral_code FROM riders WHERE id = ${userId} LIMIT 1
  `;
  const code = row?.referral_code?.trim();
  return code ? code.toUpperCase() : null;
}

/**
 * Reuse the user's existing code when present; only generate for users who
 * genuinely have none. Never rotates a code that is already in circulation.
 */
export async function getOrCreateReferralCode(
  userType: ReferralUserType,
  userId: number,
): Promise<string> {
  const existing = await findExistingReferralCode(userType, userId);
  if (existing) {
    // Keep the unified lookup table in sync without changing the code itself.
    const sql = getSql();
    await sql`
      INSERT INTO referral_codes (user_type, user_id, referral_code, active)
      VALUES (${userType}::referral_user_type, ${userId}, ${existing}, true)
      ON CONFLICT (referral_code) DO UPDATE
        SET user_type = EXCLUDED.user_type,
            user_id = EXCLUDED.user_id,
            active = true,
            updated_at = NOW()
    `.catch(() => undefined);
    return existing;
  }
  return allocateUniqueReferralCode(userType, userId);
}

export async function allocateUniqueReferralCode(
  userType: ReferralUserType,
  userId: number,
  opts?: { customCode?: string; admin?: boolean },
): Promise<string> {
  const settings = await getReferralSettings();
  const prefix =
    userType === "customer"
      ? settings.code_prefix_customer ?? "GM"
      : settings.code_prefix_rider ?? "RIDER";

  if (opts?.customCode) {
    if (!opts.admin) throw new Error("custom_code_admin_only");
    const code = opts.customCode.trim().toUpperCase();
    if (await isCodeBlacklisted(code)) throw new Error("code_blacklisted");
    await persistCode(userType, userId, code, true);
    return code;
  }

  const sql = getSql();
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generateSecureReferralCode(prefix, 8);
    if (await isCodeBlacklisted(code)) continue;
    const [exists] = await sql<Array<{ ok: string }>>`
      SELECT 1::text AS ok FROM referral_codes WHERE referral_code = ${code} LIMIT 1
    `;
    if (exists) continue;
    await persistCode(userType, userId, code, false);
    return code;
  }
  throw new Error("code_allocation_failed");
}

async function persistCode(
  userType: ReferralUserType,
  userId: number,
  code: string,
  isCustom: boolean,
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO referral_codes (user_type, user_id, referral_code, active, is_custom)
    VALUES (${userType}::referral_user_type, ${userId}, ${code}, true, ${isCustom})
    ON CONFLICT (user_type, user_id) DO UPDATE
      SET referral_code = EXCLUDED.referral_code,
          regenerated_from = referral_codes.referral_code,
          is_custom = EXCLUDED.is_custom,
          active = true,
          suspended = false,
          updated_at = NOW()
  `;

  if (userType === "customer") {
    await sql`UPDATE customers SET referral_code = ${code} WHERE id = ${userId}`.catch(
      () => undefined,
    );
  } else {
    await sql`UPDATE riders SET referral_code = ${code} WHERE id = ${userId}`.catch(
      () => undefined,
    );
  }
}

export async function regenerateReferralCode(
  userType: ReferralUserType,
  userId: number,
): Promise<string> {
  return allocateUniqueReferralCode(userType, userId);
}

export async function suspendReferralCode(
  userType: ReferralUserType,
  userId: number,
  suspend = true,
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE referral_codes
    SET suspended = ${suspend}, active = ${!suspend}, updated_at = NOW()
    WHERE user_type = ${userType}::referral_user_type AND user_id = ${userId}
  `;
}
