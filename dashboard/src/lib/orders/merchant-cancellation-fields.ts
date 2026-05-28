/**
 * Single source of truth for merchant-facing cancellation display.
 * Written on dashboard cancel; resolved on read for Partner Site + Merchant App APIs.
 */

import {
  GATIMITRA_TEAM_REJECTION_LABEL,
  dashboardAdminCancellationLabels,
  isCatalogCancellationReason,
  isGatiMitraTeamCancellationLabel,
} from "@/lib/merchant-cancellation-display";

export type MerchantCancellationDisplayFields = {
  rejected_reason: string | null;
  cancelled_by_label: string | null;
  cancelled_by_type: string | null;
};

const GENERIC_CANCEL_REASONS = new Set([
  "order cancelled",
  "order cancel",
  "cancelled",
  "canceled",
]);

export function buildCatalogRejectionDisplay(
  attribute: string,
  label: string
): string {
  const attr = attribute.trim().toUpperCase();
  const lbl = label.trim();
  if (!lbl) return attr;
  if (lbl.toUpperCase().startsWith(`${attr} -`)) return lbl;
  return `${attr} - ${lbl}`;
}

export function buildMerchantCancellationDetailsPayload(args: {
  source: string;
  cancelledByLabel: string;
  rejectedReason: string;
  attribute?: string;
  rejection?: string;
  reasonCode?: string;
  catalogReasonId?: number;
}): Record<string, unknown> {
  return {
    version: 1,
    source: args.source,
    cancelled_by_label: args.cancelledByLabel,
    rejected_reason: args.rejectedReason,
    attribute: args.attribute ?? null,
    rejection: args.rejection ?? null,
    reason_code: args.reasonCode ?? null,
    catalog_reason_id: args.catalogReasonId ?? null,
  };
}

function parseCancellationDetails(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function pickStr(...values: unknown[]): string | null {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

function isGenericCancelReason(reason: string | null | undefined): boolean {
  const r = (reason ?? "").trim().toLowerCase();
  return !r || GENERIC_CANCEL_REASONS.has(r);
}

function labelForSource(source: string | null | undefined): string | null {
  const s = (source ?? "").trim().toLowerCase();
  if (s === "admin") return GATIMITRA_TEAM_REJECTION_LABEL;
  if (s === "store") return "Rejected by Restaurant";
  if (s === "customer") return "Cancelled by customer";
  if (s === "system") return "Auto Cancelled";
  return null;
}

export type ResolveMerchantCancellationInput = {
  rejected_reason?: string | null;
  cancelled_by_label?: string | null;
  cancelled_by_type?: string | null;
  cancellation_details?: unknown;
  /** From order_cancellation_reasons join */
  catalog_attribute?: string | null;
  catalog_rejection?: string | null;
  reason_text?: string | null;
  refund_reason?: string | null;
  /** Structured columns on order_cancellation_reasons (0237+) */
  ocr_display_reason?: string | null;
  ocr_cancelled_by_label?: string | null;
  ocr_cancelled_by_type?: string | null;
};

/** Merge DB columns + JSON + catalog row into what merchant UIs should show. */
export function resolveMerchantCancellationFields(
  input: ResolveMerchantCancellationInput
): MerchantCancellationDisplayFields {
  const details = parseCancellationDetails(input.cancellation_details);
  const meta =
    details?.metadata && typeof details.metadata === "object" && !Array.isArray(details.metadata)
      ? (details.metadata as Record<string, unknown>)
      : details;

  const source = pickStr(
    input.ocr_cancelled_by_type,
    input.cancelled_by_type,
    details?.source,
    meta?.source
  )?.toLowerCase() ?? null;

  const attribute = pickStr(
    input.catalog_attribute,
    meta?.attribute,
    details?.attribute
  );
  const rejection = pickStr(
    input.catalog_rejection,
    meta?.rejection,
    details?.rejection
  );

  const catalogDisplay =
    attribute && rejection
      ? buildCatalogRejectionDisplay(attribute, rejection)
      : null;

  let rejected_reason = pickStr(
    input.ocr_display_reason,
    input.rejected_reason,
    details?.rejected_reason,
    meta?.rejected_reason,
    input.refund_reason,
    catalogDisplay,
    input.reason_text
  );

  let cancelled_by_label = pickStr(
    input.ocr_cancelled_by_label,
    input.cancelled_by_label,
    details?.cancelled_by_label,
    meta?.cancelled_by_label
  );

  if (source === "admin") {
    if (!cancelled_by_label) cancelled_by_label = GATIMITRA_TEAM_REJECTION_LABEL;
    if (isGenericCancelReason(rejected_reason) || !rejected_reason) {
      rejected_reason =
        catalogDisplay ??
        pickStr(input.refund_reason, input.reason_text) ??
        rejected_reason;
    }
    if (
      rejected_reason &&
      !isCatalogCancellationReason(rejected_reason) &&
      catalogDisplay
    ) {
      rejected_reason = catalogDisplay;
    }
  } else if (!cancelled_by_label && source) {
    cancelled_by_label = labelForSource(source);
  }

  if (
    !cancelled_by_label &&
    (isCatalogCancellationReason(rejected_reason) ||
      (source === "admin" && rejected_reason && !isGenericCancelReason(rejected_reason)))
  ) {
    cancelled_by_label = GATIMITRA_TEAM_REJECTION_LABEL;
  }

  return {
    rejected_reason: rejected_reason ?? null,
    cancelled_by_label: cancelled_by_label ?? null,
    cancelled_by_type: source,
  };
}

export function dashboardCancellationFromCatalog(args: {
  attribute: string;
  label: string;
  reasonCode: string;
  catalogReasonId: number;
  refundReasonFallback?: string | null;
}): {
  displayReason: string;
  cancelledByLabel: string;
  cancellationDetails: Record<string, unknown>;
} {
  const displayReason =
    (args.refundReasonFallback ?? "").trim() ||
    buildCatalogRejectionDisplay(args.attribute, args.label);
  const { cancelledByLabel, rejectedReason } =
    dashboardAdminCancellationLabels(displayReason);

  return {
    displayReason: rejectedReason ?? displayReason,
    cancelledByLabel,
    cancellationDetails: buildMerchantCancellationDetailsPayload({
      source: "admin",
      cancelledByLabel,
      rejectedReason: rejectedReason ?? displayReason,
      attribute: args.attribute,
      rejection: args.label,
      reasonCode: args.reasonCode,
      catalogReasonId: args.catalogReasonId,
    }),
  };
}
