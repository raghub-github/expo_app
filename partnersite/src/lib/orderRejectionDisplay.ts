import {
  cancellationReasonsAreDuplicate,
  GATIMITRA_TEAM_REJECTION_LABEL,
  isCatalogCancellationReason,
  isGatiMitraTeamCancellationLabel,
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
  const label = (cancelledByLabel ?? '').trim();
  const r = (reason ?? '').trim();
  const source = (cancelledByType ?? '').trim().toLowerCase();

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
    return { prefix: 'Auto Cancelled', detail: r.replace(/^auto cancelled:\s*/i, '').trim() };
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
