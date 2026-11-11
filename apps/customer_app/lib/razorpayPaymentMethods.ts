/**
 * Checkout "Pay using" sheet — methods fetched from GET /v1/payment/methods
 * (Razorpay GET /v1/methods, mapped server-side).
 */

export type CheckoutPayGatewayMethod = "upi" | "card" | "wallet" | "netbanking";

export type CheckoutPayMethodItem = {
  id: string;
  label: string;
  method: CheckoutPayGatewayMethod;
  action: "pay" | "add";
  logoKey: string;
  upiApp?: string;
  wallet?: string;
  /** Present when Razorpay enabled Intent / QR / Collect on this account. */
  upiFlow?: "intent" | "qr" | "collect";
};

export type CheckoutPayMethodSection = {
  id: string;
  title: string;
  items: CheckoutPayMethodItem[];
};

export type CheckoutPayMethodsResponse = {
  dummy: boolean;
  sections: CheckoutPayMethodSection[];
};

/**
 * Default footer selection — opens Razorpay Standard Checkout with UPI + cards
 * (+ wallets/netbanking when enabled). Not locked to a single UPI app.
 */
export const DEFAULT_PAY_INSTRUMENT: CheckoutPayMethodItem = {
  id: "open:all",
  label: "UPI, Cards & more",
  method: "upi",
  action: "pay",
  logoKey: "upi",
};

/** True when Place Order should open the full Razorpay sheet (no method lock). */
export function isOpenCheckoutPayInstrument(
  item: CheckoutPayMethodItem | null | undefined
): boolean {
  return item?.id === "open:all";
}

/**
 * First payable instrument for checkout footer — never leave selection null so
 * Place Order does not force-open Payment Options when a default already applies.
 * Prefer the open "UPI, Cards & more" default unless the user already picked one.
 */
export function pickDefaultCheckoutPayInstrument(
  _sections: CheckoutPayMethodSection[]
): CheckoutPayMethodItem {
  return DEFAULT_PAY_INSTRUMENT;
}

/** Client fallback when /v1/payment/methods is unreachable. */
export const FALLBACK_PAY_METHODS: CheckoutPayMethodsResponse = {
  dummy: true,
  sections: [
    {
      id: "recommended",
      title: "RECOMMENDED",
      items: [
        { id: "upi:google_pay", label: "Google Pay UPI", method: "upi", action: "pay", logoKey: "google_pay", upiApp: "google_pay" },
        { id: "upi:phonepe", label: "PhonePe UPI", method: "upi", action: "pay", logoKey: "phonepe", upiApp: "phonepe" },
        { id: "upi:paytm", label: "Paytm UPI", method: "upi", action: "pay", logoKey: "paytm", upiApp: "paytm" },
      ],
    },
    {
      id: "cards",
      title: "CARDS",
      items: [
        { id: "card:add", label: "Add credit or debit cards", method: "card", action: "add", logoKey: "card" },
      ],
    },
    {
      id: "upi_qr_id",
      title: "SCAN QR & UPI ID",
      items: [
        {
          id: "upi:intent",
          label: "Pay Without UPI ID",
          method: "upi",
          action: "pay",
          logoKey: "upi",
          upiFlow: "intent",
        },
        { id: "upi:qr", label: "Scan QR Code", method: "upi", action: "pay", logoKey: "qr", upiFlow: "qr" },
        { id: "upi:collect", label: "Pay via UPI ID", method: "upi", action: "pay", logoKey: "upi_id", upiFlow: "collect" },
      ],
    },
    {
      id: "upi",
      title: "PAY BY ANY UPI APP",
      items: [
        { id: "upi:bhim", label: "BHIM UPI", method: "upi", action: "pay", logoKey: "bhim", upiApp: "bhim" },
        { id: "upi:amazon_pay", label: "Amazon Pay UPI", method: "upi", action: "pay", logoKey: "amazonpay", upiApp: "amazon_pay" },
      ],
    },
    {
      id: "wallets",
      title: "WALLETS",
      items: [
        { id: "wallet:amazonpay", label: "Amazon Pay Balance", method: "wallet", action: "add", logoKey: "amazonpay", wallet: "amazonpay" },
        { id: "wallet:mobikwik", label: "Mobikwik", method: "wallet", action: "add", logoKey: "mobikwik", wallet: "mobikwik" },
      ],
    },
  ],
};

export function orderPayloadPaymentMethod(item: CheckoutPayMethodItem): string {
  if (item.method === "netbanking") return "online";
  return item.method;
}

/** Canonical GatiMitra method → Razorpay Standard Checkout `method` string. */
export const RAZORPAY_METHOD_MAP: Record<CheckoutPayGatewayMethod, CheckoutPayGatewayMethod> = {
  upi: "upi",
  card: "card",
  netbanking: "netbanking",
  wallet: "wallet",
};

/** Snapshot for Razorpay open — includes specific UPI app / wallet when checkout selected one. */
export function toRazorpayCheckoutMethod(item: CheckoutPayMethodItem): {
  method: CheckoutPayGatewayMethod;
  upiApp?: string;
  wallet?: string;
  upiFlow?: "intent" | "qr" | "collect";
} | null {
  // Default "UPI, Cards & more" → no lock; Razorpay shows all enabled methods.
  if (isOpenCheckoutPayInstrument(item)) return null;
  const method = RAZORPAY_METHOD_MAP[item.method] ?? "upi";
  if (method === "wallet" && item.wallet) {
    return { method, wallet: item.wallet };
  }
  if (method === "upi" && item.upiApp) {
    return { method, upiApp: item.upiApp, upiFlow: item.upiFlow ?? "intent" };
  }
  if (method === "upi" && item.upiFlow) {
    return { method, upiFlow: item.upiFlow };
  }
  // Catalog ids always map even if a stale methods payload omitted upiFlow.
  if (method === "upi" && item.id === "upi:qr") return { method, upiFlow: "qr" };
  if (method === "upi" && item.id === "upi:collect") return { method, upiFlow: "collect" };
  if (method === "upi" && item.id === "upi:intent") return { method, upiFlow: "intent" };
  return { method };
}

export function payInstrumentShortLabel(item: CheckoutPayMethodItem): string {
  if (isOpenCheckoutPayInstrument(item)) return "UPI, Cards & more";
  const raw = item.label.replace(/\s+UPI$/i, "").trim();
  if (item.method === "card") return "Card";
  if (item.method === "netbanking") return "Netbanking";
  if (item.upiFlow === "intent" && !item.upiApp) return "UPI Intent";
  if (item.upiFlow === "qr") return "QR";
  if (item.upiFlow === "collect") return "UPI ID";
  return raw || "UPI";
}

/** Always-on UPI flows Razorpay mobile Standard Checkout often hides. */
export const UPI_QR_AND_ID_ITEMS: CheckoutPayMethodItem[] = [
  {
    id: "upi:intent",
    label: "Pay Without UPI ID",
    method: "upi",
    action: "pay",
    logoKey: "upi",
    upiFlow: "intent",
  },
  {
    id: "upi:qr",
    label: "Scan QR Code",
    method: "upi",
    action: "pay",
    logoKey: "qr",
    upiFlow: "qr",
  },
  {
    id: "upi:collect",
    label: "Pay via UPI ID",
    method: "upi",
    action: "pay",
    logoKey: "upi_id",
    upiFlow: "collect",
  },
];

/**
 * Guarantee Scan QR / Pay via UPI ID / Pay Without UPI ID appear near the top of
 * the in-app Payment Options sheet (Razorpay's native sheet hides QR on phones).
 * Also pins "UPI, Cards & more" so the user can restore the open checkout default.
 */
export function ensureUpiQrAndCollectVisible(
  catalog: CheckoutPayMethodsResponse
): CheckoutPayMethodsResponse {
  const sections = catalog.sections.map((s) => ({
    ...s,
    items: [...s.items],
  }));
  const hasUpi =
    sections.some((s) => s.items.some((i) => i.method === "upi")) || sections.length === 0;

  const existingIds = new Set(sections.flatMap((s) => s.items.map((i) => i.id)));
  const missing = UPI_QR_AND_ID_ITEMS.filter((i) => !existingIds.has(i.id));

  const openSection: CheckoutPayMethodSection = {
    id: "open_checkout",
    title: "QUICK PAY",
    items: [DEFAULT_PAY_INSTRUMENT],
  };

  const pinSection: CheckoutPayMethodSection = {
    id: "upi_qr_id",
    title: "SCAN QR & UPI ID",
    items: UPI_QR_AND_ID_ITEMS,
  };

  // Drop duplicate rows from other sections so these only appear once, on top.
  const pinIds = new Set([...UPI_QR_AND_ID_ITEMS.map((i) => i.id), DEFAULT_PAY_INSTRUMENT.id]);
  const cleaned = sections
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => !pinIds.has(i.id)),
    }))
    .filter((s) => s.items.length > 0);

  if (!hasUpi && missing.length === UPI_QR_AND_ID_ITEMS.length && cleaned.length === 0) {
    return { ...catalog, sections: [openSection, pinSection] };
  }

  // Open checkout first, then Intent/QR/Collect, then recommended apps / cards.
  const recIdx = cleaned.findIndex((s) => s.id === "recommended");
  if (recIdx >= 0) {
    cleaned.splice(recIdx + 1, 0, pinSection);
  } else {
    cleaned.unshift(pinSection);
  }
  cleaned.unshift(openSection);
  return { ...catalog, sections: cleaned };
}
