import { ApiError, NetworkTimeoutError } from "@gatimitra/sdk";

export type RiderActionType =
  | "accept"
  | "reached_pickup"
  | "reached_drop"
  | "mark_pickup"
  | "start_ride"
  | "complete_ride"
  | "verify_pickup_otp"
  | "verify_delivery_otp"
  | "cancel_assigned";

export type RiderActionFailureKind =
  | "timeout"
  | "network"
  | "server"
  | "auth"
  | "conflict"
  | "business"
  | "busy";

export class RiderActionBusyError extends Error {
  constructor() {
    super("Action already in progress");
    this.name = "RiderActionBusyError";
  }
}

export type RiderActionPhase =
  | "idle"
  | "processing"
  | "waiting_network"
  | "reconciling"
  | "retrying";

export function newRiderActionId(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function classifyRiderActionFailure(err: unknown): RiderActionFailureKind {
  if (err instanceof RiderActionBusyError) return "busy";
  if (err instanceof NetworkTimeoutError) return "timeout";
  if (err instanceof ApiError) {
    if (err.status === 401) return "auth";
    if (err.status === 408 || err.status === 429) return "server";
    if (err.status === 409) return "conflict";
    if (err.status >= 500) return "server";
    if (err.status >= 400) return "business";
  }
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes("timed out") || msg.includes("timeout")) return "timeout";
  if (
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("network request failed") ||
    msg.includes("internet") ||
    msg.includes("offline") ||
    msg.includes("econn") ||
    msg.includes("enotfound")
  ) {
    return "network";
  }
  return "network";
}

export function isRetryableRiderActionFailure(kind: RiderActionFailureKind): boolean {
  return kind === "timeout" || kind === "network" || kind === "server";
}

export function isRetryableRiderActionError(err: unknown): boolean {
  return isRetryableRiderActionFailure(classifyRiderActionFailure(err));
}

export function isWrongOtpError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}

/** Bounded backoff with jitter. Caps at 15s. */
export function riderActionRetryDelayMs(retryCount: number): number {
  const base = Math.min(15_000, 1_000 * 2 ** Math.max(0, retryCount));
  const jitter = Math.floor(Math.random() * Math.min(400, base * 0.2));
  return base + jitter;
}

export function riderActionBusyLabel(
  phase: RiderActionPhase,
  processing: string,
  waiting: string,
  reconciling: string
): string | null {
  if (phase === "processing" || phase === "retrying") return processing;
  if (phase === "waiting_network") return waiting;
  if (phase === "reconciling") return reconciling;
  return null;
}
