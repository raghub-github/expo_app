"use client";

import { useMerchantDashboardAccess } from "@/hooks/useMerchantDashboardAccess";

/** True when the user may run store onboarding verify / reject actions. */
export function useCanStoreVerify() {
  const { canOnboard, loading } = useMerchantDashboardAccess();
  return {
    canStoreVerify: canOnboard,
    loading,
  };
}
