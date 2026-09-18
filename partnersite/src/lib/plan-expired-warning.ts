/** Session-scoped dismiss for plan-expired warning modal. */
export function planExpiredWarningStorageKey(storeId: string, subscriptionId?: number | string | null) {
  // Prefer store-only key so subscription id jitter cannot re-show every navigation.
  return `mx_plan_expired_warn_v2:${storeId}`;
}

export function wasPlanExpiredWarningShown(storeId: string, subscriptionId?: number | string | null): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(planExpiredWarningStorageKey(storeId, subscriptionId)) === '1') {
      return true;
    }
    // Legacy keys (store + subscription) from earlier builds.
    const legacy = `mx_plan_expired_warn:${storeId}:${subscriptionId ?? 'latest'}`;
    return sessionStorage.getItem(legacy) === '1';
  } catch {
    return false;
  }
}

export function markPlanExpiredWarningShown(storeId: string, subscriptionId?: number | string | null) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(planExpiredWarningStorageKey(storeId, subscriptionId), '1');
    // Also stamp legacy key so mixed tab versions stay quiet.
    sessionStorage.setItem(`mx_plan_expired_warn:${storeId}:${subscriptionId ?? 'latest'}`, '1');
    sessionStorage.setItem(`mx_plan_expired_warn:${storeId}:latest`, '1');
  } catch {
    /* ignore */
  }
}

export type PlanExpiredCheckInput = {
  isActive?: boolean;
  isExpired?: boolean;
  autoRenew?: boolean;
  planPrice?: number;
  storeId?: string | null;
  subscriptionId?: number | string | null;
};

export function shouldShowPlanExpiredWarning(input: PlanExpiredCheckInput): boolean {
  if (!input.storeId) return false;
  if (input.isActive === true) return false;
  if (input.isExpired !== true) return false;
  if (input.autoRenew === true) return false;
  if ((input.planPrice ?? 0) <= 0) return false;
  if (wasPlanExpiredWarningShown(input.storeId, input.subscriptionId)) return false;
  return true;
}
