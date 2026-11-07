import { ApiError, NetworkTimeoutError } from "@gatimitra/sdk";

export type RiderActionType =
  | "accept"
  | "reject"
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

/**
 * Read an HTTP status off an error structurally instead of via
 * `instanceof HttpError`. Importing `@/src/services/http` here pulled in the
 * session store and, through it, all of react-native - which esbuild cannot
 * parse, so this module's own test suite could never run at all. HttpError
 * sets `name` in its constructor, so this stays behaviourally identical to the
 * instanceof check it replaces, without widening to unrelated errors.
 */
function httpErrorStatus(err: unknown): number | null {
  if (!(err instanceof Error) || err.name !== "HttpError") return null;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

export function classifyRiderActionFailure(err: unknown): RiderActionFailureKind {
  if (err instanceof RiderActionBusyError) return "busy";
  if (err instanceof NetworkTimeoutError) return "timeout";

  const status = err instanceof ApiError ? err.status : httpErrorStatus(err);
  if (status != null) {
    if (status === 401) return "auth";
    if (status === 408 || status === 429) return "server";
    if (status === 409) return "conflict";
    if (status >= 500) return "server";
    if (status >= 400) return "business";
  }

  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes("timed out") || msg.includes("timeout")) return "timeout";
  if (
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("internet") ||
    msg.includes("offline") ||
    msg.includes("econn") ||
    msg.includes("enotfound") ||
    /(^|\b)network error\b/.test(msg) ||
    msg === "network" ||
    msg.startsWith("network:")
  ) {
    return "network";
  }
  // Do not default unknown / business strings to "network" — that made invalid DL
  // show "Couldn't reach the server".
  return "business";
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

/** Bounded backoff with jitter. Caps at 8s — keep retries snappy for slide actions. */
export function riderActionRetryDelayMs(retryCount: number): number {
  const base = Math.min(8_000, 400 * 2 ** Math.max(0, retryCount));
  const jitter = Math.floor(Math.random() * Math.min(200, base * 0.2));
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
