import { toast } from 'sonner';

/**
 * Returned by POST /api/store-operations when the merchant tries to manually open a store on a
 * weekday that is marked as a scheduled OFF day (closed_days / `<day>_open` = false). This is the
 * only schedule state that hard-blocks manual open — the schedule sync engine always force-closes
 * a scheduled-off day (manual override cannot keep it online), so the API rejects up front.
 *
 * For every other "outside hours" state (BREAK, before slot 1, after slot 2, mid-day gap) manual
 * open succeeds with `is_manual_override = true` and the store stays online.
 */
export const STORE_OPERATIONS_SCHEDULED_OFF_DAY_CODE = 'SCHEDULED_OFF_DAY' as const;

/** Legacy code retained so old clients still get a friendly toast (the route no longer emits it). */
export const STORE_OPERATIONS_OUTSIDE_OPERATING_HOURS_CODE = 'OUTSIDE_OPERATING_HOURS' as const;

export const STORE_OPERATIONS_SCHEDULED_OFF_DAY_TOAST =
  "Can't turn the store on: today is marked as a scheduled off day in Outlet Timings. Update Outlet Timings to mark today as open.";

export type StoreOperationsErrorJson = {
  error?: string;
  code?: string;
  success?: boolean;
};

export function isScheduledOffDayStoreOpsError(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  return (body as StoreOperationsErrorJson).code === STORE_OPERATIONS_SCHEDULED_OFF_DAY_CODE;
}

/** @deprecated Manual open no longer rejects on "outside operating hours" — retained for older payloads. */
export function isOutsideOperatingHoursStoreOpsError(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  return (body as StoreOperationsErrorJson).code === STORE_OPERATIONS_OUTSIDE_OPERATING_HOURS_CODE;
}

/**
 * Toast after a failed POST /api/store-operations (e.g. manual_open).
 * Surfaces scheduled-off-day rejection clearly when the server sends HTTP 400 + SCHEDULED_OFF_DAY.
 */
export function toastStoreOperationsPostFailure(
  res: Response,
  body: unknown,
  fallbackMessage: string
): void {
  const b = (body && typeof body === 'object' ? body : {}) as StoreOperationsErrorJson;
  if (res.status === 400 && isScheduledOffDayStoreOpsError(body)) {
    const msg =
      typeof b.error === 'string' && b.error.trim() !== ''
        ? b.error.trim()
        : STORE_OPERATIONS_SCHEDULED_OFF_DAY_TOAST;
    toast.error(msg);
    return;
  }
  if (res.status === 400 && isOutsideOperatingHoursStoreOpsError(body)) {
    // Legacy: older deployments still emit this code. Surface the server message verbatim.
    const msg =
      typeof b.error === 'string' && b.error.trim() !== ''
        ? b.error.trim()
        : fallbackMessage;
    toast.error(msg);
    return;
  }
  const msg =
    typeof b.error === 'string' && b.error.trim() !== '' ? b.error.trim() : fallbackMessage;
  toast.error(msg);
}
