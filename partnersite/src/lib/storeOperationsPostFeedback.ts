import { toast } from 'sonner';

/** Returned by POST /api/store-operations when manual open is outside configured slots or closed schedule. */
export const STORE_OPERATIONS_OUTSIDE_OPERATING_HOURS_CODE = 'OUTSIDE_OPERATING_HOURS' as const;

/** Partner-facing copy when the API does not return a custom `error` string. */
export const STORE_OPERATIONS_OUTSIDE_HOURS_TOAST =
  "Can't turn the store on: you're outside today's operating hours, or today is scheduled closed. Open Outlet Timings to review the schedule, or wait until an active morning or evening slot.";

export type StoreOperationsErrorJson = {
  error?: string;
  code?: string;
  success?: boolean;
};

export function isOutsideOperatingHoursStoreOpsError(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  return (body as StoreOperationsErrorJson).code === STORE_OPERATIONS_OUTSIDE_OPERATING_HOURS_CODE;
}

/**
 * Toast after a failed POST /api/store-operations (e.g. manual_open).
 * Surfaces schedule rejection clearly when the server sends HTTP 400 + OUTSIDE_OPERATING_HOURS.
 */
export function toastStoreOperationsPostFailure(
  res: Response,
  body: unknown,
  fallbackMessage: string
): void {
  const b = (body && typeof body === 'object' ? body : {}) as StoreOperationsErrorJson;
  if (res.status === 400 && isOutsideOperatingHoursStoreOpsError(body)) {
    const msg =
      typeof b.error === 'string' && b.error.trim() !== '' ? b.error.trim() : STORE_OPERATIONS_OUTSIDE_HOURS_TOAST;
    toast.error(msg);
    return;
  }
  const msg =
    typeof b.error === 'string' && b.error.trim() !== '' ? b.error.trim() : fallbackMessage;
  toast.error(msg);
}
