/**
 * What to tell a rider about an Accept they tapped outside the app — on the
 * overlay, the lock screen, or a notification action.
 *
 * The old behaviour showed nothing at all: the buzzer stopped and the card
 * closed whether or not the order had been accepted, which is indistinguishable
 * from success. Every non-success path here has to say something.
 */

export type NativeAcceptOutcome =
  | { kind: "accepted" }
  | { kind: "unresolved" }
  | { kind: "failed"; message: string };

/**
 * `detail` is the server's own `error` string where there was one, so it already
 * separates "another rider took it" from "it expired" — prefer it over a guess
 * built from the status code.
 */
export function describeNativeAcceptOutcome(args: {
  result: "ok" | "failed" | "pending";
  httpStatus: number;
  detail: string;
}): NativeAcceptOutcome {
  if (args.result === "ok") return { kind: "accepted" };
  // Still in flight when the app came up. The refreshed order lists are the
  // answer; claiming either outcome here would be a guess.
  if (args.result === "pending") return { kind: "unresolved" };

  const detail = String(args.detail ?? "").trim();
  const status = Number(args.httpStatus) || 0;

  if (status === 401 || status === 403 || detail === "not_signed_in") {
    return { kind: "failed", message: "Sign in again to accept orders from the alert." };
  }
  if (status === 0) {
    return {
      kind: "failed",
      message: "No network when you tapped Accept — the order was not accepted.",
    };
  }
  if (detail) return { kind: "failed", message: detail };
  if (status === 404 || status === 409) {
    return { kind: "failed", message: "That order is no longer available." };
  }
  return { kind: "failed", message: "Could not accept that order. Please try again." };
}
