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

/** Customer app stores "Cancelled by me"; merchant UI shows who cancelled from the store's view. */
export const CUSTOMER_CANCELLED_BY_CUSTOMER_LABEL = "Cancelled by customer";
export const STORE_CANCELLED_BY_STORE_LABEL = "Cancelled by store";
export const GATIMITRA_CANCELLED_LABEL = "Cancelled by GatiMitra";
export const AUTO_CANCELED_LABEL = "Auto Canceled";

export function merchantFacingCancelledByLabel(
  label: string | null | undefined,
  cancelledByType?: string | null,
): string {
  const trimmed = (label ?? "").trim();
  const type = (cancelledByType ?? "").trim().toLowerCase();

  if (/^auto cancel/i.test(trimmed)) {
    return AUTO_CANCELED_LABEL;
  }
  if (/^cancelled by me$/i.test(trimmed)) {
    return CUSTOMER_CANCELLED_BY_CUSTOMER_LABEL;
  }
  if (/^cancelled by customer$/i.test(trimmed)) {
    return CUSTOMER_CANCELLED_BY_CUSTOMER_LABEL;
  }
  if (type === "customer" && (!trimmed || /^cancelled by (me|customer)$/i.test(trimmed))) {
    return CUSTOMER_CANCELLED_BY_CUSTOMER_LABEL;
  }
  if (
    type === "store" ||
    type === "merchant" ||
    /cancelled by store/i.test(trimmed) ||
    /cancelled - merchant/i.test(trimmed) ||
    /store itself/i.test(trimmed)
  ) {
    return STORE_CANCELLED_BY_STORE_LABEL;
  }
  if (
    type === "admin" ||
    isGatiMitraTeamCancellationLabel(trimmed) ||
    /cancelled by gatimitra/i.test(trimmed)
  ) {
    return GATIMITRA_CANCELLED_LABEL;
  }
  if (type === "system") {
    return AUTO_CANCELED_LABEL;
  }
  return trimmed;
}

export function merchantCancellationDisplay(args: {
  rejected_reason?: string | null;
  cancelled_by_label?: string | null;
  cancelled_by_type?: string | null;
}): {
  headline: string | null;
  detail: string | null;
} {
  const reason = (args.rejected_reason ?? "").trim();
  const label = merchantFacingCancelledByLabel(args.cancelled_by_label, args.cancelled_by_type);
  if (!reason && !label) return { headline: null, detail: null };
  if (cancellationReasonsAreDuplicate(reason, label)) {
    return { headline: reason || label, detail: null };
  }
  if (reason && label) {
    return { headline: label, detail: reason };
  }
  return { headline: reason || label, detail: null };
}
