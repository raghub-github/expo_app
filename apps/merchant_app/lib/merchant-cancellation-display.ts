/** Shown on timeline and order cards for dashboard/agent cancellations. */
export const GATIMITRA_TEAM_REJECTION_LABEL = "Rejected by GatiMitra Team";

const CATALOG_REASON_RE = /^(CUSTOMER|MERCHANT|RIDER|OTHER)\s-\s/i;

export function isGatiMitraTeamCancellationLabel(label: string | null | undefined): boolean {
  const t = (label ?? "").trim().toLowerCase();
  return (
    t === GATIMITRA_TEAM_REJECTION_LABEL.toLowerCase() ||
    t === "cancelled by gatimitra team" ||
    t === "rejected by gatimitra team"
  );
}

export function isCatalogCancellationReason(reason: string | null | undefined): boolean {
  return CATALOG_REASON_RE.test((reason ?? "").trim());
}

/** Avoid showing the same cancellation text twice (label + rejected_reason). */

function normalizeCancellationText(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
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
  const reason = (args.rejected_reason ?? "").trim();
  const label = (args.cancelled_by_label ?? "").trim();
  if (!reason && !label) return { headline: null, detail: null };
  if (cancellationReasonsAreDuplicate(reason, label)) {
    return { headline: reason || label, detail: null };
  }
  if (reason && label) {
    return { headline: label, detail: reason };
  }
  return { headline: reason || label, detail: null };
}
