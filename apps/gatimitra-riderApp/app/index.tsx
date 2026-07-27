// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import { router, type Href } from "expo-router";
import { usePermissionStore } from "@/src/stores/permissionStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useLanguageStore } from "@/src/stores/languageStore";
import { useOnboardingGate } from "@/src/hooks/useOnboardingGate";
import { RiderBootstrapScreen } from "@/src/components/RiderBootstrapScreen";
import { useEffect, useRef } from "react";

/**
 * Cold-start router. Prefer cached session → tabs immediately.
 * Bootstrap splash only while storage hydrate is still unknown.
 */
export default function Index() {
  const hydrated = usePermissionStore((s) => s.hydrated);
  const hasRequestedPermissions = usePermissionStore((s) => s.hasRequestedPermissions);
  const session = useSessionStore((s) => s.session);
  const sessionHydrated = useSessionStore((s) => s.hydrated);
  const languageSelected = useLanguageStore((s) => s.languageSelected);
  const languageHydrated = useLanguageStore((s) => s.hydrated);
  const hydrateLanguage = useLanguageStore((s) => s.hydrate);
  const { ready: onboardingGateReady, href: onboardingHref, canAccessTabs } = useOnboardingGate();
  const lastReplaceTargetRef = useRef<string | null>(null);

  useEffect(() => {
    void hydrateLanguage().catch((err) => {
      console.warn("[Index] Language hydration failed:", err);
    });
  }, [hydrateLanguage]);

  useEffect(() => {
    // Fast path: known logged-in rider with home access → tabs without waiting onboarding fetch.
    if (sessionHydrated && session && canAccessTabs) {
      const target = "/(tabs)" as Href;
      if (lastReplaceTargetRef.current !== target) {
        lastReplaceTargetRef.current = target as string;
        router.replace(target);
      }
      return;
    }

    if (!hydrated || !languageHydrated || !sessionHydrated) return;
    if (session && !onboardingGateReady) return;

    let target: Href;
    if (session && onboardingHref) {
      target = onboardingHref;
    } else if (!languageSelected) {
      target = "/(onboarding)/language";
    } else if (!hasRequestedPermissions) {
      target = "/(permissions)/request";
    } else if (session) {
      target = "/(tabs)";
    } else {
      target = "/(auth)/login";
    }

    if (lastReplaceTargetRef.current === target) return;
    lastReplaceTargetRef.current = target;
    router.replace(target);
  }, [
    hydrated,
    languageHydrated,
    sessionHydrated,
    session,
    onboardingGateReady,
    onboardingHref,
    canAccessTabs,
    languageSelected,
    hasRequestedPermissions,
  ]);

  // Returning riders with cached access: no splash — blank white until tabs mounts is fine.
  if (sessionHydrated && session && canAccessTabs) {
    return null;
  }

  return <RiderBootstrapScreen />;
}
