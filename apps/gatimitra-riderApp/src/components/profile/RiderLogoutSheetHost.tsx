import React from "react";
import { router } from "expo-router";
import { LogoutChoiceBottomSheet } from "@/src/components/profile/LogoutChoiceBottomSheet";
import { LogoutReasonBottomSheet } from "@/src/components/profile/LogoutReasonBottomSheet";
import { riderApi } from "@/src/services/api/riderApi";
import { useLogoutSheetStore } from "@/src/stores/logoutSheetStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import type { RiderLogoutReasonCode } from "@/src/lib/rider-logout-reasons";

export function RiderLogoutSheetHost() {
  const visible = useLogoutSheetStore((s) => s.visible);
  const step = useLogoutSheetStore((s) => s.step);
  const scope = useLogoutSheetStore((s) => s.scope);
  const close = useLogoutSheetStore((s) => s.close);
  const selectScope = useLogoutSheetStore((s) => s.selectScope);
  const backToChoice = useLogoutSheetStore((s) => s.backToChoice);
  const setSession = useSessionStore((s) => s.setSession);

  const onConfirm = async (
    reasonCode: RiderLogoutReasonCode,
    reasonText?: string,
  ) => {
    const logoutAllDevices = scope === "all_devices";
    try {
      await riderApi.logout({
        reasonCode,
        reasonText,
        logoutAllDevices,
      });
    } catch (err) {
      console.warn("[RiderLogoutSheetHost] logout failed:", err);
      // Still clear local session so rider is not stuck signed-in on a dead token.
    }
    try {
      const { runRiderPushUnregister } = await import("@/src/lib/riderPushUnregister");
      await runRiderPushUnregister();
    } catch {
      /* best-effort */
    }
    await useDutyStore.getState().setDutyStatus(false);
    close();
    await setSession(null);
    router.replace("/(auth)/login");
  };

  return (
    <>
      <LogoutChoiceBottomSheet
        visible={visible && step === "choice"}
        onClose={close}
        onSelect={selectScope}
      />
      <LogoutReasonBottomSheet
        visible={visible && step === "reason"}
        onClose={backToChoice}
        onConfirm={onConfirm}
      />
    </>
  );
}
