/**
 * Razorpay Checkout — native SDK only (react-native-razorpay).
 *
 * Opens the in-app Razorpay bottom sheet (UPI / cards / netbanking / wallets).
 * No WebView, no hosted page, no expo-web-browser, no Linking.openURL.
 *
 * Failures surface via `onFailure` so the parent can show PaymentFailedSheet.
 * User dismiss → `onCancel` only (no failed sheet).
 */

import { useEffect, useRef } from "react";

export type RazorpayPaymentResult = {
  razorpayPaymentId: string;
  razorpayOrderId: string;
  razorpaySignature: string;
};

export type RazorpayOrderParams = {
  orderId: string;
  keyId: string;
  amount: number; // paise
};

export type RazorpayPrefill = {
  contact?: string | null;
  email?: string | null;
  name?: string | null;
};

type Props = {
  visible: boolean;
  orderParams: RazorpayOrderParams | null;
  prefill?: RazorpayPrefill;
  themeColor?: string;
  onSuccess: (result: RazorpayPaymentResult) => void;
  onCancel: () => void;
  onFailure?: (info: { message: string; rawError?: unknown }) => void;
};

const DEFAULT_THEME = "#16a34a";
const COMPANY_NAME = "GatiMitra Partner";
const COMPANY_DESCRIPTION = "Complete your subscription payment";

const DEV_BUILD_HINT =
  "Native Razorpay is not linked in this build. Close Expo Go and run a Development Build: cd apps/merchant_app && npx expo run:android";

function normalizeContact(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function isExplicitUserCancel(err: unknown): boolean {
  const errAny = err as {
    code?: number | string;
    description?: string;
    error?: { code?: number | string; description?: string };
    message?: string;
  };
  const codeRaw = errAny?.code ?? errAny?.error?.code;
  const code = typeof codeRaw === "string" ? Number(codeRaw) : codeRaw;
  if (code === 0) return true;
  const desc = String(
    errAny?.description ?? errAny?.error?.description ?? errAny?.message ?? ""
  ).toLowerCase();
  return (
    desc.includes("backpressed") ||
    desc.includes("user closed") ||
    desc.includes("user cancelled") ||
    desc.includes("payment cancelled by user")
  );
}

function loadRazorpayCheckout(): {
  open: (options: Record<string, unknown>) => Promise<{
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }>;
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("react-native-razorpay");
  const checkout = mod?.default ?? mod;
  if (!checkout || typeof checkout.open !== "function") {
    throw new Error(DEV_BUILD_HINT);
  }
  return checkout;
}

async function openNativeSdk(args: {
  orderParams: RazorpayOrderParams;
  prefill: RazorpayPrefill | undefined;
  themeColor: string;
}): Promise<RazorpayPaymentResult> {
  let RazorpayCheckout: ReturnType<typeof loadRazorpayCheckout>;
  try {
    RazorpayCheckout = loadRazorpayCheckout();
  } catch (e) {
    const err = e instanceof Error ? e : new Error(DEV_BUILD_HINT);
    (err as Error & { code?: string }).code = "SDK_MISSING";
    throw err;
  }

  const options: Record<string, unknown> = {
    key: args.orderParams.keyId,
    order_id: args.orderParams.orderId,
    amount: args.orderParams.amount,
    currency: "INR",
    name: COMPANY_NAME,
    description: COMPANY_DESCRIPTION,
    theme: { color: args.themeColor },
    prefill: {
      contact: normalizeContact(args.prefill?.contact),
      email: args.prefill?.email ?? "",
      name: args.prefill?.name ?? "",
    },
    notes: { source: "gatimitra_merchant_native" },
    retry: { enabled: true, max_count: 2 },
  };

  let data: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  };
  try {
    data = await RazorpayCheckout.open(options);
  } catch (rzpErr) {
    if (isExplicitUserCancel(rzpErr)) throw rzpErr;
    const msg = String(
      (rzpErr as Error)?.message ??
        (rzpErr as { description?: string })?.description ??
        rzpErr ??
        ""
    ).toLowerCase();
    if (
      msg.includes("null") ||
      msg.includes("undefined") ||
      msg.includes("not linked") ||
      msg.includes("unregistered") ||
      msg.includes("native module") ||
      msg.includes("cannot read")
    ) {
      const err = new Error(DEV_BUILD_HINT);
      (err as Error & { code?: string; cause?: unknown }).code = "SDK_UNLINKED";
      (err as Error & { cause?: unknown }).cause = rzpErr;
      throw err;
    }
    throw rzpErr;
  }

  return {
    razorpayPaymentId: String(data.razorpay_payment_id ?? ""),
    razorpayOrderId: String(data.razorpay_order_id ?? ""),
    razorpaySignature: String(data.razorpay_signature ?? ""),
  };
}

export function RazorpayCheckoutModal({
  visible,
  orderParams,
  prefill,
  themeColor,
  onSuccess,
  onCancel,
  onFailure,
}: Props): null {
  const theme = themeColor ?? DEFAULT_THEME;
  const inFlightRef = useRef(false);
  const completedRef = useRef(false);
  const orderKey = orderParams?.orderId ?? null;
  const launchGenRef = useRef(0);

  useEffect(() => {
    if (!visible) {
      inFlightRef.current = false;
      completedRef.current = false;
      return;
    }
    if (!orderParams) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const launchGen = ++launchGenRef.current;
    let cancelled = false;

    (async () => {
      await new Promise((r) => setTimeout(r, 60));
      if (cancelled || launchGen !== launchGenRef.current) return;

      try {
        const result = await openNativeSdk({
          orderParams,
          prefill,
          themeColor: theme,
        });
        if (cancelled || completedRef.current || launchGen !== launchGenRef.current) return;
        if (!result.razorpayPaymentId || !result.razorpayOrderId || !result.razorpaySignature) {
          inFlightRef.current = false;
          onFailure?.({
            message: "Payment completed without valid tokens. Please try again.",
          });
          return;
        }
        completedRef.current = true;
        onSuccess(result);
      } catch (e) {
        if (cancelled || launchGen !== launchGenRef.current) return;
        if (isExplicitUserCancel(e)) {
          completedRef.current = true;
          onCancel();
          return;
        }
        const msg =
          e instanceof Error
            ? e.message
            : String((e as { description?: string })?.description ?? e ?? "Payment failed");
        inFlightRef.current = false;
        if (onFailure) {
          onFailure({ message: msg, rawError: e });
        } else {
          onCancel();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, orderKey]);

  return null;
}
