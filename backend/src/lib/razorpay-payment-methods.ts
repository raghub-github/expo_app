/**
 * Maps Razorpay GET /v1/methods into the existing GatiMitra checkout sheet.
 *
 * Razorpay decides what is enabled. This file only:
 *   1. reads that payload (several historical shapes), and
 *   2. assigns display name / icon for the GatiMitra sheet.
 *
 * Dummy mode is the only place a catalog is invented (no Razorpay keys).
 */

export type CheckoutPayMethodItem = {
  id: string;
  label: string;
  method: "upi" | "card" | "wallet" | "netbanking";
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

/** Presentation-only: how we render UPI inside the existing sheet when Razorpay has UPI on. */
const UPI_APPS: Array<{
  id: string;
  label: string;
  razorpayApp: string;
  logoKey: string;
  recommended?: boolean;
}> = [
  { id: "google_pay", label: "Google Pay UPI", razorpayApp: "google_pay", logoKey: "google_pay", recommended: true },
  { id: "phonepe", label: "PhonePe UPI", razorpayApp: "phonepe", logoKey: "phonepe", recommended: true },
  { id: "paytm", label: "Paytm UPI", razorpayApp: "paytm", logoKey: "paytm", recommended: true },
  { id: "bhim", label: "BHIM UPI", razorpayApp: "bhim", logoKey: "bhim", recommended: true },
  { id: "amazon_pay", label: "Amazon Pay UPI", razorpayApp: "amazon_pay", logoKey: "amazonpay" },
  { id: "cred", label: "CRED UPI", razorpayApp: "cred", logoKey: "cred" },
  { id: "whatsapp", label: "WhatsApp UPI", razorpayApp: "whatsapp", logoKey: "whatsapp" },
];

const WALLET_META: Record<string, { label: string; logoKey: string }> = {
  amazonpay: { label: "Amazon Pay Balance", logoKey: "amazonpay" },
  paytm: { label: "Paytm Wallet", logoKey: "paytm" },
  mobikwik: { label: "Mobikwik", logoKey: "mobikwik" },
  phonepe: { label: "PhonePe Wallet", logoKey: "phonepe" },
  freecharge: { label: "Freecharge", logoKey: "freecharge" },
  jiomoney: { label: "JioMoney", logoKey: "jiomoney" },
  airtelmoney: { label: "Airtel Payments Bank", logoKey: "airtel" },
  olamoney: { label: "Ola Money", logoKey: "olamoney" },
  paypal: { label: "PayPal", logoKey: "paypal" },
  payzapp: { label: "PayZapp", logoKey: "payzapp" },
  bajajpay: { label: "Bajaj Pay", logoKey: "bajajpay" },
  amazonpaylater: { label: "Amazon Pay Later", logoKey: "amazonpay" },
};

function isEnabled(value: unknown): boolean {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value == null || value === 0 || value === "0" || value === "false") return false;
  const asStr = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (asStr === "ACTIVE" || asStr === "ACTIVATED" || asStr === "ENABLED" || asStr === "ON") return true;
  if (asStr === "DISABLED" || asStr === "INACTIVE" || asStr === "OFF") return false;
  if (Array.isArray(value)) return value.some((v) => isEnabled(v) || (typeof v === "string" && v.trim().length > 0));
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((v) => isEnabled(v));
  }
  if (typeof value === "string") return value.trim().length > 0;
  return false;
}

function enabledObjectKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => isEnabled(v))
    .map(([k]) => k);
}

function unwrapMethodsPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.methods && typeof obj.methods === "object" && !Array.isArray(obj.methods)) {
    return unwrapMethodsPayload(obj.methods);
  }
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    const inner = obj.data as Record<string, unknown>;
    if ("card" in inner || "upi" in inner || "wallet" in inner || inner.entity === "methods") {
      return unwrapMethodsPayload(inner);
    }
  }
  return obj;
}

function upiAllowlist(methods: Record<string, unknown>): Set<string> | null {
  const upi = methods.upi;
  if (!upi || typeof upi !== "object" || Array.isArray(upi)) return null;
  const rec = upi as Record<string, unknown>;
  const raw = rec.apps ?? rec.intent_apps ?? rec.preferred_apps ?? rec.upi_apps;
  if (Array.isArray(raw)) {
    const ids = raw.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
    return ids.length > 0 ? new Set(ids) : null;
  }
  if (raw && typeof raw === "object") {
    const ids = enabledObjectKeys(raw).map((k) => k.toLowerCase());
    return ids.length > 0 ? new Set(ids) : null;
  }
  return null;
}

function upiItem(app: (typeof UPI_APPS)[number]): CheckoutPayMethodItem {
  return {
    id: `upi:${app.id}`,
    label: app.label,
    method: "upi",
    action: "pay",
    logoKey: app.logoKey,
    upiApp: app.razorpayApp,
  };
}

function titleCaseKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Dummy / local PAYMENT_DUMMY_MODE only — never used as a live Razorpay fallback. */
export function defaultCheckoutPayMethods(dummy: boolean): CheckoutPayMethodsResponse {
  const recommended = UPI_APPS.filter((a) => a.recommended).map(upiItem);
  const extraUpi = UPI_APPS.filter((a) => !a.recommended).map(upiItem);
  return {
    dummy,
    sections: [
      { id: "recommended", title: "RECOMMENDED", items: recommended },
      {
        id: "cards",
        title: "CARDS",
        items: [
          {
            id: "card:add",
            label: "Add credit or debit cards",
            method: "card",
            action: "add",
            logoKey: "card",
          },
        ],
      },
      { id: "upi", title: "PAY BY ANY UPI APP", items: extraUpi },
    ],
  };
}

export function summarizeRazorpayMethodsPayload(raw: unknown): Record<string, unknown> {
  const methods = unwrapMethodsPayload(raw);
  if (!methods) return { keys: [] };
  return {
    keys: Object.keys(methods),
    upi: methods.upi,
    card: methods.card,
    debit_card: methods.debit_card,
    credit_card: methods.credit_card,
    card_networks: methods.card_networks,
    walletKeys: enabledObjectKeys(methods.wallet),
    netbanking: isEnabled(methods.netbanking),
  };
}

/**
 * Build sheet sections from a Razorpay /v1/methods payload.
 * Empty sections means Razorpay really exposed nothing we can check out with.
 */
export function mapRazorpayMethodsPayload(raw: unknown, dummy: boolean): CheckoutPayMethodsResponse {
  const methods = unwrapMethodsPayload(raw);
  if (!methods) return { dummy, sections: [] };

  const upiOn = isEnabled(methods.upi);
  const cardOn =
    isEnabled(methods.card) ||
    isEnabled(methods.debit_card) ||
    isEnabled(methods.credit_card) ||
    isEnabled(methods.prepaid_card) ||
    isEnabled(methods.card_networks);
  const walletKeys = enabledObjectKeys(methods.wallet);
  const walletOn = isEnabled(methods.wallet) || walletKeys.length > 0;
  const netbankingOn = isEnabled(methods.netbanking);

  const allow = upiAllowlist(methods);
  const upiApps = allow
    ? UPI_APPS.filter((a) => allow.has(a.id) || allow.has(a.razorpayApp) || allow.has(a.logoKey))
    : UPI_APPS;

  const sections: CheckoutPayMethodSection[] = [];

  if (upiOn) {
    const recommended = upiApps.filter((a) => a.recommended).map(upiItem);
    if (recommended.length > 0) {
      sections.push({ id: "recommended", title: "RECOMMENDED", items: recommended });
    }
  }

  if (cardOn) {
    sections.push({
      id: "cards",
      title: "CARDS",
      items: [
        {
          id: "card:add",
          label: "Add credit or debit cards",
          method: "card",
          action: "add",
          logoKey: "card",
        },
      ],
    });
  }

  if (upiOn) {
    const extra = upiApps.filter((a) => !a.recommended).map(upiItem);
    if (extra.length === 0 && !sections.some((s) => s.id === "recommended")) {
      extra.push({
        id: "upi",
        label: "UPI",
        method: "upi",
        action: "pay",
        logoKey: "upi",
      });
    }
    if (extra.length > 0) {
      sections.push({ id: "upi", title: "PAY BY ANY UPI APP", items: extra });
    }
  }

  if (walletOn) {
    const items =
      walletKeys.length > 0
        ? walletKeys.map((key) => {
            const meta = WALLET_META[key] ?? {
              label: titleCaseKey(key),
              logoKey: key,
            };
            return {
              id: `wallet:${key}`,
              label: meta.label,
              method: "wallet" as const,
              action: "add" as const,
              logoKey: meta.logoKey,
              wallet: key,
            };
          })
        : [
            {
              id: "wallet",
              label: "Wallets",
              method: "wallet" as const,
              action: "pay" as const,
              logoKey: "wallet",
            },
          ];
    sections.push({ id: "wallets", title: "WALLETS", items });
  }

  if (netbankingOn) {
    sections.push({
      id: "netbanking",
      title: "NETBANKING",
      items: [
        {
          id: "netbanking",
          label: "Netbanking",
          method: "netbanking",
          action: "pay",
          logoKey: "netbanking",
        },
      ],
    });
  }

  return { dummy, sections };
}
