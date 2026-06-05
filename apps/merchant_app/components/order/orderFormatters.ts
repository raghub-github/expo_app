import {
  cancellationReasonsAreDuplicate,
  GATIMITRA_TEAM_REJECTION_LABEL,
  isCatalogCancellationReason,
  isGatiMitraTeamCancellationLabel,
} from "@/lib/merchant-cancellation-display";

/** Shared order display formatting (IST). */

const IST = "Asia/Kolkata";

/** Reference layout: `12 May, 11:33 am` */
export function formatOrderDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const day = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      timeZone: IST,
    }).format(d);
    const month = new Intl.DateTimeFormat("en-IN", {
      month: "short",
      timeZone: IST,
    }).format(d);
    const time = new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: IST,
    }).format(d);
    return `${day} ${month}, ${time}`;
  } catch {
    return "";
  }
}

const GENERIC_CANCEL_REASONS = new Set([
  "order cancelled",
  "order cancel",
  "cancelled",
  "canceled",
]);

export function splitRejectionMessage(
  reason: string | null | undefined,
  status: "rejected" | "rto",
  cancelledByLabel?: string | null,
  cancelledByType?: string | null
): { prefix: string; detail: string } {
  const label = (cancelledByLabel ?? "").trim();
  const r = (reason ?? "").trim();
  const source = (cancelledByType ?? "").trim().toLowerCase();
  if (status === "rto") {
    return r
      ? { prefix: label || "RTO:", detail: r }
      : { prefix: label || "Return to origin", detail: "" };
  }
  if (label) {
    if (isGatiMitraTeamCancellationLabel(label)) {
      if (!r || cancellationReasonsAreDuplicate(r, label)) {
        return { prefix: GATIMITRA_TEAM_REJECTION_LABEL, detail: "" };
      }
      return { prefix: GATIMITRA_TEAM_REJECTION_LABEL, detail: r };
    }
    if (!r || cancellationReasonsAreDuplicate(r, label)) {
      return { prefix: label, detail: "" };
    }
    return { prefix: label, detail: r };
  }
  if (/^auto cancelled/i.test(r)) {
    return { prefix: "Auto Cancelled", detail: r.replace(/^auto cancelled:\s*/i, "").trim() };
  }
  if (source === "admin" || isCatalogCancellationReason(r)) {
    if (!r || GENERIC_CANCEL_REASONS.has(r.toLowerCase())) {
      return { prefix: GATIMITRA_TEAM_REJECTION_LABEL, detail: "" };
    }
    return { prefix: GATIMITRA_TEAM_REJECTION_LABEL, detail: r };
  }
  if (r) {
    return { prefix: "Rejected by Restaurant:", detail: r };
  }
  return { prefix: "Rejected by Restaurant:", detail: "Order cancelled" };
}

/** Same resolution as Partner Site `FormattedOrderId` (core formatted id, else #core pk). */

function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/** Partner Site: 1 → "1st order", 2 → "2nd order", etc. */
export function formatCustomerOrderOrdinal(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n < 1) return null;
  const v = Math.floor(n);
  return `${v}${ordinalSuffix(v)} order`;
}

export function formatCustomerOrderOrdinalShort(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n < 1) return null;
  const v = Math.floor(n);
  return `${v}${ordinalSuffix(v)}`;
}

/** e.g. "2nd order from your store" */
export function formatCustomerStoreOrderLabel(n: number | null | undefined): string | null {
  const ord = formatCustomerOrderOrdinal(n);
  if (!ord) return null;
  return `${ord} from your store`;
}

/** e.g. "Monisha 3rd order" — uses per-order ordinal only (never total order count). */
export function formatCustomerPossessiveOrderLabel(
  customerName: string,
  ordinal?: number | null
): string {
  const name = (customerName || "Customer").trim();
  const short = formatCustomerOrderOrdinalShort(ordinal);
  if (short) return `${name} ${short} order`;
  return name;
}

/** Per-order store ordinal only — never use lifetime total (same for all past orders). */
export function resolveCustomerOrderOrdinalForDisplay(
  ordinal?: number | null
): number | null {
  if (ordinal != null && Number.isFinite(ordinal) && ordinal > 0) {
    return Math.floor(ordinal);
  }
  return null;
}

/** Order cards + detail: "23rd order by Bhim pratap" — ordinal from API per order. */
export function formatOrderCardCustomerLabel(
  customerName: string | null | undefined,
  ordinal?: number | null
): string {
  const name = (customerName ?? "").trim() || "Customer";
  const resolved = resolveCustomerOrderOrdinalForDisplay(ordinal);
  const ord = formatCustomerOrderOrdinal(resolved);
  if (ord) return `${ord} by ${name}`;
  return name;
}

/** Incoming modal: ordinal from API; optional total only when ordinal not yet computed. */
export function formatPartnerIncomingCustomerLabel(
  customerName: string | null | undefined,
  ordinal?: number | null,
  storeOrdersTotal?: number | null
): string {
  const name = (customerName ?? "").trim();
  if (!name) return "New customer order";
  let resolved = resolveCustomerOrderOrdinalForDisplay(ordinal);
  if (resolved == null && storeOrdersTotal != null && storeOrdersTotal > 0) {
    resolved = Math.floor(storeOrdersTotal);
  }
  const ord = formatCustomerOrderOrdinal(resolved);
  if (ord) return `${ord} by ${name}`;
  return `Order by ${name}`;
}

/** Time only — matches Partner Site incoming modal header */
export function formatOrderTimeOnly(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: IST,
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** Partner Site OrderPanel: "2 min ago" */
export function formatPlacedAgo(iso: string, nowMs: number = Date.now()): string {
  try {
    const ms = Math.max(0, nowMs - new Date(iso).getTime());
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr ago`;
    const days = Math.floor(hrs / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  } catch {
    return "";
  }
}

/** Beside name on cards / detail hero: "2nd order with you" */
export function formatCustomerOrderOrdinalWithYou(n: number | null | undefined): string | null {
  const ord = formatCustomerOrderOrdinal(n);
  if (!ord) return null;
  return `${ord} with you`;
}

/** @deprecated Prefer formatCustomerOrderOrdinalWithYou */
export function formatCustomerOrderOrdinalAtStore(n: number | null | undefined): string | null {
  return formatCustomerOrderOrdinalWithYou(n);
}

export function formatOrderIdDisplay(
  formattedOrderId: string | null | undefined,
  fallbackCoreId: number,
  fallbackFoodId?: number
): string {
  const f = (formattedOrderId ?? "").trim();
  if (f.length > 0) return f;
  if (fallbackCoreId > 0) return String(fallbackCoreId);
  if (fallbackFoodId != null && fallbackFoodId > 0) return String(fallbackFoodId);
  return "";
}

export function formatRejectionMessage(
  reason: string | null | undefined,
  status: "rejected" | "rto"
): string {
  const r = (reason ?? "").trim();
  if (r) {
    return status === "rto" ? `RTO: ${r}` : `Rejected by Restaurant: ${r}`;
  }
  return status === "rto"
    ? "Return to origin"
    : "Rejected by Restaurant: Order cancelled";
}
