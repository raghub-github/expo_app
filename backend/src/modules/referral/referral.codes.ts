/**
 * Cryptographically safe, human-readable referral codes.
 *
 * Already-registered riders/customers keep the code on their profile.
 * The unified `referral_codes` table is a lookup sync — it must never rotate
 * a published code during normal /me access.
 */

import { randomBytes } from "crypto";
import { getSql } from "../../db/client.js";
import type { ReferralUserType } from "./referral.config.service.js";
import { getReferralSettings } from "./referral.config.service.js";
import { codePrefixFor, referralTrackingEnabled } from "./referral.participants.js";
import { REFERRAL_SERVICE_DISABLED } from "./referral.errors.js";

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

function looksEngineGenerated(code: string, prefix: string): boolean {
  const p = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "RIDER";
  return new RegExp(`^${p}[A-HJ-NP-Z2-9]{6,}$`).test(code.trim().toUpperCase());
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

async function findProfileReferralCode(
  userType: ReferralUserType,
  userId: number,
): Promise<string | null> {
  const sql = getSql();
  if (userType === "customer") {
    const [row] = await sql<Array<{ referral_code: string | null }>>`
      SELECT referral_code FROM customers WHERE id = ${userId} LIMIT 1
    `.catch(() => [] as Array<{ referral_code: string | null }>);
    const code = row?.referral_code?.trim();
    return code ? code.toUpperCase() : null;
  }
  if (userType === "rider") {
    const [row] = await sql<Array<{ referral_code: string | null }>>`
      SELECT referral_code FROM riders WHERE id = ${userId} LIMIT 1
    `.catch(() => [] as Array<{ referral_code: string | null }>);
    const code = row?.referral_code?.trim();
    return code ? code.toUpperCase() : null;
  }
  const [row] = await sql<Array<{ referral_code: string | null }>>`
    SELECT referral_code FROM merchant_parents WHERE id = ${userId} LIMIT 1
  `.catch(() => [] as Array<{ referral_code: string | null }>);
  const code = row?.referral_code?.trim();
  return code ? code.toUpperCase() : null;
}

async function findUnifiedReferralCode(
  userType: ReferralUserType,
  userId: number,
): Promise<{ referral_code: string; regenerated_from: string | null } | null> {
  const sql = getSql();
  const [unified] = await sql<Array<{ referral_code: string; regenerated_from: string | null }>>`
    SELECT referral_code, regenerated_from
    FROM referral_codes
    WHERE user_type = ${userType}::referral_user_type
      AND user_id = ${userId}
      AND suspended = false
    LIMIT 1
  `.catch(() => [] as Array<{ referral_code: string; regenerated_from: string | null }>);
  if (!unified?.referral_code?.trim()) return null;
  return {
    referral_code: unified.referral_code.trim().toUpperCase(),
    regenerated_from: unified.regenerated_from?.trim()
      ? unified.regenerated_from.trim().toUpperCase()
      : null,
  };
}

/**
 * Existing referral code for a user, if any.
 * Published profile codes (riders.referral_code / customers.referral_code) win
 * over a later generated unified row so already-registered users keep sharing
 * the same code.
 */
export async function findExistingReferralCode(
  userType: ReferralUserType,
  userId: number,
): Promise<string | null> {
  const settings = await getReferralSettings().catch(() => null);
  const prefix = settings ? codePrefixFor(settings, userType) : "RIDER";
  const profile = await findProfileReferralCode(userType, userId);
  const unified = await findUnifiedReferralCode(userType, userId);

  const publishedFromHistory =
    unified?.regenerated_from &&
    looksEngineGenerated(unified.referral_code, prefix) &&
    !looksEngineGenerated(unified.regenerated_from, prefix)
      ? unified.regenerated_from
      : null;

  if (profile) {
    if (publishedFromHistory && looksEngineGenerated(profile, prefix)) {
      return publishedFromHistory;
    }
    return profile;
  }

  return publishedFromHistory ?? unified?.referral_code ?? null;
}

/**
 * Keep the unified lookup in sync without rotating a published profile code.
 */
async function syncUnifiedCode(
  userType: ReferralUserType,
  userId: number,
  code: string,
): Promise<void> {
  const sql = getSql();
  const normalized = code.trim().toUpperCase();
  if (!normalized) return;
  await sql`
    INSERT INTO referral_codes (user_type, user_id, referral_code, active)
    VALUES (${userType}::referral_user_type, ${userId}, ${normalized}, true)
    ON CONFLICT (user_type, user_id) DO UPDATE
      SET
        regenerated_from = CASE
          WHEN referral_codes.referral_code IS DISTINCT FROM EXCLUDED.referral_code
          THEN referral_codes.referral_code
          ELSE referral_codes.regenerated_from
        END,
        referral_code = EXCLUDED.referral_code,
        active = true,
        suspended = false,
        updated_at = NOW()
  `.catch(() => undefined);
}

async function writeProfileIfEmpty(
  userType: ReferralUserType,
  userId: number,
  code: string,
): Promise<void> {
  const sql = getSql();
  const normalized = code.trim().toUpperCase();
  if (!normalized) return;
  if (userType === "customer") {
    await sql`
      UPDATE customers
      SET referral_code = ${normalized}
      WHERE id = ${userId}
        AND (referral_code IS NULL OR length(TRIM(referral_code)) < 3)
    `.catch(() => undefined);
  } else if (userType === "rider") {
    await sql`
      UPDATE riders
      SET referral_code = ${normalized}
      WHERE id = ${userId}
        AND (referral_code IS NULL OR length(TRIM(referral_code)) < 3)
    `.catch(() => undefined);
  }
}

async function restorePublishedProfileCode(
  userType: ReferralUserType,
  userId: number,
  publishedCode: string,
  prefix: string,
): Promise<void> {
  const current = await findProfileReferralCode(userType, userId);
  if (current === publishedCode) return;
  if (current && !looksEngineGenerated(current, prefix)) {
    await writeProfileIfEmpty(userType, userId, publishedCode);
    return;
  }
  const sql = getSql();
  const normalized = publishedCode.trim().toUpperCase();
  if (userType === "customer") {
    await sql`UPDATE customers SET referral_code = ${normalized} WHERE id = ${userId}`.catch(
      () => undefined,
    );
  } else if (userType === "rider") {
    await sql`UPDATE riders SET referral_code = ${normalized} WHERE id = ${userId}`.catch(
      () => undefined,
    );
  }
}

/**
 * Reuse the user's existing code when present; only generate for users who
 * genuinely have none. Never rotates a code that is already in circulation.
 */
export async function getOrCreateReferralCode(
  userType: ReferralUserType,
  userId: number,
): Promise<string> {
  const settings = await getReferralSettings().catch(() => null);
  const prefix = settings ? codePrefixFor(settings, userType) : "RIDER";
  const existing = await findExistingReferralCode(userType, userId);
  if (existing) {
    await syncUnifiedCode(userType, userId, existing);
    await restorePublishedProfileCode(userType, userId, existing, prefix);
    return existing;
  }
  if (settings && !referralTrackingEnabled(settings, userType)) {
    throw new Error(REFERRAL_SERVICE_DISABLED);
  }
  return allocateUniqueReferralCode(userType, userId);
}

export async function allocateUniqueReferralCode(
  userType: ReferralUserType,
  userId: number,
  opts?: { customCode?: string; admin?: boolean; overwriteProfile?: boolean },
): Promise<string> {
  const settings = await getReferralSettings();
  const prefix = codePrefixFor(settings, userType);
  const overwriteProfile = opts?.overwriteProfile !== false;

  if (opts?.customCode) {
    if (!opts.admin) throw new Error("custom_code_admin_only");
    const code = opts.customCode.trim().toUpperCase();
    if (await isCodeBlacklisted(code)) throw new Error("code_blacklisted");
    await persistCode(userType, userId, code, true, overwriteProfile);
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
    await persistCode(userType, userId, code, false, overwriteProfile);
    return code;
  }
  throw new Error("code_allocation_failed");
}

async function persistCode(
  userType: ReferralUserType,
  userId: number,
  code: string,
  isCustom: boolean,
  overwriteProfile: boolean,
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

  if (!overwriteProfile) return;

  if (userType === "customer") {
    await sql`UPDATE customers SET referral_code = ${code} WHERE id = ${userId}`.catch(
      () => undefined,
    );
  } else if (userType === "rider") {
    await sql`UPDATE riders SET referral_code = ${code} WHERE id = ${userId}`.catch(
      () => undefined,
    );
  }
}

export async function regenerateReferralCode(
  userType: ReferralUserType,
  userId: number,
): Promise<string> {
  return allocateUniqueReferralCode(userType, userId, { overwriteProfile: true });
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
