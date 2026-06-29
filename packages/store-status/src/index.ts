/**
 * Shared store-status types + label formatter.
 *
 * Single source of truth for what a store-open/closed UI looks like
 * across customer app, merchant app, partner site, and admin dashboard.
 *
 * The backend `store-schedule-engine` tick is the ONLY writer of the
 * inputs (`live_schedule_phase`, `next_open_at`, `next_close_at`,
 * `manual_override_active`) on `merchant_stores`. Every reader passes
 * those four values to `formatStoreStatusLabel()` and gets a string.
 *
 * If you want to add a new phase or a new label variant, do it HERE —
 * not in the dashboard, not in the partner site, and definitely not in
 * the merchant-app inline JSX.
 */

export * from "./types.js";
export * from "./format.js";
