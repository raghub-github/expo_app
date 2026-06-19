import { ApiError } from "@gatimitra/sdk";

function apiErrorText(err: ApiError): string {
  const payload = err.payload;
  if (payload && typeof payload === "object") {
    const obj = payload as { error?: unknown; message?: unknown };
    if (typeof obj.error === "string") return obj.error.trim();
    if (typeof obj.message === "string") return obj.message.trim();
  }
  return err.message.trim();
}

/** True only when backend confirms another rider won the dispatch race. */
export function isOrderTakenByAnotherRiderError(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  const msg = apiErrorText(err).toLowerCase();
  return (
    msg.includes("already taken") ||
    msg.includes("accepted by another") ||
    msg.includes("accepted_by_other_rider")
  );
}

export function isOrderNoLongerAvailableError(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  const msg = apiErrorText(err).toLowerCase();
  return msg.includes("not available") || msg.includes("no longer available");
}

export function extractRiderAcceptErrorMessage(err: unknown): string | null {
  if (err instanceof ApiError) {
    const text = apiErrorText(err);
    return text.length > 0 ? text : null;
  }
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return null;
}
