/**
 * Entry – redirect to login, onboarding (profile incomplete), or main app.
 */

import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/store/authStore";
import { profileService } from "@/services/profile.service";
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
    profileService
      .getProfile()
      .then((profile) => {
        if (cancelled) return;
        // Only allow home when profile is explicitly completed; otherwise complete profile first
        if (profile?.profile_completed === true) {
          router.replace("/(tabs)/");
        } else {
          router.replace("/(onboarding)");
        }
      })
      .catch((err: { response?: { status?: number; data?: { error?: string } } }) => {
        if (cancelled) return;
        const status = err?.response?.status;
        const errorCode = err?.response?.data?.error;
        if (status === 401 && (errorCode === "user_deleted" || errorCode === "session_revoked")) {
          return;
        }
        router.replace("/(onboarding)");
      })
      .finally(() => {
        if (!cancelled) setCheckingProfile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, session?.accessToken, router]);

  if (!hydrated || checkingProfile) {
    return <GatiMitraBootstrapScreen variant="index" />;
  }
  return <View style={{ flex: 1 }} />;
}
