/**
 * Entry – redirect to login, onboarding (profile incomplete), or main app.
 * Uses cached profile first so splash never waits on a network round-trip.
 */

import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/store/authStore";
import {
  fetchProfileWithCache,
  readCachedProfile,
} from "@/lib/profileCache";
import { GatiMitraBootstrapScreen } from "@/components/GatiMitraBootstrapScreen";

export default function IndexScreen() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [checkingProfile, setCheckingProfile] = useState(true);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      setCheckingProfile(false);
      router.replace("/(auth)/login");
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
          router.replace("/(tabs)/");
        } else {
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
          router.replace("/(tabs)/");
        } else {
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
        router.replace("/(onboarding)");
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
