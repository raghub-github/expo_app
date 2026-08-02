/**
 * Advanced fraud detection — extends base checks with device / loop / velocity signals.
 */

import { getSql } from "../../db/client.js";
import type { ReferralUserType } from "./referral.config.service.js";
import { getReferralSettings } from "./referral.config.service.js";
import {
  evaluateReferralFraud,
  hashPhone,
  type FraudContext,
  type FraudResult,
} from "./referral.fraud.js";

const DISPOSABLE_PREFIXES = [
  "140", // common Indian virtual / testing ranges — extend via admin later
];

export type AdvancedFraudInput = FraudContext & {
  isEmulator?: boolean;
  isRooted?: boolean;
  ip?: string | null;
  usingVpn?: boolean;
};

export async function evaluateAdvancedReferralFraud(
  ctx: AdvancedFraudInput,
): Promise<FraudResult> {
  const settings = await getReferralSettings();
  const base = await evaluateReferralFraud(settings.fraud_checks, ctx);
  const flags = [...base.flags];
  const adv = (settings as { advanced_fraud?: Record<string, unknown> }).advanced_fraud ?? {
    block_emulator: true,
    block_rooted: true,
    block_referral_loops: true,
    max_installs_per_device: 3,
    block_disposable_phones: true,
    max_referrals_per_hour: 20,
    block_vpn_proxy: false,
    suspicious_ip_threshold: 10,
  };

  if (adv.block_emulator && ctx.isEmulator) flags.push("emulator");
  if (adv.block_rooted && ctx.isRooted) flags.push("rooted_device");
  if (adv.block_vpn_proxy && ctx.usingVpn) flags.push("vpn_proxy");

  if (adv.block_disposable_phones && ctx.referredPhone) {
    const digits = String(ctx.referredPhone).replace(/\D/g, "");
    if (DISPOSABLE_PREFIXES.some((p) => digits.startsWith(p))) {
      flags.push("disposable_phone");
    }
  }

  const sql = getSql();

  if (adv.block_referral_loops) {
    // A→B→A: referred already referred the referrer
    const [loop] = await sql<Array<{ ok: string }>>`
      SELECT 1::text AS ok
      FROM referral_relationships
      WHERE user_type = ${ctx.userType}::referral_user_type
        AND referrer_id = ${ctx.referredUserId}
        AND referred_user_id = ${ctx.referrerId}
      LIMIT 1
    `.catch(() => []);
    if (loop) flags.push("referral_loop");
  }

  if (ctx.deviceFingerprint) {
    const maxInstalls = Number(adv.max_installs_per_device ?? 3);
    const [cnt] = await sql<Array<{ n: string }>>`
      SELECT COUNT(*)::text AS n
      FROM referral_device_attributions
      WHERE device_fingerprint = ${ctx.deviceFingerprint}
        AND user_type = ${ctx.userType}::referral_user_type
    `.catch(() => [{ n: "0" }]);
    if (Number(cnt?.n ?? 0) >= maxInstalls) flags.push("device_multi_install");
  }

  const maxPerHour = Number(adv.max_referrals_per_hour ?? 20);
  const [vel] = await sql<Array<{ n: string }>>`
    SELECT COUNT(*)::text AS n
    FROM referral_relationships
    WHERE user_type = ${ctx.userType}::referral_user_type
      AND referrer_id = ${ctx.referrerId}
      AND created_at > NOW() - INTERVAL '1 hour'
  `.catch(() => [{ n: "0" }]);
  if (Number(vel?.n ?? 0) >= maxPerHour) flags.push("velocity_abuse");

  if (ctx.ip) {
    const threshold = Number(adv.suspicious_ip_threshold ?? 10);
    const [ipCnt] = await sql<Array<{ n: string }>>`
      SELECT COUNT(*)::text AS n
      FROM referral_install_clicks
      WHERE ip_hash = ${hashPhone(ctx.ip) /* reuse hash util for ip */}
        AND created_at > NOW() - INTERVAL '1 hour'
    `.catch(() => [{ n: "0" }]);
    // Prefer dedicated ip hash — fall back to simple count by raw metadata
    void ipCnt;
    const [ipCnt2] = await sql<Array<{ n: string }>>`
      SELECT COUNT(*)::text AS n
      FROM referral_lifecycle_events
      WHERE event_name = 'link_clicked'
        AND metadata->>'ip' = ${ctx.ip}
        AND created_at > NOW() - INTERVAL '1 hour'
    `.catch(() => [{ n: "0" }]);
    if (Number(ipCnt2?.n ?? 0) >= threshold) flags.push("suspicious_ip");
  }

  if (flags.length > 0) {
    return { ok: false, flags, reason: flags[0] };
  }
  return { ok: true, flags: [] };
}

export async function recordDeviceAttribution(opts: {
  deviceFingerprint: string;
  userType: ReferralUserType;
  userId?: number | null;
  referralCode?: string | null;
  platform?: string | null;
  isEmulator?: boolean;
  isRooted?: boolean;
  installReferrerRaw?: string | null;
}): Promise<{ reinstall: boolean }> {
  const sql = getSql();
  const [prior] = await sql<Array<{ id: string }>>`
    SELECT id::text FROM referral_device_attributions
    WHERE device_fingerprint = ${opts.deviceFingerprint}
    LIMIT 1
  `.catch(() => []);

  await sql`
    INSERT INTO referral_device_attributions (
      device_fingerprint, user_type, user_id, referral_code, platform,
      is_emulator, is_rooted, install_referrer_raw, first_open_at
    ) VALUES (
      ${opts.deviceFingerprint},
      ${opts.userType}::referral_user_type,
      ${opts.userId ?? null},
      ${opts.referralCode ?? null},
      ${opts.platform ?? null},
      ${opts.isEmulator ?? false},
      ${opts.isRooted ?? false},
      ${opts.installReferrerRaw ?? null},
      NOW()
    )
  `.catch(() => undefined);

  return { reinstall: Boolean(prior) };
}
