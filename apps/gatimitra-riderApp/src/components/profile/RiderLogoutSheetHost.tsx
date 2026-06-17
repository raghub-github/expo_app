import React from "react";
import { router } from "expo-router";
import { LogoutReasonBottomSheet } from "@/src/components/profile/LogoutReasonBottomSheet";
import { riderApi } from "@/src/services/api/riderApi";
import { useLogoutSheetStore } from "@/src/stores/logoutSheetStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import type { RiderLogoutReasonCode } from "@/src/lib/rider-logout-reasons";

export function RiderLogoutSheetHost() {
  const visible = useLogoutSheetStore((s) => s.visible);
  const close = useLogoutSheetStore((s) => s.close);
  const setSession = useSessionStore((s) => s.setSession);

  const onConfirm = async (
    reasonCode: RiderLogoutReasonCode,
    reasonText?: string,
  ) => {
    try {
      await riderApi.logout({ reasonCode, reasonText });
    } catch (err) {
      console.warn("[RiderLogoutSheetHost] logout reason save failed:", err);
    }
    await useDutyStore.getState().setDutyStatus(false);
    close();
    await setSession(null);
    router.replace("/(auth)/login");
  };

  return (
    <LogoutReasonBottomSheet
      visible={visible}
      onClose={close}
      onConfirm={onConfirm}
    />
  );
}
