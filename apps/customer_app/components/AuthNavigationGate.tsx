/**
 * Continuous auth + profile-completion gate.
 *
 * Rules:
 * 1) No session → login (except public unauthed routes).
 * 2) Session + profile_completed !== true → never allow home/(tabs)/app surfaces;
 *    always send to /(onboarding). Fail closed if profile cannot be confirmed.
 * 3) OTP owns its own post-verify navigation (avoid race with this gate).
 */

import { useEffect, useRef } from "react";
import { useRouter, useSegments, useGlobalSearchParams } from "expo-router";
import { useAuthStore } from "@/store/authStore";
import {
  peekPendingAddressShareToken,
  storePendingAddressShareToken,
} from "@/lib/pendingAddressShare";
import {
  fetchProfileWithCache,
  hasCompletedProfileSync,
  readCachedProfile,
  readSyncCachedProfile,
} from "@/lib/profileCache";
import { foodNavDbg } from "@/lib/tabNavDebug";
import { hrefForRequestedPrimaryTab } from "@/lib/customerPrimaryTabNav";

function isPublicUnauthedRoute(segments: readonly string[]): boolean {
  const root = segments[0] ?? "";
  if (!root || root === "index") return true;
  if (root === "(auth)") return true;
  if (root === "legal") return true;
  if (root === "address") return true;
  return false;
}

/** Incomplete profiles may only stay on these routes until ID/profile is created. */
function isIncompleteProfileAllowedRoute(segments: readonly string[]): boolean {
  const root = segments[0] ?? "";
  if (!root || root === "index") return true;
  if (root === "(auth)") return true;
  if (root === "(onboarding)") return true;
  if (root === "legal") return true;
  if (root === "address") return true;
  return false;
}

/**
 * Fail closed: only true when we positively know profile_completed === true.
 * Missing/incomplete cache → network; network failure → incomplete (no home).
 */
async function resolveProfileCompleted(): Promise<boolean> {
  const sync = readSyncCachedProfile();
  if (sync?.profile_completed === true) return true;
  // A present-but-not-completed cache is authoritative (don't fall through to the
  // network). profile_completed is narrowed to false here, so the null check suffices.
  if (sync != null) return false;

  const cached = await readCachedProfile();
  if (cached?.profile_completed === true) return true;
  if (cached != null) return false;

  try {
    const profile = await fetchProfileWithCache();
    return profile?.profile_completed === true;
  } catch {
    return false;
  }
}

async function replaceAuthedDestination(
  router: ReturnType<typeof useRouter>,
  shareToken: string
): Promise<void> {
  const pending = shareToken || (await peekPendingAddressShareToken());
  if (pending) {
    router.replace(`/address/save?id=${encodeURIComponent(pending)}`);
    return;
  }

  const complete = await resolveProfileCompleted();
  if (complete) {
    const target = hrefForRequestedPrimaryTab();
    foodNavDbg("LEAVE", {
      source: "AuthNavigationGate.replaceAuthedDestination",
      method: "router.replace",
      to: target,
      reason: "authed-destination-requested-tab",
    });
    router.replace(target as never);
    return;
  }
  router.replace("/(onboarding)");
}

export function AuthNavigationGate() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const params = useGlobalSearchParams<{ id?: string }>();
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.session?.accessToken ?? null);
  const lastRedirectAtRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!hydrated) return;

    const root = segments[0] ?? "";
    const leaf = segments[1] ?? "";
    const shareToken = typeof params.id === "string" ? params.id.trim() : "";
    const now = Date.now();
    const canRedirect = now - lastRedirectAtRef.current > 500;

    if (!accessToken) {
      if (root === "address" && shareToken) {
        void storePendingAddressShareToken(shareToken);
      }
      if (isPublicUnauthedRoute(segments)) {
        return;
      }
      if (!canRedirect) return;
      lastRedirectAtRef.current = now;
      router.replace("/(auth)/login");
      return;
    }

    // OTP finishes verify → writes cache → onboarding/home itself.
    if (root === "(auth)" && leaf === "otp") {
      return;
    }

    // Authenticated on login → resolve destination once.
    if (root === "(auth)" && (leaf === "login" || !leaf)) {
      if (!canRedirect || inFlightRef.current) return;
      lastRedirectAtRef.current = now;
      inFlightRef.current = true;
      let cancelled = false;
      void (async () => {
        try {
          if (cancelled) return;
          await replaceAuthedDestination(router, shareToken);
        } finally {
          inFlightRef.current = false;
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    // Hard block: no home / tabs / app surfaces until profile (ID) is created.
    // Fail closed immediately — do not leave the user on home while network resolves.
    if (!isIncompleteProfileAllowedRoute(segments)) {
      if (hasCompletedProfileSync()) {
        return;
      }
      if (!canRedirect) return;
      lastRedirectAtRef.current = now;
      router.replace("/(onboarding)");
      return;
    }
  }, [hydrated, accessToken, segments, router, params.id]);

  return null;
}

export default AuthNavigationGate;
