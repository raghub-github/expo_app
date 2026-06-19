/** Session-scoped dismiss for plan-expired warning modal. */
export function planExpiredWarningStorageKey(storeId: string, subscriptionId?: number | string | null) {
  return `mx_plan_expired_warn:${storeId}:${subscriptionId ?? 'latest'}`;
}

export function wasPlanExpiredWarningShown(storeId: string, subscriptionId?: number | string | null): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(planExpiredWarningStorageKey(storeId, subscriptionId)) === '1';
  } catch {
    return false;
  }
}

export function markPlanExpiredWarningShown(storeId: string, subscriptionId?: number | string | null) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(planExpiredWarningStorageKey(storeId, subscriptionId), '1');
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
