import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AddBankAccountBottomSheet } from "@/src/components/earnings/AddBankAccountBottomSheet";
import { useEarningsBankSheetStore } from "@/src/stores/earningsBankSheetStore";

export function EarningsBankSheetHost() {
  const queryClient = useQueryClient();
  const visible = useEarningsBankSheetStore((s) => s.visible);
  const close = useEarningsBankSheetStore((s) => s.close);

  return (
    <AddBankAccountBottomSheet
      visible={visible}
      onDismiss={close}
      onSuccess={() => {
        void queryClient.invalidateQueries({ queryKey: ["rider", "earnings", "summary"] });
        void queryClient.invalidateQueries({ queryKey: ["rider", "payment-methods", "bank"] });
      }}
    />
  );
}
