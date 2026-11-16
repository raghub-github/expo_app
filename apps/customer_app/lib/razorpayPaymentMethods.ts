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

/**
 * Granular mode stored on pending_orders / transactions MODE column.
 * Coarse gateway enum is derived later via paymentMethodToEnum on the server.
 */
export function orderPayloadPaymentMethod(item: CheckoutPayMethodItem): string {
  if (item.id === "upi:qr" || item.upiFlow === "qr") return "upi_qr";
  if (item.upiFlow === "collect" || item.id === "upi:collect") return "upi_collect";
  if (item.method === "upi" && item.upiApp) return `upi_${item.upiApp}`;
  if (item.method === "upi") return "upi";
  if (item.method === "card") return "card";
  if (item.method === "netbanking") return "netbanking";
  if (item.method === "wallet" && item.wallet) return `wallet_${item.wallet}`;
  if (item.method === "wallet") return "wallet";
  return item.method;
}

/**
 * Place Order gate — accepts coarse (`upi`) and granular (`upi_phonepe`, `upi_qr`)
 * modes written by `orderPayloadPaymentMethod`. COD is never payable here.
 */
export function isPayableCheckoutPaymentMethod(method: string | null | undefined): boolean {
  const m = String(method ?? "")
    .trim()
    .toLowerCase();
  if (!m || m === "cod") return false;
  if (["upi", "card", "wallet", "online", "netbanking"].includes(m)) return true;
  if (m.startsWith("upi_") || m.startsWith("wallet_")) return true;
  return false;
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
 * Pin "UPI, Cards & more" + Scan QR / UPI ID when Razorpay (or dummy) already
 * enabled UPI. Never invent UPI rows for a live catalog that has no UPI.
 */
export function ensureUpiQrAndCollectVisible(
  catalog: CheckoutPayMethodsResponse
): CheckoutPayMethodsResponse {
  const sections = catalog.sections.map((s) => ({
    ...s,
    items: [...s.items],
  }));
  if (sections.length === 0) {
    return { ...catalog, sections: [] };
  }

  const hasUpi = sections.some((s) => s.items.some((i) => i.method === "upi"));
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

  // Drop duplicates so open / QR / Collect appear once.
  const pinIds = new Set([...UPI_QR_AND_ID_ITEMS.map((i) => i.id), DEFAULT_PAY_INSTRUMENT.id]);
  const cleaned = sections
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => !pinIds.has(i.id)),
    }))
    .filter((s) => s.items.length > 0 && s.id !== "open_checkout" && s.id !== "upi_qr_id");

  const out: CheckoutPayMethodSection[] = [openSection];
  // Only pin Intent/QR/Collect when UPI is already on (Razorpay) or dummy catalog.
  if (hasUpi || catalog.dummy) {
    out.push(pinSection);
  }
  out.push(...cleaned);
  return { ...catalog, sections: out };
}
