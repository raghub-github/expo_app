/**
 * Shared native Razorpay checkout for rider app (onboarding fee, negative
 * wallet recovery, subscription dues).
 *
 * Uses `require()` — not a static ESM import — because Metro/Hermes often
 * resolves `react-native-razorpay`'s default export incorrectly, which made
 * `isNativeRazorpayAvailable()` return false and Pay buttons appear dead.
 *
 * Prefer native Android/iOS SDK; callers should fall back to hosted browser
 * checkout when this returns unavailable (Expo Go / unlinked builds).
 */
import { NativeModules, Platform } from "react-native";

export type NativeRazorpayOrder = {
  orderId: string;
  /** Amount in paise (integer). */
  amount: number;
  currency?: string;
  keyId: string;
};

export type NativeRazorpayPrefill = {
  name?: string | null;
  contact?: string | null;
  email?: string | null;
};

export type NativeRazorpayResult = {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
};

type RazorpayNativeModule = {
  open: (options: Record<string, unknown>) => Promise<{
    razorpay_payment_id?: string;
    razorpay_order_id?: string;
    razorpay_signature?: string;
  }>;
};

let cachedModule: RazorpayNativeModule | null | undefined;

/** True when the Android/iOS native bridge is linked (not Expo Go). */
function hasNativeRazorpayBridge(): boolean {
  const bridge = (NativeModules as { RNRazorpayCheckout?: { open?: unknown } | null })
    .RNRazorpayCheckout;
  return Boolean(bridge && typeof bridge.open === "function");
}

/**
 * Resolve the native module once. Handles both CJS shapes:
 *   module.exports = { open }
 *   module.exports.default = { open }
 *
 * IMPORTANT: `react-native-razorpay`'s JS file always exports `open`, even in
 * Expo Go — but it then crashes with "Cannot read property 'open' of null"
 * because `NativeModules.RNRazorpayCheckout` is missing. We require the bridge.
 */
function resolveNativeModule(): RazorpayNativeModule | null {
  if (Platform.OS === "web" || !hasNativeRazorpayBridge()) {
    cachedModule = null;
    return null;
  }
  if (cachedModule !== undefined) return cachedModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-razorpay");
    const candidate = (mod?.default ?? mod) as RazorpayNativeModule | undefined;
    if (candidate && typeof candidate.open === "function") {
      cachedModule = candidate;
      return candidate;
    }
    cachedModule = null;
    return null;
  } catch {
    cachedModule = null;
    return null;
  }
}

/** True when the native Razorpay SDK is linked (dev-client / EAS / Play build). */
export function isNativeRazorpayAvailable(): boolean {
  return resolveNativeModule() != null;
}

function last10(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const digits = String(raw).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : undefined;
}

function toPaiseInt(amount: number): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(100, Math.trunc(n));
}

/**
 * Open the native Razorpay sheet. Resolves with verification tokens on success;
 * rejects with `{ code, description }` on cancel / gateway / linker failure.
 */
export async function openRazorpayCheckout(args: {
  order: NativeRazorpayOrder;
  prefill?: NativeRazorpayPrefill;
  name?: string;
  description?: string;
  themeColor?: string;
}): Promise<NativeRazorpayResult> {
  const sdk = resolveNativeModule();
  if (!sdk) {
    const err = Object.assign(new Error("Native Razorpay module is not available"), {
      code: "MODULE_MISSING",
      description:
        "Native Razorpay is not linked. Install a production/dev-client build (not Expo Go).",
    });
    throw err;
  }

  const { order } = args;
  const amountPaise = toPaiseInt(order.amount);
  if (!(amountPaise >= 100)) {
    const err = Object.assign(new Error("Invalid payment amount"), {
      code: "INVALID_AMOUNT",
      description: "Payment amount must be at least ₹1.",
    });
    throw err;
  }
  if (!order.keyId || order.keyId === "dummy_key" || !order.orderId) {
    const err = Object.assign(new Error("Invalid Razorpay order"), {
      code: "INVALID_ORDER",
      description: "Missing Razorpay order id or key.",
    });
    throw err;
  }

  const options: Record<string, unknown> = {
    key: order.keyId,
    order_id: order.orderId,
    amount: amountPaise,
    currency: order.currency || "INR",
    name: args.name || "GatiMitra",
    description: args.description || "Payment",
    theme: { color: args.themeColor || "#39d353" },
    prefill: {
      name: args.prefill?.name || undefined,
      contact: last10(args.prefill?.contact),
      email: args.prefill?.email || undefined,
    },
    retry: { enabled: true, max_count: 1 },
  };

  try {
    const result = await sdk.open(options);
    const paymentId = String(result?.razorpay_payment_id ?? "").trim();
    const orderId = String(result?.razorpay_order_id ?? order.orderId).trim();
    const signature = String(result?.razorpay_signature ?? "").trim();
    if (!paymentId || !signature) {
      const err = Object.assign(new Error("Incomplete Razorpay response"), {
        code: "INCOMPLETE_RESPONSE",
        description: "Payment completed but verification tokens were missing.",
      });
      throw err;
    }
    return {
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    };
  } catch (rzpErr) {
    const msg = rzpErr instanceof Error ? rzpErr.message : String(rzpErr ?? "");
    // Expo Go / unlinked: JS wrapper exists but NativeModules.RNRazorpayCheckout is null.
    if (/open['"]?\s+of\s+null/i.test(msg) || /RNRazorpayCheckout/i.test(msg)) {
      cachedModule = null;
      throw Object.assign(new Error("Native Razorpay module is not available"), {
        code: "MODULE_MISSING",
        description:
          "Native Razorpay is not linked. Install a production/dev-client build (not Expo Go).",
      });
    }
    // Re-throw normalised shape so callers can Alert consistently.
    const extracted = extractRazorpayError(rzpErr);
    if (extracted.code || extracted.description) {
      throw Object.assign(
        rzpErr instanceof Error ? rzpErr : new Error(extracted.description || "Payment failed"),
        extracted
      );
    }
    throw rzpErr;
  }
}

/** Normalise a Razorpay rejection into `{ code, description }`. */
export function extractRazorpayError(err: unknown): { code: string; description: string } {
  const obj = (err ?? {}) as {
    code?: unknown;
    description?: unknown;
    error?: { code?: unknown; description?: unknown; reason?: unknown };
    message?: unknown;
  };
  const nested = obj.error;
  const codeRaw = obj.code ?? nested?.code;
  const descRaw =
    obj.description ?? nested?.description ?? nested?.reason ?? obj.message ?? "";
  return {
    code: typeof codeRaw === "string" ? codeRaw : codeRaw != null ? String(codeRaw) : "",
    description: typeof descRaw === "string" ? descRaw : descRaw != null ? String(descRaw) : "",
  };
}

/** True when the user dismissed the sheet (not a linker/gateway failure). */
export function isRazorpayUserCancel(err: unknown): boolean {
  const { code, description } = extractRazorpayError(err);
  // Razorpay's PAYMENT_CANCELLED constant is 2. Do NOT treat code 0 or an empty code
  // as cancel — 0 is NETWORK_ERROR and "" is "no code", both real failures we must
  // surface (the old `Number(code) === 0` swallowed every codeless error as a cancel,
  // hiding genuine gateway/verify failures and recording them as "cancelled").
  if (code.trim() === "2") return true;
  const d = description.toLowerCase();
  return (
    d.includes("cancelled") ||
    d.includes("canceled") ||
    d.includes("user closed") ||
    d.includes("dismiss") ||
    d.includes("backpressed") ||
    d.includes("back pressed")
  );
}
