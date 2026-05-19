"use client";

import { usePermissions } from "@/hooks/usePermissions";

/** True when the user may run store onboarding verify / reject actions (admin merchant access or super admin). */
export function useCanStoreVerify() {
  const { isSuperAdmin, canTogglePortal, loading } = usePermissions();
  return {
    canStoreVerify: isSuperAdmin || canTogglePortal,
    loading,
  };
}
