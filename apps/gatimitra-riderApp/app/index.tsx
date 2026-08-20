// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import { router, useRootNavigationState, type Href } from "expo-router";
import { usePermissionStore } from "@/src/stores/permissionStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useLanguageStore } from "@/src/stores/languageStore";
import { useOnboardingGate } from "@/src/hooks/useOnboardingGate";
import { RiderBootstrapScreen } from "@/src/components/RiderBootstrapScreen";
import { useEffect, useRef } from "react";

const MIN_SPLASH_MS = 900;

/**
 * Cold-start router. Keep the branded splash on screen until the root navigator
 * is mounted, then replace into login / onboarding / tabs.
 */
export default function Index() {
  const nav = useRootNavigationState();
  const hydrated = usePermissionStore((s) => s.hydrated);
  const hasRequestedPermissions = usePermissionStore((s) => s.hasRequestedPermissions);
  const session = useSessionStore((s) => s.session);
  const sessionHydrated = useSessionStore((s) => s.hydrated);
  const languageSelected = useLanguageStore((s) => s.languageSelected);
  const languageHydrated = useLanguageStore((s) => s.hydrated);
  const hydrateLanguage = useLanguageStore((s) => s.hydrate);
  const { ready: onboardingGateReady, href: onboardingHref, canAccessTabs } = useOnboardingGate();
  const lastReplaceTargetRef = useRef<string | null>(null);
  const splashShownAtRef = useRef(Date.now());

  useEffect(() => {
    void hydrateLanguage().catch((err) => {
      console.warn("[Index] Language hydration failed:", err);
    });
  }, [hydrateLanguage]);

  useEffect(() => {
    if (!nav?.key) return;

    let target: Href | null = null;
    if (sessionHydrated && session && canAccessTabs) {
      target = "/(tabs)";
    } else if (!hydrated || !languageHydrated || !sessionHydrated) {
      return;
    } else if (session && !onboardingGateReady) {
      return;
    } else if (session && onboardingHref) {
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

    if (!target || lastReplaceTargetRef.current === String(target)) return;
    const wait = Math.max(0, MIN_SPLASH_MS - (Date.now() - splashShownAtRef.current));
    const timer = setTimeout(() => {
      lastReplaceTargetRef.current = String(target);
      try {
        router.replace(target);
      } catch (err) {
        lastReplaceTargetRef.current = null;
        console.warn("[Index] Navigation not ready yet:", err);
      }
    }, wait);
    return () => clearTimeout(timer);
  }, [
    nav?.key,
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

  return <RiderBootstrapScreen />;
}
