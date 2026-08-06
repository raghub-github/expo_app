/**
 * Continuous auth gate — entry `index.tsx` alone is not enough.
 * Expo Router can restore (tabs)/profile without a session; this redirects
 * unauthenticated users back to login and keeps authenticated users off the
 * login screen.
 */

import { useEffect, useRef } from "react";
import { useRouter, useSegments } from "expo-router";
import { useAuthStore } from "@/store/authStore";

function isPublicUnauthedRoute(segments: readonly string[]): boolean {
  const root = segments[0] ?? "";
  if (!root || root === "index") return true;
  if (root === "(auth)") return true;
  if (root === "legal") return true;
  return false;
}

export function AuthNavigationGate() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.session?.accessToken ?? null);
  const redirectingRef = useRef(false);

  useEffect(() => {
    if (!hydrated) return;

    const root = segments[0] ?? "";
    const leaf = segments[1] ?? "";

    if (!accessToken) {
      if (isPublicUnauthedRoute(segments)) {
        redirectingRef.current = false;
        return;
      }
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      router.replace("/(auth)/login");
      return;
    }

    // Logged in but still on the phone login screen (e.g. restored stack).
    // Let OTP finish — only bounce away from login.
    if (root === "(auth)" && leaf === "login") {
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      router.replace("/");
      return;
    }

    redirectingRef.current = false;
  }, [hydrated, accessToken, segments, router]);

  return null;
}

export default AuthNavigationGate;
