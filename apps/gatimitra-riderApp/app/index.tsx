// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import { router, useRootNavigationState, type Href } from "expo-router";
import { usePermissionStore } from "@/src/stores/permissionStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useLanguageStore } from "@/src/stores/languageStore";
import { useOnboardingGate } from "@/src/hooks/useOnboardingGate";
import { RiderBootstrapScreen } from "@/src/components/RiderBootstrapScreen";
import { useEffect, useRef } from "react";

/**
 * Cold-start router. Keep the branded splash until hydration is done, then
 * replace once into login / onboarding / tabs.
 *
 * Important: do NOT re-replace when onboardingHref churns (server step / cache
 * sync). That fights the onboarding stack and triggers "Maximum update depth"
 * inside React Navigation's useSyncState.
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
  /** First destination we committed — ignore later href flicker within the same bucket. */
  const committedRef = useRef<string | null>(null);

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
    } else if (session) {
      // Session exists but href not ready yet (bindOwner / status) — keep splash.
      return;
    } else if (!languageSelected) {
      target = "/(onboarding)/language";
    } else if (!hasRequestedPermissions) {
      target = "/(permissions)/request";
    } else {
      target = "/(auth)/login";
    }

    if (!target) return;

    const next = String(target);
    const prev = committedRef.current;

    // Signing out / deleted rider → always allow login (reset sticky commit).
    if (next.includes("/(auth)/login")) {
      committedRef.current = next;
      try {
        router.replace(target);
      } catch (err) {
        committedRef.current = null;
        console.warn("[Index] Navigation not ready yet:", err);
      }
      return;
    }

    // Already committed this exact target.
    if (prev === next) return;

    // Stay inside onboarding once routed there — in-flow screens own further replaces.
    if (
      prev &&
      prev.includes("/(onboarding)/") &&
      next.includes("/(onboarding)/")
    ) {
      return;
    }

    // Stay on tabs once home is unlocked (unless signing out → login).
    if (prev === "/(tabs)" && next === "/(tabs)") return;

    committedRef.current = next;
    try {
      router.replace(target);
    } catch (err) {
      committedRef.current = null;
      console.warn("[Index] Navigation not ready yet:", err);
    }
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
