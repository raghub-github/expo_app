import { useRiderToastStore } from "@/src/stores/riderToastStore";
import { classifyRiderActionFailure } from "@/src/lib/rider-action-kind";

/** Show onboarding feedback as a bottom toast instead of inline banners. */
export function notifyOnboardingToast(message: string) {
  const text = message.trim();
  if (!text) return;
  useRiderToastStore.getState().showToast(text);
}

/** Map raw network/API failures to rider-facing copy (never EXPO_PUBLIC_* / stack dumps). */
export function friendlyOnboardingError(
  error: unknown,
  fallback = "Something went wrong. Please try again."
): string {
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
  const raw =
    error instanceof Error && error.message.trim() ? error.message.trim() : "";
  if (
    !raw ||
    /EXPO_PUBLIC_|Network request failed|ECONNRESET|ETIMEDOUT|fetch failed|TypeError/i.test(
      raw
    )
  ) {
    return fallback;
  }
  if (raw.length > 160) return fallback;
  return raw;
}
