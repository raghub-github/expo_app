import {
  AUTO_CANCELLED_LABEL,
  cancellationReasonsAreDuplicate,
  GATIMITRA_TEAM_REJECTION_LABEL,
  humanizeMerchantCancellationReason,
  isCatalogCancellationReason,
  isGatiMitraTeamCancellationLabel,
  isMerchantAcceptTimeoutReason,
  merchantFacingCancelledByLabel,
} from '@/lib/merchant-cancellation-display';

const GENERIC_CANCEL_REASONS = new Set([
  'order cancelled',
  'order cancel',
  'cancelled',
  'canceled',
]);

export function splitRejectionMessage(
  reason: string | null | undefined,
  cancelledByLabel?: string | null,
  cancelledByType?: string | null
): { prefix: string; detail: string } {
  const label = merchantFacingCancelledByLabel(cancelledByLabel, cancelledByType);
  const raw = (reason ?? '').trim();
  const r = humanizeMerchantCancellationReason(raw);
  const source = (cancelledByType ?? '').trim().toLowerCase();

  // Accept-window timeout: show only "Auto Cancelled" (never the machine code).
  if (isMerchantAcceptTimeoutReason(raw) || (source === 'system' && /^auto\s*cancell?ed$/i.test(r))) {
    return { prefix: AUTO_CANCELLED_LABEL, detail: '' };
  }

  if (label) {
    if (isGatiMitraTeamCancellationLabel(label)) {
      if (!r || cancellationReasonsAreDuplicate(r, label)) {
        return { prefix: GATIMITRA_TEAM_REJECTION_LABEL, detail: '' };
      }
      return { prefix: GATIMITRA_TEAM_REJECTION_LABEL, detail: r };
    }
    if (!r || cancellationReasonsAreDuplicate(r, label)) {
      return { prefix: label, detail: '' };
    }
    return { prefix: label, detail: r };
  }

  if (/^auto cancelled/i.test(r)) {
    return { prefix: AUTO_CANCELLED_LABEL, detail: '' };
  }
  if (source === 'admin' || isCatalogCancellationReason(r)) {
    if (!r || GENERIC_CANCEL_REASONS.has(r.toLowerCase())) {
      return { prefix: GATIMITRA_TEAM_REJECTION_LABEL, detail: '' };
    }
    return { prefix: GATIMITRA_TEAM_REJECTION_LABEL, detail: r };
  }
  if (r) {
    return { prefix: 'Rejected by Restaurant:', detail: r };
  }
  return { prefix: 'Rejected by Restaurant:', detail: 'Order cancelled' };
}
