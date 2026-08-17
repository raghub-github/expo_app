import React, { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AddBankAccountBottomSheet } from "@/src/components/earnings/AddBankAccountBottomSheet";
import { useEarningsBankSheetStore } from "@/src/stores/earningsBankSheetStore";
import { useEarningsSummary } from "@/src/hooks/useEarnings";
import { useRiderBankAddGate } from "@/src/hooks/useRiderBankAccount";
import { useUnlockCountdown } from "@/src/hooks/useUnlockCountdown";

export function EarningsBankSheetHost() {
  const queryClient = useQueryClient();
  const visible = useEarningsBankSheetStore((s) => s.visible);
  const close = useEarningsBankSheetStore((s) => s.close);
  const { data: earnings } = useEarningsSummary();
  const isFrozen = Boolean(earnings?.isFrozen);
  const { data: addGate } = useRiderBankAddGate();
  const countdown = useUnlockCountdown(addGate?.unlockAt);
  const addLocked = Boolean(addGate?.locked && countdown.locked);

  useEffect(() => {
    if ((isFrozen || addLocked) && visible) close();
  }, [isFrozen, addLocked, visible, close]);

  return (
    <AddBankAccountBottomSheet
      visible={visible && !isFrozen && !addLocked}
      onDismiss={close}
      onSuccess={() => {
        void queryClient.invalidateQueries({ queryKey: ["rider", "earnings", "summary"] });
        void queryClient.invalidateQueries({ queryKey: ["rider", "payment-methods", "bank"] });
      }}
    />
  );
}
