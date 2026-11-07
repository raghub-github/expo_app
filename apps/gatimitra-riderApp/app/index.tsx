// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import { router, useRootNavigationState, type Href } from "expo-router";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useLanguageStore } from "@/src/stores/languageStore";
import { useOnboardingGate } from "@/src/hooks/useOnboardingGate";
import { RiderBootstrapScreen } from "@/src/components/RiderBootstrapScreen";
import { useEffect, useRef, useState } from "react";

/** Absolute wall clock — never leave the branded splash up longer than this. */
const INDEX_NAV_FAILSAFE_MS = 10_000;

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
  const session = useSessionStore((s) => s.session);
  const sessionHydrated = useSessionStore((s) => s.hydrated);
  const languageSelected = useLanguageStore((s) => s.languageSelected);
  const languageHydrated = useLanguageStore((s) => s.hydrated);
  const hydrateLanguage = useLanguageStore((s) => s.hydrate);
  const { ready: onboardingGateReady, href: onboardingHref, canAccessTabs } = useOnboardingGate();
  /** First destination we committed — ignore later href flicker within the same bucket. */
  const committedRef = useRef<string | null>(null);
  const [navFailsafeElapsed, setNavFailsafeElapsed] = useState(false);

  useEffect(() => {
    void hydrateLanguage().catch((err) => {
      console.warn("[Index] Language hydration failed:", err);
    });
  }, [hydrateLanguage]);

  useEffect(() => {
    const t = setTimeout(() => setNavFailsafeElapsed(true), INDEX_NAV_FAILSAFE_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!nav?.key) return;

    let target: Href | null = null;
    // Prefer Home as soon as tabs are unlocked (live/cached approved status).
    // Do not wait on optional onboardingHref churn once canAccessTabs is true.
    if (sessionHydrated && session && canAccessTabs) {
      target = "/(tabs)";
    } else if (!languageHydrated || !sessionHydrated) {
      // Absolute failsafe: leave splash even if language/session hydrate stalls.
      if (navFailsafeElapsed) {
        target = languageSelected ? "/(auth)/login" : "/(onboarding)/language";
      } else {
        return;
      }
    } else if (session && !onboardingGateReady) {
      if (navFailsafeElapsed) {
        // Gate stalled — prefer cached tabs unlock, else safe login (never hang).
        target = canAccessTabs ? "/(tabs)" : onboardingHref ?? "/(auth)/login";
      } else {
        return;
      }
    } else if (session && onboardingHref) {
      target = onboardingHref;
    } else if (session) {
      // Session exists but href not ready — failsafe instead of infinite splash.
      if (navFailsafeElapsed) {
        target = canAccessTabs ? "/(tabs)" : "/(auth)/login";
      } else {
        return;
      }
    } else if (!languageSelected) {
      target = "/(onboarding)/language";
    } else {
      // Logged-out + language chosen → login (permissions prompt happens later).
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
    languageHydrated,
    sessionHydrated,
    session,
    onboardingGateReady,
    onboardingHref,
    canAccessTabs,
    languageSelected,
    navFailsafeElapsed,
  ]);

  return <RiderBootstrapScreen />;
}
