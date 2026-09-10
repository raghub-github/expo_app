import React from "react";
import { LogoutChoiceBottomSheet } from "@/src/components/profile/LogoutChoiceBottomSheet";
import { LogoutReasonBottomSheet } from "@/src/components/profile/LogoutReasonBottomSheet";
import { useLogoutSheetStore } from "@/src/stores/logoutSheetStore";
import { performRiderLogout } from "@/src/lib/performRiderLogout";
import type { RiderLogoutReasonCode } from "@/src/lib/rider-logout-reasons";

export function RiderLogoutSheetHost() {
  const visible = useLogoutSheetStore((s) => s.visible);
  const step = useLogoutSheetStore((s) => s.step);
  const scope = useLogoutSheetStore((s) => s.scope);
  const close = useLogoutSheetStore((s) => s.close);
  const selectScope = useLogoutSheetStore((s) => s.selectScope);
  const backToChoice = useLogoutSheetStore((s) => s.backToChoice);

  const onConfirm = async (
    reasonCode: RiderLogoutReasonCode,
    reasonText?: string,
  ) => {
    close();
    await performRiderLogout({
      reasonCode,
      reasonText,
      logoutAllDevices: scope === "all_devices",
    });
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
