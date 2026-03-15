/**
 * Environment-isolated cookie names so localhost and production do not share session state.
 * Dev (e.g. localhost) uses a different prefix than production.
 */

const PROD_PREFIX = "partner_";
const DEV_PREFIX = "partner_dev_";

function getPrefix(): string {
  if (typeof process === "undefined") return DEV_PREFIX;
  const env: string = process.env.NODE_ENV ?? process.env.VERCEL_ENV ?? "";
  const isProd = env === "production" || env === "preview";
  return isProd ? PROD_PREFIX : DEV_PREFIX;
}

let cachedPrefix: string | null = null;
export function getSessionCookiePrefix(): string {
  if (cachedPrefix === null) cachedPrefix = getPrefix();
  return cachedPrefix;
}

export const SESSION_START_BASE = "session_start_time";
export const LAST_ACTIVITY_BASE = "last_activity_time";
export const SESSION_ID_BASE = "session_id";
export const DEVICE_ID_BASE = "device_id";

export function sessionStartCookie(): string {
  return getSessionCookiePrefix() + SESSION_START_BASE;
}
export function lastActivityCookie(): string {
  return getSessionCookiePrefix() + LAST_ACTIVITY_BASE;
}
export function sessionIdCookie(): string {
  return getSessionCookiePrefix() + SESSION_ID_BASE;
}
export function deviceIdCookie(): string {
  return getSessionCookiePrefix() + DEVICE_ID_BASE;
}
