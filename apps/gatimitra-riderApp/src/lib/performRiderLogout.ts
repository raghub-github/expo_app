import { router } from "expo-router";
import { riderApi } from "@/src/services/api/riderApi";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import type { RiderLogoutReasonCode } from "@/src/lib/rider-logout-reasons";

/** Shared sign-out used by profile sheets and onboarding Help confirm. */
export async function performRiderLogout(opts?: {
  reasonCode?: RiderLogoutReasonCode;
  reasonText?: string;
  logoutAllDevices?: boolean;
}): Promise<void> {
  const accessToken = useSessionStore.getState().session?.accessToken ?? null;
  try {
    const { runRiderPushUnregister } = await import("@/src/lib/riderPushUnregister");
    await runRiderPushUnregister(accessToken);
  } catch {
    /* best-effort */
  }
  try {
    await riderApi.logout({
      reasonCode: opts?.reasonCode ?? "OTHER",
      reasonText: opts?.reasonText,
      logoutAllDevices: opts?.logoutAllDevices === true,
    });
  } catch (err) {
    console.warn("[performRiderLogout] logout failed:", err);
  }
  await useDutyStore.getState().setDutyStatus(false);
  await useOnboardingStore.getState().bindOwner(null);
  await useSessionStore.getState().setSession(null);
  router.replace("/(auth)/login");
}
