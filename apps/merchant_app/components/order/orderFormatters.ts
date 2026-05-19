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

export function splitRejectionMessage(
  reason: string | null | undefined,
  status: "rejected" | "rto",
  cancelledByLabel?: string | null
): { prefix: string; detail: string } {
  const label = (cancelledByLabel ?? "").trim();
  const r = (reason ?? "").trim();
  if (status === "rto") {
    return r
      ? { prefix: label || "RTO:", detail: r }
      : { prefix: label || "Return to origin", detail: "" };
  }
  if (label) {
    return { prefix: label, detail: r || "" };
  }
  if (/^auto cancelled/i.test(r)) {
    return { prefix: "Auto Cancelled", detail: r.replace(/^auto cancelled:\s*/i, "").trim() };
  }
  if (r) {
    return { prefix: "Rejected by Restaurant:", detail: r };
  }
  return { prefix: "Rejected by Restaurant:", detail: "Order cancelled" };
}

/** Same resolution as Partner Site `FormattedOrderId` (core formatted id, else #core pk). */
/** Partner Site: 1 → "1st order", 2 → "2nd order", etc. */
export function formatCustomerOrderOrdinal(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n < 1) return null;
  const v = Math.floor(n);
  if (v === 1) return "1st order";
  if (v === 2) return "2nd order";
  if (v === 3) return "3rd order";
  return `${v}th order`;
}

export function formatCustomerOrderOrdinalShort(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n < 1) return null;
  const v = Math.floor(n);
  if (v === 1) return "1st";
  if (v === 2) return "2nd";
  if (v === 3) return "3rd";
  return `${v}th`;
}

/** e.g. "2nd order from your store" */
export function formatCustomerStoreOrderLabel(n: number | null | undefined): string | null {
  const ord = formatCustomerOrderOrdinal(n);
  if (!ord) return null;
  return `${ord} from your store`;
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
