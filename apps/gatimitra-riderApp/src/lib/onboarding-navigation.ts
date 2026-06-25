import { router, type Href } from "expo-router";

/** Onboarding wizard steps use replace — not stack history (cold start / gate redirects). */
export function goBackOrReplace(fallback: Href) {
  router.replace(fallback);
}
