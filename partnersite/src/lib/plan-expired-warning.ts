/** UI-only reminder cooldown for the plan-expired modal. Does not change plan status. */
export const PLAN_EXPIRED_WARNING_DISMISSED = 'mx-plan-expired-warning-dismissed';

const COOLDOWN_MS = 48 * 60 * 60 * 1000;
const STORAGE_PREFIX = 'mx_plan_expired_warn_v3:';

type DismissStamp = { dismissedAt: number };

const memoryDismissedAt = new Map<string, number>();

function storageKey(storeId: string) {
  return `${STORAGE_PREFIX}${storeId.trim()}`;
}

function readStoredDismissedAt(storeId: string): number | null {
  if (typeof window === 'undefined') return null;
  const id = storeId.trim();
  if (!id) return null;
  const mem = memoryDismissedAt.get(id);
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (raw) {
      const parsed = JSON.parse(raw) as DismissStamp;
      if (parsed && Number.isFinite(parsed.dismissedAt)) {
        if (mem == null || parsed.dismissedAt > mem) return parsed.dismissedAt;
      }
    }
  } catch {
    /* ignore */
  }
  if (mem != null) return mem;
  try {
    // Older builds stored a session flag with no timestamp. Treat it as dismissed now
    // and copy it into localStorage so a refresh in this tab does not reopen immediately.
    const legacySession =
      sessionStorage.getItem(`mx_plan_expired_warn_v2:${id}`) === '1' ||
      sessionStorage.getItem(`mx_plan_expired_warn:${id}:latest`) === '1';
    if (legacySession) {
      const now = Date.now();
      memoryDismissedAt.set(id, now);
      localStorage.setItem(storageKey(id), JSON.stringify({ dismissedAt: now } satisfies DismissStamp));
      return now;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function planExpiredWarningStorageKey(storeId: string, _subscriptionId?: number | string | null) {
  return storageKey(storeId);
}

export function wasPlanExpiredWarningShown(storeId: string, _subscriptionId?: number | string | null): boolean {
  const dismissedAt = readStoredDismissedAt(storeId);
  if (dismissedAt == null) return false;
  return Date.now() - dismissedAt < COOLDOWN_MS;
}

export function markPlanExpiredWarningShown(storeId: string, _subscriptionId?: number | string | null) {
  if (typeof window === 'undefined') return;
  const id = storeId.trim();
  if (!id) return;
  const dismissedAt = Date.now();
  memoryDismissedAt.set(id, dismissedAt);
  try {
    localStorage.setItem(storageKey(id), JSON.stringify({ dismissedAt } satisfies DismissStamp));
  } catch {
    /* ignore quota */
  }
  window.dispatchEvent(
    new CustomEvent(PLAN_EXPIRED_WARNING_DISMISSED, { detail: { storeId: id, dismissedAt } })
  );
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
