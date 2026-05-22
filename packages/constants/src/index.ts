/**
 * @gatimitra/constants — domain enums + magic strings used by multiple
 * services. Anything that risks drift across producer + consumer lives
 * here. Real values, not just types.
 */

/* ─── Order lifecycle ─────────────────────────────────────────────── */

export const ORDER_STATUSES = [
  "PLACED",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "ASSIGNED",
  "PICKED_UP",
  "ON_THE_WAY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "REJECTED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TERMINAL_ORDER_STATUSES = ["DELIVERED", "CANCELLED", "REJECTED"] as const;

/* ─── Payment ─────────────────────────────────────────────────────── */

export const PAYMENT_GATEWAYS = ["razorpay", "stripe", "dummy"] as const;
export type PaymentGateway = (typeof PAYMENT_GATEWAYS)[number];

export const PAYMENT_STATES = [
  "CREATED",
  "PENDING_CONFIRMATION",
  "FINALIZED",
  "FAILED",
  "REFUNDED",
  "EXPIRED",
] as const;

/* ─── Realtime channel patterns (ws-gateway) ──────────────────────── */

export const WS_CHANNEL_PREFIXES = {
  ORDER: "order",
  RIDER: "rider",
  STORE: "store",
} as const;

/** Validates a channel name vs the canonical pattern. */
export const WS_CHANNEL_RE = /^[a-z][a-z0-9_-]*:[A-Za-z0-9_:-]+$/;

/* ─── Service ports (helpful for compose + docs) ─────────────────── */

export const SERVICE_PORTS = {
  BACKEND: 3000,
  DASHBOARD: 3001,
  PARTNERSITE: 3002,
  WS_GATEWAY: 4100,
} as const;

/* ─── BullMQ queue retention ──────────────────────────────────────── */

export const QUEUE_RETENTION = {
  COMPLETED_AGE_SEC: 24 * 60 * 60,
  COMPLETED_COUNT_MAX: 10_000,
  /** Failed jobs kept until manually cleared — used for postmortem. */
  FAILED_KEEP: true,
} as const;
