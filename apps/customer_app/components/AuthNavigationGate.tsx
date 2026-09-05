/**
 * Continuous auth gate — entry `index.tsx` alone is not enough.
 * Expo Router can restore (tabs)/profile without a session; this redirects
 * unauthenticated users back to login and keeps authenticated users off the
 * login screen.
 */

import { useEffect, useRef } from "react";
import { useRouter, useSegments, useGlobalSearchParams } from "expo-router";
import { useAuthStore } from "@/store/authStore";
import {
  peekPendingAddressShareToken,
  storePendingAddressShareToken,
} from "@/lib/pendingAddressShare";

function isPublicUnauthedRoute(segments: readonly string[]): boolean {
  const root = segments[0] ?? "";
  if (!root || root === "index") return true;
  if (root === "(auth)") return true;
  if (root === "legal") return true;
  // Shared-address App Link must reach /address/save while logged out so the
  // token can be persisted before login.
  if (root === "address") return true;
  return false;
}

export function AuthNavigationGate() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const params = useGlobalSearchParams<{ id?: string }>();
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.session?.accessToken ?? null);
  const redirectingRef = useRef(false);

  useEffect(() => {
    if (!hydrated) return;

    const root = segments[0] ?? "";
    const leaf = segments[1] ?? "";
    const shareToken = typeof params.id === "string" ? params.id.trim() : "";

    if (!accessToken) {
      if (root === "address" && shareToken) {
        void storePendingAddressShareToken(shareToken);
      }
      if (isPublicUnauthedRoute(segments)) {
        redirectingRef.current = false;
        return;
      }
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      router.replace("/(auth)/login");
      return;
    }

    if (root === "(auth)" && leaf === "login") {
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      let cancelled = false;
      void (async () => {
        const pending = shareToken || (await peekPendingAddressShareToken());
        if (cancelled) {
          redirectingRef.current = false;
          return;
        }
        if (pending) {
          router.replace(`/address/save?id=${encodeURIComponent(pending)}`);
          return;
        }
        router.replace("/");
      })();
      return () => {
        cancelled = true;
      };
    }

    redirectingRef.current = false;
  }, [hydrated, accessToken, segments, router, params.id]);

  return null;
}

export default AuthNavigationGate;
