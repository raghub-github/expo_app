/**
 * Razorpay checkout via hosted backend page (expo-web-browser).
 */

import { useEffect, useRef } from "react";
import * as WebBrowser from "expo-web-browser";
import { getRiderAppConfig } from "@/src/config/env";

export type RazorpayPaymentResult = {
  razorpayPaymentId: string;
  razorpayOrderId: string;
  razorpaySignature: string;
};

export type RazorpayOrderParams = {
  orderId: string;
  keyId: string;
  amount: number;
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
};

const SUCCESS_PREFIX = "gatimitra-rider://pay-success";
const CANCEL_PREFIX = "gatimitra-rider://pay-cancel";
const REDIRECT_INTERCEPT = "gatimitra-rider://";

function normalizeContact(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function buildHostedCheckoutUrl(params: {
  orderParams: RazorpayOrderParams;
  prefill?: RazorpayPrefill;
  themeColor?: string;
}): string {
  const base = getRiderAppConfig().apiBaseUrl.replace(/\/+$/, "");
  const qs = new URLSearchParams({
    order_id: params.orderParams.orderId,
    key_id: params.orderParams.keyId,
    amount: String(params.orderParams.amount),
    success_url: SUCCESS_PREFIX,
    cancel_url: CANCEL_PREFIX,
    prefill_contact: normalizeContact(params.prefill?.contact),
    prefill_email: params.prefill?.email ?? "",
    prefill_name: params.prefill?.name ?? "",
    theme_color: params.themeColor ?? "#EAB308",
  });
  return `${base}/v1/razorpay-checkout?${qs.toString()}`;
}

function parseRazorpayTokensFromUrl(url: string): RazorpayPaymentResult {
  const idx = url.indexOf("?");
  const qs = idx >= 0 ? url.slice(idx + 1) : "";
  const params = new URLSearchParams(qs);
  return {
    razorpayPaymentId: params.get("razorpay_payment_id") ?? "",
    razorpayOrderId: params.get("razorpay_order_id") ?? "",
    razorpaySignature: params.get("razorpay_signature") ?? "",
  };
}

async function openBrowserCheckout(args: {
  orderParams: RazorpayOrderParams;
  prefill?: RazorpayPrefill;
  themeColor?: string;
  onSuccess: (r: RazorpayPaymentResult) => void;
  onCancel: () => void;
}): Promise<void> {
  const url = buildHostedCheckoutUrl(args);
  try {
    await WebBrowser.warmUpAsync();
  } catch {
    /* noop */
  }
  try {
    const result = await WebBrowser.openAuthSessionAsync(url, REDIRECT_INTERCEPT, {
      showInRecents: false,
      toolbarColor: args.themeColor ?? "#EAB308",
    });
    WebBrowser.coolDownAsync().catch(() => undefined);
    if (result.type !== "success" || !("url" in result) || !result.url) {
      args.onCancel();
      return;
    }
    const returnedUrl = String(result.url);
    if (returnedUrl.startsWith(SUCCESS_PREFIX)) {
      const tokens = parseRazorpayTokensFromUrl(returnedUrl);
      if (tokens.razorpayPaymentId && tokens.razorpayOrderId && tokens.razorpaySignature) {
        args.onSuccess(tokens);
        return;
      }
    }
    args.onCancel();
  } catch {
    args.onCancel();
  }
}

/** Promise API for banners / sheets (Expo Go fallback when native SDK is missing). */
export async function openHostedRazorpayCheckout(args: {
  orderParams: RazorpayOrderParams;
  prefill?: RazorpayPrefill;
  themeColor?: string;
}): Promise<RazorpayPaymentResult | null> {
  return new Promise((resolve) => {
    void openBrowserCheckout({
      ...args,
      onSuccess: (tokens) => resolve(tokens),
      onCancel: () => resolve(null),
    });
  });
}

export function RazorpayCheckoutModal({
  visible,
  orderParams,
  prefill,
  themeColor,
  onSuccess,
  onCancel,
}: Props) {
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!visible || !orderParams) {
      inFlightRef.current = false;
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    let cancelled = false;
    void openBrowserCheckout({
      orderParams,
      prefill,
      themeColor,
      onSuccess: (r) => {
        if (!cancelled) {
          inFlightRef.current = false;
          onSuccess(r);
        }
      },
      onCancel: () => {
        if (!cancelled) {
          inFlightRef.current = false;
          onCancel();
        }
      },
    });

    return () => {
      cancelled = true;
    };
  }, [visible, orderParams?.orderId, orderParams?.keyId, orderParams?.amount, prefill, themeColor, onSuccess, onCancel]);

  return null;
}
