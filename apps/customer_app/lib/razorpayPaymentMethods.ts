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

export const DEFAULT_PAY_INSTRUMENT: CheckoutPayMethodItem = {
  id: "upi:phonepe",
  label: "PhonePe UPI",
  method: "upi",
  action: "pay",
  logoKey: "phonepe",
  upiApp: "phonepe",
};

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

export function payInstrumentShortLabel(item: CheckoutPayMethodItem): string {
  const raw = item.label.replace(/\s+UPI$/i, "").trim();
  if (item.method === "card") return "Card";
  if (item.method === "netbanking") return "Netbanking";
  return raw || "UPI";
}
