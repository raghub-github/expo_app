/** Avoid showing the same cancellation text twice (label + rejected_reason). */

function normalizeCancellationText(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function cancellationReasonsAreDuplicate(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = normalizeCancellationText(a);
  const nb = normalizeCancellationText(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function merchantCancellationDisplay(args: {
  rejected_reason?: string | null;
  cancelled_by_label?: string | null;
}): {
  headline: string | null;
  detail: string | null;
} {
  const reason = (args.rejected_reason ?? '').trim();
  const label = (args.cancelled_by_label ?? '').trim();
  if (!reason && !label) return { headline: null, detail: null };
  if (cancellationReasonsAreDuplicate(reason, label)) {
    return { headline: reason || label, detail: null };
  }
  if (reason && label) {
    return { headline: label, detail: reason };
  }
  return { headline: reason || label, detail: null };
}
