/**
 * Shared native Razorpay checkout — used by BOTH onboarding fee and negative
 * wallet recovery. `react-native-razorpay` is a native module: present in
 * dev-client / EAS builds, absent in Expo Go (guard with isNativeRazorpayAvailable).
 */
import RazorpayCheckout from "react-native-razorpay";

export type NativeRazorpayOrder = {
  orderId: string;
  /** Amount in paise. */
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

/** True only when the native module is linked (i.e. not Expo Go). */
export function isNativeRazorpayAvailable(): boolean {
  return !!RazorpayCheckout && typeof (RazorpayCheckout as { open?: unknown }).open === "function";
}

function last10(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const digits = String(raw).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : undefined;
}

/**
 * Open the native Razorpay sheet. Resolves with the three verification tokens on
 * success; REJECTS with `{ code, description }` on user cancel or gateway failure.
 */
export async function openRazorpayCheckout(args: {
  order: NativeRazorpayOrder;
  prefill?: NativeRazorpayPrefill;
  name?: string;
  description?: string;
  themeColor?: string;
}): Promise<NativeRazorpayResult> {
  const { order } = args;
  const options = {
    key: order.keyId,
    order_id: order.orderId,
    amount: order.amount,
    currency: order.currency || "INR",
    name: args.name || "GatiMitra",
    description: args.description || "Payment",
    theme: { color: args.themeColor || "#39d353" },
    prefill: {
      name: args.prefill?.name || undefined,
      contact: last10(args.prefill?.contact),
      email: args.prefill?.email || undefined,
    },
  };

  const result = await RazorpayCheckout.open(options);
  return {
    razorpayOrderId: result.razorpay_order_id || order.orderId,
    razorpayPaymentId: result.razorpay_payment_id,
    razorpaySignature: result.razorpay_signature,
  };
}

/** Normalise a Razorpay rejection into `{ code, description }`. */
export function extractRazorpayError(err: unknown): { code: string; description: string } {
  const obj = (err ?? {}) as { code?: unknown; description?: unknown };
  return {
    code: typeof obj.code === "string" ? obj.code : obj.code != null ? String(obj.code) : "",
    description: typeof obj.description === "string" ? obj.description : "",
  };
}
