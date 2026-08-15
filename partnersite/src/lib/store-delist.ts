/** Operational delist is `delisted_at` (and legacy `approval_status = DELISTED`). */

export const STORE_RELISTED_MANUAL_OPEN_MARQUEE =
  'Store has been relisted. Turn the Store Status toggle ON once to go online. After that, auto on/off will work as usual.';

const UNVERIFIED_APPROVALS = new Set([
  'SUBMITTED',
  'UNDER_VERIFICATION',
  'PENDING',
  'REJECTED',
  'DRAFT',
]);

export function isStoreDelisted(row: {
  approval_status?: unknown;
  delisted_at?: unknown;
  is_delisted?: unknown;
  isDelisted?: unknown;
} | null | undefined): boolean {
  if (!row) return false;
  if (row.is_delisted === true || row.isDelisted === true) return true;
  if (row.delisted_at != null && String(row.delisted_at).trim() !== '') return true;
  return String(row.approval_status ?? '').toUpperCase() === 'DELISTED';
}

/** True only for onboarding states — empty/missing approval after relist must not lock the toggle. */
export function isStoreOpsLockedUntilVerified(
  approvalStatus: unknown,
  isDelisted: boolean
): boolean {
  if (isDelisted) return false;
  const a = String(approvalStatus ?? '').trim().toUpperCase();
  if (!a || a === 'APPROVED' || a === 'DELISTED') return false;
  return UNVERIFIED_APPROVALS.has(a);
}

export function needsManualOpenAfterRelist(opts: {
  isDelisted?: boolean;
  isOpen?: boolean | null;
  lastToggleType?: string | null;
  closeReason?: string | null;
  unavailableReason?: string | null;
}): boolean {
  if (opts.isDelisted) return false;
  if (opts.isOpen === true) return false;
  const toggle = String(opts.lastToggleType ?? '').trim().toUpperCase();
  if (toggle === 'RELIST') return true;
  const reason = String(opts.closeReason ?? '');
  if (/relisted/i.test(reason)) return true;
  // Relist keeps the store CLOSED. Leftover "Store delisted" copy must still show the marquee.
  if (/store\s*delisted/i.test(reason)) return true;
  const unavail = String(opts.unavailableReason ?? '').trim().toLowerCase();
  return unavail === 'manual_indefinite' && /relist|delist/i.test(reason);
}

