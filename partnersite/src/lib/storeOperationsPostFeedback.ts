import { toast } from 'sonner';

/**
 * Returned by POST /api/store-operations when the merchant tries to manually open a store on a
 * weekday that is marked as a scheduled OFF day (closed_days / `<day>_open` = false).
 *
 * `OUTSIDE_OPERATING_HOURS` is returned when current time is outside configured slots (before
 * first open, mid-day break, after last close, etc.). Manual open is blocked; update Outlet Timings.
 */
export const STORE_OPERATIONS_SCHEDULED_OFF_DAY_CODE = 'SCHEDULED_OFF_DAY' as const;
export const STORE_OPERATIONS_LICENSE_EXPIRED_CODE = 'LICENSE_EXPIRED' as const;
export const STORE_OPERATIONS_LICENSE_PENDING_CODE = 'LICENSE_PENDING_VERIFICATION' as const;

export const LICENSE_ONLINE_BLOCKED_TOAST =
  "Can't go online until your new licence is verified by Gatimitra.";

export const STORE_OPERATIONS_OUTSIDE_OPERATING_HOURS_CODE = 'OUTSIDE_OPERATING_HOURS' as const;

export const STORE_OPERATIONS_OUTSIDE_OPERATING_HOURS_TOAST =
  'Your store cannot be turned ON because it is currently outside its scheduled operating hours. Update your Store Schedule first.';

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

export function isOutsideOperatingHoursStoreOpsError(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  return (body as StoreOperationsErrorJson).code === STORE_OPERATIONS_OUTSIDE_OPERATING_HOURS_CODE;
}

/**
 * Toast after a failed POST /api/store-operations (e.g. manual_open).
 * Surfaces scheduled-off-day rejection clearly when the server sends HTTP 400 + SCHEDULED_OFF_DAY.
 */
export function isLicenseBlockedStoreOpsError(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const code = (body as StoreOperationsErrorJson).code;
  return (
    code === STORE_OPERATIONS_LICENSE_EXPIRED_CODE ||
    code === STORE_OPERATIONS_LICENSE_PENDING_CODE
  );
}

export function toastStoreOperationsPostFailure(
  res: Response,
  body: unknown,
  fallbackMessage: string
): void {
  const b = (body && typeof body === 'object' ? body : {}) as StoreOperationsErrorJson;
  if ((res.status === 403 || res.status === 400) && isLicenseBlockedStoreOpsError(body)) {
    toast.error(LICENSE_ONLINE_BLOCKED_TOAST);
    return;
  }
  if (res.status === 400 && isScheduledOffDayStoreOpsError(body)) {
    const msg =
      typeof b.error === 'string' && b.error.trim() !== ''
        ? b.error.trim()
        : STORE_OPERATIONS_SCHEDULED_OFF_DAY_TOAST;
    toast.error(msg);
    return;
  }
  if ((res.status === 400 || res.status === 409) && isOutsideOperatingHoursStoreOpsError(body)) {
    const msg =
      typeof b.error === 'string' && b.error.trim() !== ''
        ? b.error.trim()
        : STORE_OPERATIONS_OUTSIDE_OPERATING_HOURS_TOAST;
    toast.error(msg);
    return;
  }
  const msg =
    typeof b.error === 'string' && b.error.trim() !== '' ? b.error.trim() : fallbackMessage;
  toast.error(msg);
}
