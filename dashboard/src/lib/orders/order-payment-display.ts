/**
 * Client-safe payment display helpers (no DB / server-only imports).
 */

/** COD / cash → Cash; everything else → Online. */
export function formatPaymentModeOnlineOrCash(
  method: string | null | undefined
): "Online" | "Cash" | null {
  if (method == null || !String(method).trim()) return null;
  const m = String(method).trim().toLowerCase();
  if (
    m === "cod" ||
    m === "cash" ||
    m === "cash_on_delivery" ||
    m === "cash-on-delivery"
  ) {
    return "Cash";
  }
  return "Online";
}

/** Human label for how the customer paid (instrument), not order_source. */
export function formatPaymentInstrumentSource(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const raw of candidates) {
    if (raw == null) continue;
    const m = String(raw).trim().toLowerCase();
    if (!m) continue;
    if (m === "internal" || m === "swiggy" || m === "zomato") continue;
    if (m === "upi" || m === "upi_intent" || m === "upi_collect") return "UPI";
    if (m === "qr" || m === "upi_qr" || m === "bharat_qr") return "QR";
    if (m === "card" || m === "credit_card" || m === "debit_card") return "Card";
    if (m === "netbanking" || m === "net_banking" || m === "nb") return "Netbanking";
    if (m === "wallet" || m === "paytm" || m === "phonepe" || m === "amazonpay") return "Wallet";
    if (m === "pay_later" || m === "paylater" || m === "emi" || m === "cardless_emi") {
      return "Pay later";
    }
    if (m === "cod" || m === "cash" || m === "cash_on_delivery") return "Cash";
    if (m === "online" || m === "razorpay" || m === "other") continue;
    return m
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return null;
}
