/**
 * Razorpay checkout — browser-fallback only.
 *
 * The native `react-native-razorpay` dependency has been removed from the
 * project (see package.json). When `PAYMENT_DUMMY_MODE=true` on the backend,
 * the checkout screen renders the in-app dummy sheet and never instantiates
 * this component. When real Razorpay is re-enabled later, this component
 * still works — it opens the backend's hosted `/v1/razorpay-checkout` page in
 * a Chrome Custom Tab via `expo-web-browser`, which supports UPI Intent on
 * Android out of the box.
 *
 * Why the native module was removed:
 *   1. We have a dummy bypass for testing — Razorpay isn't called at all.
 *   2. `react-native-razorpay@2.3.1` is an old-bridge module that has been
 *      a recurring cause of startup crashes under React Native's New
 *      Architecture (TurboModules). Reanimated 4.x forces newArchEnabled=true,
 *      so we can't disable it. Removing this dep eliminates a major suspect.
 *   3. The browser fallback alone delivers a complete UPI / card / wallet UX
 *      via Razorpay's hosted page, with no native SDK linkage.
 *
 * If you ever want the native bottom-sheet UX back, run:
 *   npm install react-native-razorpay@^2.3.1
 *   Then re-enable the native probe block at the bottom of this file.
 */

import { useEffect, useRef, useState } from "react";
import * as WebBrowser from "expo-web-browser";

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
  /** 10-digit Indian mobile (REQUIRED for UPI Collect to render). */
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

/* ----------------------------------------------------------------------- */
/* Helpers                                                                 */
/* ----------------------------------------------------------------------- */

const SUCCESS_PREFIX = "gatimitra://pay-success";
const CANCEL_PREFIX = "gatimitra://pay-cancel";
const REDIRECT_INTERCEPT = "gatimitra://";

function normalizeContact(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function getApiBaseUrl(): string {
  const explicit = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const host = (process.env.EXPO_PUBLIC_DEV_HOST ?? "").trim();
  const port = (process.env.EXPO_PUBLIC_API_PORT ?? "3000").trim();
  if (host) return `http://${host}:${port}`;
  // Production safety net: if EAS missed baking in the URL, fall back to the
  // public domain instead of localhost (which is unreachable from a phone).
  if (!__DEV__) return "https://api.gatimitra.com";
  return "http://localhost:3000";
}

function buildHostedCheckoutUrl(params: {
  orderParams: RazorpayOrderParams;
  prefill?: RazorpayPrefill;
  themeColor?: string;
}): string {
  const base = getApiBaseUrl();
  const qs = new URLSearchParams({
    order_id: params.orderParams.orderId,
    key_id: params.orderParams.keyId,
    amount: String(params.orderParams.amount),
    success_url: SUCCESS_PREFIX,
    cancel_url: CANCEL_PREFIX,
    prefill_contact: normalizeContact(params.prefill?.contact),
    prefill_email: params.prefill?.email ?? "",
    prefill_name: params.prefill?.name ?? "",
    theme_color: params.themeColor ?? "#16a34a",
  });
  return `${base}/v1/razorpay-checkout?${qs.toString()}`;
}

function parseRazorpayTokensFromUrl(url: string): RazorpayPaymentResult {
  let qs = "";
  const idx = url.indexOf("?");
  if (idx >= 0) qs = url.slice(idx + 1);
  const params = new URLSearchParams(qs);
  return {
    razorpayPaymentId: params.get("razorpay_payment_id") ?? "",
    razorpayOrderId: params.get("razorpay_order_id") ?? "",
    razorpaySignature: params.get("razorpay_signature") ?? "",
  };
}

/* ----------------------------------------------------------------------- */
/* Browser fallback path                                                   */
/* ----------------------------------------------------------------------- */

async function openBrowserCheckout(args: {
  orderParams: RazorpayOrderParams;
  prefill?: RazorpayPrefill;
  themeColor?: string;
  onSuccess: (r: RazorpayPaymentResult) => void;
  onCancel: () => void;
}): Promise<void> {
  const { orderParams, prefill, themeColor, onSuccess, onCancel } = args;
  const url = buildHostedCheckoutUrl({ orderParams, prefill, themeColor });
  // eslint-disable-next-line no-console
  console.log("[razorpay] opening browser checkout", { orderId: orderParams.orderId });

  try {
    await WebBrowser.warmUpAsync();
  } catch {
    /* iOS does not support warmUp; ignore */
  }

  try {
    const result = await WebBrowser.openAuthSessionAsync(url, REDIRECT_INTERCEPT, {
      showInRecents: false,
      toolbarColor: themeColor ?? "#16a34a",
      enableDefaultShareMenuItem: false,
      enableBarCollapsing: false,
    });
    WebBrowser.coolDownAsync().catch(() => undefined);

    if (result.type !== "success" || !("url" in result) || !result.url) {
      onCancel();
      return;
    }
    const returnedUrl = String(result.url);
    if (returnedUrl.startsWith(SUCCESS_PREFIX)) {
      const tokens = parseRazorpayTokensFromUrl(returnedUrl);
      if (tokens.razorpayPaymentId && tokens.razorpayOrderId && tokens.razorpaySignature) {
        onSuccess(tokens);
        return;
      }
      onCancel();
      return;
    }
    onCancel();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[razorpay] openAuthSessionAsync threw", err);
    onCancel();
  }
}

/* ----------------------------------------------------------------------- */
/* Component                                                               */
/* ----------------------------------------------------------------------- */

export function RazorpayCheckoutModal({ visible, orderParams, prefill, themeColor, onSuccess, onCancel }: Props) {
  const inFlightRef = useRef(false);
  const [, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!visible || !orderParams) {
      inFlightRef.current = false;
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    let cancelledByEffect = false;
    const wrappedOnSuccess = (r: RazorpayPaymentResult) => {
      if (!cancelledByEffect) {
        inFlightRef.current = false;
        onSuccess(r);
      }
    };
    const wrappedOnCancel = () => {
      if (!cancelledByEffect) {
        inFlightRef.current = false;
        onCancel();
      }
    };

    void openBrowserCheckout({
      orderParams,
      prefill,
      themeColor,
      onSuccess: wrappedOnSuccess,
      onCancel: wrappedOnCancel,
    });

    return () => {
      cancelledByEffect = true;
    };
  }, [
    visible,
    orderParams?.orderId,
    orderParams?.keyId,
    orderParams?.amount,
    prefill?.contact,
    prefill?.email,
    prefill?.name,
    themeColor,
    onSuccess,
    onCancel,
  ]);

  return null;
}
