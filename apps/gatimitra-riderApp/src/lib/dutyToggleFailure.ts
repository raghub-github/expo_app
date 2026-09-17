import { ApiError, NetworkTimeoutError } from "@gatimitra/sdk";

export type DutyLocationFixFailureReason =
  | "permission"
  | "services_disabled"
  | "unavailable";

export type DutyLocationFixResult =
  | { ok: true; lat: number; lon: number }
  | { ok: false; reason: DutyLocationFixFailureReason };

export type DutyConnectivityErrorKind = "network" | "server" | "location";

function classifyDutyApiFailure(err: unknown): "network" | "timeout" | "server" | "other" {
  if (err instanceof NetworkTimeoutError) return "timeout";
  const status =
    err instanceof ApiError
      ? err.status
      : err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number"
        ? (err as { status: number }).status
        : null;
  if (status != null) {
    if (status === 408 || status === 429 || status >= 500) return "server";
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
    /(^|\b)network error\b/.test(msg)
  ) {
    return "network";
  }
  return "other";
}

/**
 * Priority: internet unavailable → network; else GPS reasons → location;
 * API timeout / unreachable → network/server (never GPS).
 */
export function resolveDutyGoOnFailureKind(input: {
  online: boolean;
  locationFailure?: DutyLocationFixFailureReason | null;
  apiError?: unknown;
}): DutyConnectivityErrorKind {
  if (!input.online) return "network";
  if (input.locationFailure) return "location";
  if (input.apiError != null) {
    const kind = classifyDutyApiFailure(input.apiError);
    if (kind === "network" || kind === "timeout") return "network";
    if (kind === "server") return "server";
  }
  return "server";
}

export function dutyLocationCopy(reason: DutyLocationFixFailureReason): {
  title: string;
  message: string;
} {
  if (reason === "permission") {
    return {
      title: "Location permission needed",
      message:
        "Allow location access for GatiMitra Rider, then try going ON-DUTY again.",
    };
  }
  if (reason === "services_disabled") {
    return {
      title: "Location needed",
      message:
        "Turn on GPS and try again. We need your current location before you can go ON-DUTY.",
    };
  }
  return {
    title: "Location needed",
    message:
      "We could not get your current location. Make sure GPS is on and try again.",
  };
}

export function dutyConnectivityCopy(kind: Exclude<DutyConnectivityErrorKind, "location">): {
  title: string;
  message: string;
} {
  if (kind === "network") {
    return {
      title: "No Internet Connection",
      message:
        "Your internet connection appears to be unavailable. Please check your network and try again.",
    };
  }
  return {
    title: "Couldn't reach server",
    message: "Please check your connection and try again in a moment.",
  };
}
