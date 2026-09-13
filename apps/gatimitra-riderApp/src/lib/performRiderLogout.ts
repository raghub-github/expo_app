import { router } from "expo-router";
import { riderApi } from "@/src/services/api/riderApi";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import type { RiderLogoutReasonCode } from "@/src/lib/rider-logout-reasons";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch(() => {
        clearTimeout(t);
        resolve(null);
      });
  });
}

/** Shared sign-out used by profile sheets and onboarding Help confirm. */
export async function performRiderLogout(opts?: {
  reasonCode?: RiderLogoutReasonCode;
  reasonText?: string;
  logoutAllDevices?: boolean;
}): Promise<void> {
  const accessToken = useSessionStore.getState().session?.accessToken ?? null;

  // Clear local auth FIRST so UI can never stay "logged in" if the API hangs.
  try {
    await useDutyStore.getState().setDutyStatus(false);
  } catch {
    /* ignore */
  }
  try {
    await useOnboardingStore.getState().clear();
  } catch {
    try {
      await useOnboardingStore.getState().bindOwner(null);
    } catch {
      /* ignore */
    }
  }
  await useSessionStore.getState().setSession(null);

  try {
    router.replace("/(auth)/login");
  } catch (err) {
    console.warn("[performRiderLogout] navigate login failed:", err);
  }

  // Best-effort server cleanup (never block local logout).
  void (async () => {
    try {
      const { runRiderPushUnregister } = await import("@/src/lib/riderPushUnregister");
      await withTimeout(runRiderPushUnregister(accessToken), 4000);
    } catch {
      /* best-effort */
    }
    try {
      await withTimeout(
        riderApi.logout({
          reasonCode: opts?.reasonCode ?? "OTHER",
          reasonText: opts?.reasonText,
          logoutAllDevices: opts?.logoutAllDevices === true,
        }),
        5000,
      );
    } catch (err) {
      console.warn("[performRiderLogout] logout API failed:", err);
    }
  })();
}
