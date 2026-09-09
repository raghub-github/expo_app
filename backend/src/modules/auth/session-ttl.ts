/**
 * Access-token lifetimes for the mobile apps. Kept in a dependency-free module so they can be
 * unit-tested without booting the auth routes (which validate env on import).
 *
 * Both rider and merchant apps stay signed in until an explicit logout — a long-lived access
 * token so the app never asks to log in again just because it was killed and reopened. This is
 * safe: every authenticated request re-checks user_device_sessions.is_active (plugins/auth.ts),
 * so logout / single-device takeover / admin revoke all take effect server-side regardless of
 * the token TTL.
 */

/** Merchant app session token lifetime (1 year). */
export const MERCHANT_SESSION_TTL_SEC = 60 * 60 * 24 * 365;

/**
 * Rider app session token lifetime (1 year — aligned with the merchant app). Previously 7 days,
 * which forced riders to log in again whenever the refresh chain hiccupped across an app kill.
 */
export const RIDER_SESSION_TTL_SEC = 60 * 60 * 24 * 365;
