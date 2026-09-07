/**
 * Mounts at app root. On every cold launch + whenever the user's session
 * becomes authenticated, checks whether the user has consented to the
 * current LEGAL_PACK_VERSION. If not, sends them to /(onboarding)/consent.
 *
 * Skips the check when the user is:
 *   - already on the consent screen (avoid redirect loop)
 *   - not yet logged in (consent is per-account)
 *   - on any (auth) screen (they're still authenticating)
 *
 * Returns null — it's a side-effect-only component.
 */

import { useEffect, useRef } from "react";
import { useRouter, useSegments } from "expo-router";
import { useAuthStore } from "@/store/authStore";
import { hasCurrentConsent } from "@/lib/legal-consent";

export function LegalConsentGate() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const isAuthenticated = useAuthStore((s) => Boolean(s.session?.accessToken));
  const userId = useAuthStore((s) => s.session?.userId ?? null);
  /** One network/local check per authenticated user — not on every route change. */
  const checkedForUser = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      checkedForUser.current = null;
      return;
    }

    // Skip if already on consent screen (prevent infinite loop).
    if (segments[0] === "(onboarding)" && segments[1] === "consent") return;

    // Skip while user is still in the (auth) stack.
    if (segments[0] === "(auth)") return;

    if (checkedForUser.current === userId) return;
    checkedForUser.current = userId;

    let cancelled = false;
    (async () => {
      try {
        const ok = await hasCurrentConsent();
        if (cancelled) return;
        if (!ok) {
          router.push("/(onboarding)/consent" as never);
        }
      } catch {
        // Allow a retry on next auth cycle if storage/API read failed.
        if (!cancelled) checkedForUser.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, userId, segments, router]);

  return null;
}

export default LegalConsentGate;
