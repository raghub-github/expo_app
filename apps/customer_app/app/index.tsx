/**
 * Entry – redirect to login, onboarding (profile incomplete), or main app.
 * Uses cached profile first so splash never waits on a network round-trip.
 *
 * Under the root branding overlay this screen must NOT paint blank mint/white —
 * soft home-colored hold only; the branded splash covers until Home/Login mounts
 * and marks shell ready (do NOT mark shell ready here — that caused white flash).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useFocusEffect, useRouter, useSegments } from "expo-router";
import { useAuthStore } from "@/store/authStore";
import {
  fetchProfileWithCache,
  readCachedProfile,
  readSyncCachedProfile,
} from "@/lib/profileCache";
import { GatiMitraColors } from "@/constants/gatimitra";
import { foodFixDbg, foodNavDbg } from "@/lib/tabNavDebug";
import { hrefForRequestedPrimaryTab } from "@/lib/customerPrimaryTabNav";
import { startupMeasure } from "@/lib/startupPerf";

/** Cap network profile under splash — onboarding owns incomplete / unknown. */
const PROFILE_FETCH_BUDGET_MS = 400;

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
  const sessionRestorePending = useAuthStore((s) => s.sessionRestorePending);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const focusedRef = useRef(true);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const redirectedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      return () => {
        focusedRef.current = false;
      };
    }, [])
  );

  const goHome = useCallback(
    (source: string) => {
      if (
        redirectedRef.current ||
        !canRedirectFromIndex(focusedRef.current, segmentsRef.current, source)
      ) {
        return;
      }
      redirectedRef.current = true;
      const target = hrefForRequestedPrimaryTab();
      foodFixDbg("INDEX redirect", {
        source,
        method: "router.replace",
        target,
        pathname: segmentsRef.current.join("/") || "/",
        reason: "profile-complete",
      });
      foodNavDbg("LEAVE", {
        source,
        method: "router.replace",
        to: target,
        reason: "profile-complete-redirect-requested-tab",
      });
      router.replace(target as never);
    },
    [router]
  );

  const goOnboarding = useCallback(
    (source: string) => {
      if (
        redirectedRef.current ||
        !canRedirectFromIndex(focusedRef.current, segmentsRef.current, source)
      ) {
        return;
      }
      redirectedRef.current = true;
      router.replace("/(onboarding)");
    },
    [router]
  );

  const goLogin = useCallback(
    (source: string) => {
      if (
        redirectedRef.current ||
        !canRedirectFromIndex(focusedRef.current, segmentsRef.current, source)
      ) {
        return;
      }
      redirectedRef.current = true;
      startupMeasure("index_redirect_login", "process_start");
      router.replace("/(auth)/login");
    },
    [router]
  );

  // Layout-phase: leave Index before paint when sync cache already knows the destination.
  useLayoutEffect(() => {
    if (!hydrated || redirectedRef.current) return;
    if (!session?.accessToken) {
      if (sessionRestorePending) return;
      goLogin("IndexScreen.layout-no-session");
      return;
    }
    const sync = readSyncCachedProfile();
    if (!sync) return;
    setCheckingProfile(false);
    if (sync.profile_completed === true) {
      startupMeasure("index_redirect_home_sync", "process_start");
      goHome("IndexScreen.layout-syncProfile");
    } else {
      startupMeasure("index_redirect_onboarding_sync", "process_start");
      goOnboarding("IndexScreen.layout-syncProfile-onboarding");
    }
  }, [hydrated, session?.accessToken, sessionRestorePending, goHome, goOnboarding, goLogin]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      // Auth disk read still in flight after splash budget — hold briefly, then login.
      if (sessionRestorePending) return;
      setCheckingProfile(false);
      goLogin("IndexScreen.no-session");
      return;
    }

    if (redirectedRef.current) {
      setCheckingProfile(false);
      return;
    }

    let cancelled = false;
    setCheckingProfile(true);

    void (async () => {
      const sync = readSyncCachedProfile();
      if (sync) {
        if (cancelled) return;
        setCheckingProfile(false);
        if (sync.profile_completed === true) {
          startupMeasure("index_redirect_home_sync", "process_start");
          goHome("IndexScreen.syncProfile");
        } else {
          startupMeasure("index_redirect_onboarding_sync", "process_start");
          goOnboarding("IndexScreen.syncProfile-onboarding");
        }
        void fetchProfileWithCache().catch(() => {});
        return;
      }

      // Disk / AsyncStorage path (cold KV miss). Cap wait so splash cover isn't
      // stuck behind a wedged AsyncStorage read — network fetch still follows.
      const cached = await Promise.race([
        readCachedProfile(),
        new Promise<undefined>((resolve) => {
          setTimeout(() => resolve(undefined), 150);
        }),
      ]);
      if (cancelled || redirectedRef.current) return;
      if (cached) {
        setCheckingProfile(false);
        if (cached.profile_completed === true) {
          startupMeasure("index_redirect_home_cache", "process_start");
          goHome("IndexScreen.cachedProfile");
        } else {
          startupMeasure("index_redirect_onboarding_cache", "process_start");
          goOnboarding("IndexScreen.cachedProfile-onboarding");
        }
        void fetchProfileWithCache().catch(() => {});
        return;
      }

      try {
        const profile = await Promise.race([
          fetchProfileWithCache(),
          new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), PROFILE_FETCH_BUDGET_MS);
          }),
        ]);
        if (cancelled || redirectedRef.current) return;
        if (profile?.profile_completed === true) {
          startupMeasure("index_redirect_home_fetch", "process_start");
          goHome("IndexScreen.fetchProfile");
        } else {
          // Timed out or incomplete — leave Index so shell can mark ready.
          // Onboarding bounces completed users to tabs once profile lands.
          if (profile == null) {
            void fetchProfileWithCache().catch(() => {});
          }
          startupMeasure("index_redirect_onboarding_fetch", "process_start");
          goOnboarding("IndexScreen.fetchProfile-onboarding");
        }
      } catch (err: unknown) {
        if (cancelled || redirectedRef.current) return;
        const ax = err as { response?: { status?: number; data?: { error?: string } } };
        const status = ax?.response?.status;
        const errorCode = ax?.response?.data?.error;
        if (status === 401 && (errorCode === "user_deleted" || errorCode === "session_revoked")) {
          return;
        }
        goOnboarding("IndexScreen.fetchProfile-error");
      } finally {
        if (!cancelled) setCheckingProfile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, sessionRestorePending, session?.accessToken, goHome, goOnboarding, goLogin]);

  // Soft hold under root overlays — mint-only looked like a broken blank splash
  // when the branded cover dismissed before Home skeletons painted.
  if (!hydrated || checkingProfile) {
    return <View style={styles.hold} accessibilityLabel="Loading" />;
  }
  return <View style={styles.hold} />;
}

const styles = StyleSheet.create({
  hold: {
    flex: 1,
    backgroundColor: GatiMitraColors.softBackground,
  },
});
