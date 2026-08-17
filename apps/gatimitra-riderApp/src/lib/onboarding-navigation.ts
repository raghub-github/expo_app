import { router, type Href } from "expo-router";
import { useSessionStore } from "@/src/stores/sessionStore";

/** Onboarding wizard steps use replace — not stack history (cold start / gate redirects). */
export function goBackOrReplace(fallback: Href) {
  router.replace(fallback);
}

/**
 * First onboarding screens must not send an authenticated rider back to login
 * (that forces a useless re-OTP). Prefer an earlier onboarding step, or no-op.
 */
export function goBackFromOnboardingEntry(options?: {
  /** When set, prefer this onboarding route while a session exists. */
  previousOnboardingHref?: Href;
}): void {
  const session = useSessionStore.getState().session;
  if (session?.accessToken) {
    if (options?.previousOnboardingHref) {
      router.replace(options.previousOnboardingHref);
      return;
    }
    // Already at the first logged-in onboarding step — stay put.
    return;
  }
  router.replace("/(auth)/login");
}
