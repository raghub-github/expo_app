import { useRiderToastStore } from "@/src/stores/riderToastStore";
import { classifyRiderActionFailure } from "@/src/lib/rider-action-kind";
import { extractApiErrorMessage, HttpError } from "@/src/services/http";
import { ApiError, NetworkTimeoutError } from "@gatimitra/sdk";

/** Show onboarding feedback as a bottom toast instead of inline banners. */
export function notifyOnboardingToast(message: string) {
  const text = message.trim();
  if (!text) return;
  useRiderToastStore.getState().showToast(text);
}

function isTransportError(error: unknown): boolean {
  return (
    error instanceof NetworkTimeoutError ||
    error instanceof HttpError ||
    error instanceof ApiError ||
    (error instanceof Error && error.name !== "Error")
  );
}

/** Map raw network/API failures to rider-facing copy (never EXPO_PUBLIC_* / stack dumps). */
export function friendlyOnboardingError(
  error: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  const apiMsg = extractApiErrorMessage(error, "");
  const errMsg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error ?? "");
  const haystack = `${apiMsg}\n${errMsg}`;

  // Business duplicates — before any network/server classification.
  if (
    /dl_already_registered|rc_already_registered|pan_already_registered|aadhaar_already_registered|aadhar_already_registered|already\s+registered|driving\s*licen[cs]e\s+already\s+registered|registration\s+certificate\s+already\s+registered|pan\s+already\s+registered|aadha?ar\s+already\s+registered|try\s+with\s+diff/i.test(
      haystack
    )
  ) {
    return "Already registered with another rider";
  }
  if (/dob_required/i.test(haystack)) {
    return "Date of birth is required. Enter DOB as on your driving licence (DD/MM/YYYY).";
  }
  // Invalid / not-found DL (format 400 `invalid_dl` OR Cashfree DL reject).
  if (
    /invalid_dl|invalid\s*dl(\s*number|\s*format)?|invalid\s*driving|driving\s*licen[cs]e.{0,40}(invalid|not\s*found|no\s*record|does\s*not\s*exist)|dl\s*(number\s*)?(is\s*)?(invalid|not\s*found)|licen[cs]e\s*(number\s*)?(is\s*)?(invalid|not\s*found)|no\s*record.{0,20}licen[cs]e/i.test(
      haystack
    )
  ) {
    return "Invalid DL number. Please check and try again.";
  }
  if (
    /invalid_vehicle_number|invalid_rc|invalid\s*rc(\s*number|\s*format)?|vehicle\s*(number|rc).{0,40}(invalid|not\s*found)|rc\s*(number\s*)?(is\s*)?(invalid|not\s*found)|no\s*record.{0,20}(vehicle|rc)/i.test(
      haystack
    )
  ) {
    return "Invalid RC number. Please check and try again.";
  }
  if (/invalid_pan/i.test(haystack)) {
    return "Invalid PAN. Please check and try again.";
  }
  // Cashfree / provider rejected the number without a typed code.
  if (
    /upstream_failed|not_found_error|failed_at_source|verification\s*failed|could\s*not\s*be\s*verified|status:\s*rejected|\brejected\b|cashfree\s*status/i.test(
      haystack
    )
  ) {
    return "Invalid document number. Please check and try again.";
  }

  // Transport classification only for real HTTP/fetch errors — never for plain
  // outcome strings like "Document could not be verified."
  if (isTransportError(error)) {
    const kind = classifyRiderActionFailure(error);
    if (kind === "network" || kind === "timeout") {
      return "Couldn't reach the server right now. Check your internet connection and try again.";
    }
    if (kind === "server") {
      return "Server is busy. Please try again in a moment.";
    }
    if (kind === "auth") {
      return "Your session expired. Please sign in again.";
    }
  }

  const candidate =
    (typeof error === "string" && error.trim() ? error.trim() : "") ||
    (apiMsg && !/^\{/.test(apiMsg.trim()) && !/^HTTP\s*\d+/i.test(apiMsg.trim())
      ? apiMsg.trim()
      : "") ||
    (error instanceof Error &&
    error.message.trim() &&
    !/^HTTP\s*\d+/i.test(error.message.trim()) &&
    !error.message.includes('"stack"')
      ? error.message.trim()
      : "");

  if (
    !candidate ||
    /EXPO_PUBLIC_|Network request failed|ECONNRESET|ETIMEDOUT|fetch failed|TypeError|HTTP\s*\d+|"stack"\s*:|internal_error/i.test(
      candidate
    ) ||
    candidate.trim().startsWith("{") ||
    candidate.length > 160
  ) {
    return fallback;
  }
  return candidate;
}
