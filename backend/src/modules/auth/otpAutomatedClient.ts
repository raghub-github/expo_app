/**
 * OTP requests that must never become a paid SMS.
 *
 * 1. Google Play's automated testers (pre-launch report / app review robots).
 *    They log into every new build with the Play Console "App access" numbers,
 *    retry for hours, and cannot read an SMS anyway. Verified 2026-11-20 from the
 *    nginx log: every OTP request between 08:15 and 10:55 IST came from
 *    66.249.x.x / 74.125.x.x (Google LLC) with the Android okhttp agent, each
 *    followed ~1 s later by Supabase's Send SMS hook → MSG91 — to +91 99999 99999,
 *    +91 91131 94305 and +91 65049 92804. These clients get the normal "OTP sent"
 *    reply (backend OTP path, so the app never calls Supabase) but no SMS.
 *    An armed review bypass is checked BEFORE this, so a reviewer still logs in.
 *
 * 2. Dummy numbers no operator issues (a single repeated digit, 1234567890):
 *    MSG91 rejects them ("Failed" in its log) but still bills each attempt.
 *
 * Env:
 *   OTP_SUPPRESS_AUTOMATED_CLIENTS=false   turn rule 1 off
 *   OTP_AUTOMATED_CLIENT_CIDRS=a/b,c/d      replace the default IPv4 ranges
 */

type Env = Record<string, string | undefined>;

/** Google ranges seen sending Play test traffic (crawler 66.249.64/19, 66.102/20, 74.125/16). */
export const DEFAULT_AUTOMATED_CLIENT_CIDRS = ["66.249.64.0/19", "66.102.0.0/20", "74.125.0.0/16"];

export function ipv4ToInt(raw: string | null | undefined): number | null {
  let ip = String(raw ?? "").trim();
  if (!ip) return null;
  if (ip.toLowerCase().startsWith("::ffff:")) ip = ip.slice(7);
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

type Cidr = { base: number; mask: number };

export function parseCidrs(list: string[]): Cidr[] {
  const out: Cidr[] = [];
  for (const raw of list) {
    const [ip, bitsRaw] = String(raw).trim().split("/");
    const base = ipv4ToInt(ip);
    const bits = bitsRaw == null || bitsRaw === "" ? 32 : Number(bitsRaw);
    if (base == null || !Number.isInteger(bits) || bits < 0 || bits > 32) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    out.push({ base: (base & mask) >>> 0, mask });
  }
  return out;
}

function ruleEnabled(env: Env): boolean {
  const v = String(env.OTP_SUPPRESS_AUTOMATED_CLIENTS ?? "").trim().toLowerCase();
  return !(v === "false" || v === "0" || v === "off" || v === "no");
}

function configuredCidrs(env: Env): Cidr[] {
  const raw = String(env.OTP_AUTOMATED_CLIENT_CIDRS ?? "").trim();
  const list = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_AUTOMATED_CLIENT_CIDRS;
  return parseCidrs(list);
}

/** True when the request comes from a Google Play automated test network. */
export function isAutomatedTestClientIp(ip: string | null | undefined, env: Env = process.env): boolean {
  if (!ruleEnabled(env)) return false;
  const n = ipv4ToInt(ip);
  if (n == null) return false;
  return configuredCidrs(env).some((c) => ((n & c.mask) >>> 0) === c.base);
}

/**
 * The connecting client. nginx sets X-Real-IP from $remote_addr, which a client
 * cannot forge (unlike the first X-Forwarded-For entry).
 */
export function otpClientIp(
  headers: Record<string, string | string[] | undefined>,
  fallbackIp: string | null | undefined,
): string | null {
  const real = headers["x-real-ip"];
  const v = Array.isArray(real) ? real[0] : real;
  if (typeof v === "string" && v.trim()) return v.trim();
  return fallbackIp?.trim() || null;
}

/** 10-digit Indian subscriber number, or null. */
function subscriberDigits(phone: string | null | undefined): string | null {
  let d = String(phone ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.length === 10 ? d : null;
}

/** A number no operator issues — never worth an SMS. */
export function isUndeliverableDummyPhone(phone: string | null | undefined): boolean {
  const d = subscriberDigits(phone);
  if (!d) return false;
  if (/^(\d)\1{9}$/.test(d)) return true;
  return d === "1234567890" || d === "0123456789";
}
