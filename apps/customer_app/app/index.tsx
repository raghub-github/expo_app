/**
 * Entry – redirect to login, onboarding (profile incomplete), or main app.
 * Uses cached profile first so splash never waits on a network round-trip.
 *
 * Under the root branding overlay this screen must NOT paint blank mint/white —
 * soft home-colored hold only; the branded splash covers until Home/Login mounts
 * and marks shell ready (do NOT mark shell ready here — that caused white flash).
 */

import { useCallback, useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      // Auth disk read still in flight after splash budget — hold index under cover.
      if (sessionRestorePending) return;
      setCheckingProfile(false);
      if (
        !redirectedRef.current &&
        canRedirectFromIndex(focusedRef.current, segmentsRef.current, "IndexScreen.no-session")
      ) {
        redirectedRef.current = true;
        startupMeasure("index_redirect_login", "process_start");
        router.replace("/(auth)/login");
      }
      return;
    }

    let cancelled = false;
    setCheckingProfile(true);

    void (async () => {
      // Instant path: sync MMKV/memory cache — no await before first navigation.
      const sync = readSyncCachedProfile();
      if (sync) {
        if (cancelled) return;
        setCheckingProfile(false);
        if (sync.profile_completed === true) {
          if (
            redirectedRef.current ||
            !canRedirectFromIndex(focusedRef.current, segmentsRef.current, "IndexScreen.syncProfile")
          ) {
            return;
          }
          redirectedRef.current = true;
          const target = hrefForRequestedPrimaryTab();
          startupMeasure("index_redirect_home_sync", "process_start");
          foodFixDbg("INDEX redirect", {
            source: "IndexScreen.syncProfile",
            method: "router.replace",
            target,
            pathname: segmentsRef.current.join("/") || "/",
            reason: "profile-complete-sync",
          });
          foodNavDbg("LEAVE", {
            source: "IndexScreen.syncProfile",
            method: "router.replace",
            to: target,
            reason: "profile-complete-redirect-requested-tab",
          });
          router.replace(target as never);
        } else if (
          !redirectedRef.current &&
          canRedirectFromIndex(
            focusedRef.current,
            segmentsRef.current,
            "IndexScreen.syncProfile-onboarding"
          )
        ) {
          redirectedRef.current = true;
          startupMeasure("index_redirect_onboarding_sync", "process_start");
          router.replace("/(onboarding)");
        }
        void fetchProfileWithCache().catch(() => {});
        return;
      }

      // Disk / AsyncStorage path (cold KV miss). Cap wait so splash cover isn't
      // stuck behind a wedged AsyncStorage read — network fetch still follows.
      const cached = await Promise.race([
        readCachedProfile(),
        new Promise<undefined>((resolve) => {
          setTimeout(() => resolve(undefined), 450);
        }),
      ]);
      if (cancelled) return;
      if (cached) {
        setCheckingProfile(false);
        if (cached.profile_completed === true) {
          if (
            redirectedRef.current ||
            !canRedirectFromIndex(focusedRef.current, segmentsRef.current, "IndexScreen.cachedProfile")
          ) {
            return;
          }
          redirectedRef.current = true;
          const target = hrefForRequestedPrimaryTab();
          startupMeasure("index_redirect_home_cache", "process_start");
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
        } else if (
          !redirectedRef.current &&
          canRedirectFromIndex(
            focusedRef.current,
            segmentsRef.current,
            "IndexScreen.cachedProfile-onboarding"
          )
        ) {
          redirectedRef.current = true;
          startupMeasure("index_redirect_onboarding_cache", "process_start");
          router.replace("/(onboarding)");
        }
        void fetchProfileWithCache().catch(() => {});
        return;
      }

      try {
        const profile = await fetchProfileWithCache();
        if (cancelled) return;
        if (profile?.profile_completed === true) {
          if (
            redirectedRef.current ||
            !canRedirectFromIndex(focusedRef.current, segmentsRef.current, "IndexScreen.fetchProfile")
          ) {
            return;
          }
          redirectedRef.current = true;
          const target = hrefForRequestedPrimaryTab();
          startupMeasure("index_redirect_home_fetch", "process_start");
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
        } else if (
          !redirectedRef.current &&
          canRedirectFromIndex(
            focusedRef.current,
            segmentsRef.current,
            "IndexScreen.fetchProfile-onboarding"
          )
        ) {
          redirectedRef.current = true;
          startupMeasure("index_redirect_onboarding_fetch", "process_start");
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
        if (
          !redirectedRef.current &&
          canRedirectFromIndex(focusedRef.current, segmentsRef.current, "IndexScreen.fetchProfile-error")
        ) {
          redirectedRef.current = true;
          router.replace("/(onboarding)");
        }
      } finally {
        if (!cancelled) setCheckingProfile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, sessionRestorePending, session?.accessToken, router]);

  // Mint hold under branded overlay — never near-white softBackground (looks blank).
  if (!hydrated || checkingProfile) {
    return <View style={styles.hold} accessibilityLabel="Loading" />;
  }
  return <View style={styles.hold} />;
}

const styles = StyleSheet.create({
  hold: {
    flex: 1,
    backgroundColor: GatiMitraColors.splashMint,
  },
});
