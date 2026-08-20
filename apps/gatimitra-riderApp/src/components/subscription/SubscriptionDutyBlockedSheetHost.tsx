import React from "react";
import { SubscriptionDutyBlockedSheet } from "@/src/components/subscription/SubscriptionDutyBlockedSheet";
import { useSubscriptionDutyBlockedSheetStore } from "@/src/stores/subscriptionDutyBlockedSheetStore";

/** Root-level host so Why? / duty-lock sheets overlay tabs instead of peeking. */
export function SubscriptionDutyBlockedSheetHost() {
  const visible = useSubscriptionDutyBlockedSheetStore((s) => s.visible);
  const close = useSubscriptionDutyBlockedSheetStore((s) => s.close);
  return <SubscriptionDutyBlockedSheet visible={visible} onClose={close} />;
}
