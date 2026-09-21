/**
 * Entry – redirect to login, onboarding (profile incomplete), or main app.
 * Uses cached profile first so splash never waits on a network round-trip.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useFocusEffect, useRouter, useSegments } from "expo-router";
import { useAuthStore } from "@/store/authStore";
import {
  fetchProfileWithCache,
  readCachedProfile,
} from "@/lib/profileCache";
import { GatiMitraBootstrapScreen } from "@/components/GatiMitraBootstrapScreen";
import { foodFixDbg, foodNavDbg } from "@/lib/tabNavDebug";
import { hrefForRequestedPrimaryTab } from "@/lib/customerPrimaryTabNav";

function isRootIndexRoute(segments: readonly string[]): boolean {
  const root = segments[0] ?? "";
  return !root || root === "index";
}

function canRedirectFromIndex(
  focused: boolean,
  segments: readonly string[],
  source: string
) {
  const stillIndex = isRootIndexRoute(segments);
  if (focused && stillIndex) return true;
  foodFixDbg("STALE index redirect blocked", {
    source,
    method: "router.replace",
    target: hrefForRequestedPrimaryTab(),
    pathname: segments.join("/") || "/",
    reason: !focused ? "index-blurred" : "index-not-active-route",
  });
  return false;
}

export default function IndexScreen() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const focusedRef = useRef(true);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      return () => {
        focusedRef.current = false;
      };
    }, [])
  );

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      setCheckingProfile(false);
      if (canRedirectFromIndex(focusedRef.current, segmentsRef.current, "IndexScreen.no-session")) {
        router.replace("/(auth)/login");
      }
      return;
    }

    let cancelled = false;
    setCheckingProfile(true);

    void (async () => {
      // Instant path: disk cache decides the first route without blocking on network.
      const cached = await readCachedProfile();
      if (cancelled) return;
      if (cached) {
        setCheckingProfile(false);
        if (cached.profile_completed === true) {
          if (!canRedirectFromIndex(focusedRef.current, segmentsRef.current, "IndexScreen.cachedProfile")) return;
          const target = hrefForRequestedPrimaryTab();
          foodFixDbg("INDEX redirect", {
            source: "IndexScreen.cachedProfile",
            method: "router.replace",
            target,
            pathname: segmentsRef.current.join("/") || "/",
            reason: "profile-complete",
          });
          foodNavDbg("LEAVE", {
            source: "IndexScreen.cachedProfile",
            method: "router.replace",
            to: target,
            reason: "profile-complete-redirect-requested-tab",
          });
          router.replace(target as never);
        } else if (canRedirectFromIndex(focusedRef.current, segmentsRef.current, "IndexScreen.cachedProfile-onboarding")) {
          router.replace("/(onboarding)");
        }
        // Shared in-flight with ProfilePrefetch — one GET /me/profile.
        void fetchProfileWithCache().catch(() => {});
        return;
      }

      try {
        const profile = await fetchProfileWithCache();
        if (cancelled) return;
        if (profile?.profile_completed === true) {
          if (!canRedirectFromIndex(focusedRef.current, segmentsRef.current, "IndexScreen.fetchProfile")) return;
          const target = hrefForRequestedPrimaryTab();
          foodFixDbg("INDEX redirect", {
            source: "IndexScreen.fetchProfile",
            method: "router.replace",
            target,
            pathname: segmentsRef.current.join("/") || "/",
            reason: "profile-complete",
          });
          foodNavDbg("LEAVE", {
            source: "IndexScreen.fetchProfile",
            method: "router.replace",
            to: target,
            reason: "profile-complete-redirect-requested-tab",
          });
          router.replace(target as never);
        } else if (canRedirectFromIndex(focusedRef.current, segmentsRef.current, "IndexScreen.fetchProfile-onboarding")) {
          router.replace("/(onboarding)");
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const ax = err as { response?: { status?: number; data?: { error?: string } } };
        const status = ax?.response?.status;
        const errorCode = ax?.response?.data?.error;
        if (status === 401 && (errorCode === "user_deleted" || errorCode === "session_revoked")) {
          return;
        }
        if (canRedirectFromIndex(focusedRef.current, segmentsRef.current, "IndexScreen.fetchProfile-error")) {
          router.replace("/(onboarding)");
        }
      } finally {
        if (!cancelled) setCheckingProfile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, session?.accessToken, router]);

  if (!hydrated || checkingProfile) {
    return <GatiMitraBootstrapScreen variant="index" />;
  }
  return <View style={{ flex: 1 }} />;
}
