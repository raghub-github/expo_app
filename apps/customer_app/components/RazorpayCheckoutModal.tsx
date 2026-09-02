/**
 * Razorpay Checkout — Native SDK primary, in-app WebView fallback.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHY THIS COMPONENT EXISTS
 * ────────────────────────────────────────────────────────────────────────
 * The customer app calls this from checkout/index.tsx after the backend
 * has minted a Razorpay Order id (via POST /v1/payment/create-order).
 * This component collects the user's payment (UPI / card / wallet / netbanking)
 * and returns the tokens the backend needs to verify + finalize:
 *
 *     razorpay_order_id
 *     razorpay_payment_id
 *     razorpay_signature
 *
 * All three are HMAC-verified server-side in finalizeOrder(). This component
 * itself does NOT trust anything from the payment gateway — it just passes
 * the tokens up to the parent for backend verification.
 *
 * ────────────────────────────────────────────────────────────────────────
 * ALGORITHM: DEFENSE-IN-DEPTH TWO-TIER
 * ────────────────────────────────────────────────────────────────────────
 * Tier 1 — Native SDK (react-native-razorpay@2.3.1)
 *   • Native bottom-sheet UX (same look as Zomato / Swiggy / any other RN app)
 *   • Handles UPI Intent → GPay/PhonePe/Paytm launch directly, no extra taps
 *   • Handles 3DS card auth in the native web view
 *   • Zero network round-trip for HTML shell (checkout.js loads inside SDK)
 *   • Preferred path — attempted FIRST
 *
 * Tier 2 — In-app WebView (react-native-webview + inline HTML shell)
 *   • Runs Razorpay's checkout.js from CDN inside a full-screen react-native-webview
 *   • Result bridge: `window.ReactNativeWebView.postMessage(JSON.stringify(...))`
 *   • Same in-app feel — user never sees Chrome Custom Tab or system browser
 *   • Handles UPI Intent by intercepting `intent://` in onShouldStartLoadWithRequest
 *     and calling Linking.openURL — matches the WIMM reference pattern
 *   • Only activates if the native module fails to load OR RazorpayCheckout.open()
 *     throws a "not registered" / "undefined" error
 *
 * The `useNativeSdk` state starts undefined (untested), becomes true on successful
 * dynamic import, becomes false on ImportError or run-time RN linker error. Once
 * decided, we stay on that tier for the lifetime of the component instance —
 * we never bounce between tiers mid-payment because that would corrupt the UX.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHY LAZY DYNAMIC IMPORT
 * ────────────────────────────────────────────────────────────────────────
 * react-native-razorpay is an old-bridge module. Importing it at app startup
 * would run its native init on every app launch, even for users who never
 * open checkout. If that init crashes under Reanimated 4.x's New Architecture,
 * the entire app crashes on splash.
 *
 * By importing inside the effect (only when checkout is actually visible),
 * we defer the crash surface to the moment the user has already committed to
 * paying — and even then, we catch the error and fall through to Tier 2 so
 * the user completes payment without ever seeing a crash.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES NOT DO
 * ────────────────────────────────────────────────────────────────────────
 *   • Does not open expo-web-browser / Chrome Custom Tab (previous behavior).
 *     The `expo-web-browser` dep can be removed from this file entirely.
 *   • Does not accept the "dummy_" key path — that's dead code once
 *     PAYMENT_DUMMY_MODE is off. Parent (checkout/index.tsx) already routes
 *     dummy_key to the simulated sheet component, not to this modal.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { AppText } from "@/components/AppText";

import {
  Modal,
  View,
  ActivityIndicator,
  Pressable,
  StatusBar,
  Platform,
  StyleSheet,
  BackHandler,
  InteractionManager,
} from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent, WebViewNavigation } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { openUpiApp, upiAppDisplayName } from "@/lib/openUpiApp";

/* -------------------------------------------------------------------- */
/* Public types (same shape as before — checkout/index.tsx unchanged)   */
/* -------------------------------------------------------------------- */

export type RazorpayPaymentResult = {
  razorpayPaymentId: string;
  razorpayOrderId: string;
  razorpaySignature: string;
};

export type RazorpayOrderParams = {
  orderId: string;
  keyId: string;
  amount: number; // paise (from create-order response)
  pendingId?: string;
};

export type RazorpayPrefill = {
  /** 10-digit Indian mobile — required for UPI Collect to render */
  contact?: string | null;
  email?: string | null;
  name?: string | null;
};

/** Restrict Standard Checkout to the method the user picked in Pay using. */
export type RazorpayCheckoutMethod = {
  method: "upi" | "card" | "wallet" | "netbanking";
  upiApp?: string;
  wallet?: string;
};

type Props = {
  visible: boolean;
  orderParams: RazorpayOrderParams | null;
  prefill?: RazorpayPrefill;
  themeColor?: string;
  checkoutMethod?: RazorpayCheckoutMethod | null;
  onSuccess: (result: RazorpayPaymentResult) => void;
  onCancel: () => void;
  /** Gateway / checkout failed — parent shows Payment Failed, not Razorpay's empty-method dialog. */
  onFailure?: () => void;
  /** UPI app was opened — parent should wait for webhook (payment-confirming). */
  onUpiAppOpened?: () => void;
};

/* -------------------------------------------------------------------- */
/* Constants                                                            */
/* -------------------------------------------------------------------- */

const DEFAULT_THEME = "#16a34a";
const COMPANY_NAME = "GatiMitra";
const COMPANY_DESCRIPTION = "Complete your food order";

/** Map our checkout `upiApp` ids to Razorpay `config.display` apps keys. */
function razorpayUpiAppKeys(upiApp: string): string[] {
  switch (upiApp) {
    case "google_pay":
      return ["google_pay", "gpay"];
    case "phonepe":
      return ["phonepe"];
    case "paytm":
      return ["paytm"];
    case "bhim":
      return ["bhim"];
    case "amazon_pay":
      return ["amazon_pay"];
    case "cred":
      return ["cred"];
    case "whatsapp":
      return ["whatsapp"];
    default:
      return [upiApp];
  }
}

/** Lock Standard Checkout to the instrument already chosen on Pay using. */
function buildDisplayConfig(method: RazorpayCheckoutMethod): Record<string, unknown> | null {
  if (method.method === "upi" && method.upiApp) {
    const apps = razorpayUpiAppKeys(method.upiApp);
    const label = upiAppDisplayName(method.upiApp);
    return {
      display: {
        blocks: {
          preferred: {
            name: `Pay using ${label}`,
            instruments: [
              {
                method: "upi",
                flows: ["intent"],
                apps,
              },
            ],
          },
        },
        sequence: ["block.preferred"],
        preferences: { show_default_blocks: false },
      },
    };
  }
  if (method.method === "wallet" && method.wallet) {
    return {
      display: {
        blocks: {
          preferred: {
            name: "Pay using Wallet",
            instruments: [{ method: "wallet", wallets: [method.wallet] }],
          },
        },
        sequence: ["block.preferred"],
        preferences: { show_default_blocks: false },
      },
    };
  }
  if (method.method === "card" || method.method === "netbanking") {
    return {
      display: {
        blocks: {
          preferred: {
            name: method.method === "card" ? "Pay using Card" : "Netbanking",
            instruments: [{ method: method.method }],
          },
        },
        sequence: ["block.preferred"],
        preferences: { show_default_blocks: false },
      },
    };
  }
  return null;
}

function applyCheckoutMethod(
  options: Record<string, unknown>,
  method: RazorpayCheckoutMethod | null | undefined
): void {
  if (!method?.method) return;
  // Top-level method + prefill.method, and when the user already picked a
  // specific UPI app / wallet on checkout, lock the sheet via config.display
  // so Razorpay does not re-open the full UPI app picker.
  options.method = method.method;
  options.prefill = {
    ...((options.prefill as Record<string, unknown> | undefined) ?? {}),
    method: method.method,
  };
  if (method.method === "wallet" && method.wallet) {
    options.wallet = method.wallet;
  }
  const config = buildDisplayConfig(method);
  if (config) {
    options.config = config;
  }
}

function isRazorpayNoMethodError(err: unknown): boolean {
  const errAny = err as { description?: string; error?: { description?: string } };
  const desc = String(errAny?.description ?? errAny?.error?.description ?? err ?? "").toLowerCase();
  return desc.includes("no appropriate payment method") || desc.includes("no payment method");
}

/* -------------------------------------------------------------------- */
/* Tier 1 — Native SDK invocation                                       */
/* -------------------------------------------------------------------- */

/**
 * Try to open the native Razorpay bottom sheet. Returns the payment result on
 * success. Throws a distinguishable error the caller can inspect to decide
 * whether to fall back to WebView or bubble up as a real failure.
 *
 * Error taxonomy (as thrown by react-native-razorpay):
 *   • error.code === 0            → user cancelled (do NOT fall back — user chose)
 *   • error.code === 2            → payment failure at gateway (do NOT fall back)
 *   • error.description contains  → module not linked / not on New Arch
 *       "unregistered" | "undefined method"
 *
 * We only fall back on the "module not available" case. Cancels and gateway
 * failures propagate as their true nature.
 */
async function openNativeSdk(args: {
  orderParams: RazorpayOrderParams;
  prefill: RazorpayPrefill | undefined;
  themeColor: string;
  checkoutMethod?: RazorpayCheckoutMethod | null;
}): Promise<RazorpayPaymentResult> {
  // Dynamic import — see file header for the "why lazy" rationale.
  // Wrap in try/catch because require() inside catch is ugly with TS; use a
  // typed variable so TS doesn't infer `any`.
  let RazorpayCheckoutModule: {
    open: (options: Record<string, unknown>) => Promise<{
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    }>;
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    RazorpayCheckoutModule = require("react-native-razorpay").default ?? require("react-native-razorpay");
  } catch (importErr) {
    // Module missing entirely (bundler didn't resolve, package removed, etc.)
    const err = new Error("razorpay_module_missing");
    (err as Error & { fallback?: boolean }).fallback = true;
    throw err;
  }

  if (!RazorpayCheckoutModule || typeof RazorpayCheckoutModule.open !== "function") {
    const err = new Error("razorpay_module_invalid");
    (err as Error & { fallback?: boolean }).fallback = true;
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
      email: normalizePrefillEmail(args.prefill?.email, normalizeContact(args.prefill?.contact)),
      name: args.prefill?.name ?? "",
    },
    notes: {
      source: "gatimitra_customer_native",
    },
    // Retry only enables the Razorpay-side "retry" UI on soft failures — we
    // still get the final result via the promise resolve/reject.
    retry: { enabled: true, max_count: 2 },
  };
  applyCheckoutMethod(options, args.checkoutMethod);
  if (__DEV__ && args.checkoutMethod?.method) {
    // eslint-disable-next-line no-console
    console.log("[payment] razorpay_checkout_open", {
      method: args.checkoutMethod.method,
      upiApp: args.checkoutMethod.upiApp ?? null,
      wallet: args.checkoutMethod.wallet ?? null,
      razorpayOrderId: args.orderParams.orderId,
    });
  }

  try {
    const data = await RazorpayCheckoutModule.open(options);
    return {
      razorpayPaymentId: String(data.razorpay_payment_id ?? ""),
      razorpayOrderId: String(data.razorpay_order_id ?? ""),
      razorpaySignature: String(data.razorpay_signature ?? ""),
    };
  } catch (rzpErr) {
    // Native SDK rejected. Distinguish between "we can't run" (fallback) vs
    // "user cancelled or payment failed" (real result, propagate).
    const errAny = rzpErr as {
      code?: number | string;
      description?: string;
      error?: { code?: number | string; description?: string };
    };
    const desc = String(errAny.description ?? errAny.error?.description ?? rzpErr ?? "").toLowerCase();
    const codeRaw = errAny.code ?? errAny.error?.code;
    const code = typeof codeRaw === "string" ? Number(codeRaw) : codeRaw;

    // Real user dismiss must never be reclassified as a linker/fallback error.
    if (code === 0 || isExplicitUserCancel(rzpErr)) {
      throw rzpErr;
    }

    const looksLikeLinkerError =
      desc.includes("unregistered") ||
      desc.includes("undefined method") ||
      desc.includes("null is not an object") ||
      desc.includes("cannot read property") ||
      desc.includes("native module") ||
      desc.includes("not linked") ||
      desc.includes("activity") ||
      code == null ||
      Number.isNaN(code as number);
    if (looksLikeLinkerError) {
      const err = new Error("razorpay_module_runtime");
      (err as Error & { fallback?: boolean }).fallback = true;
      throw err;
    }
    // Genuine gateway failure — surface upward with the real code.
    throw rzpErr;
  }
}

/** Razorpay code 0 = user dismissed the sheet. Anything else may be recoverable via WebView. */
function isExplicitUserCancel(err: unknown): boolean {
  const errAny = err as {
    code?: number | string;
    description?: string;
    error?: { code?: number | string; description?: string };
  };
  const codeRaw = errAny?.code ?? errAny?.error?.code;
  const code = typeof codeRaw === "string" ? Number(codeRaw) : codeRaw;
  if (code === 0) return true;
  const desc = String(errAny?.description ?? errAny?.error?.description ?? "").toLowerCase();
  return (
    desc.includes("user closed") ||
    desc.includes("user cancelled") ||
    desc.includes("payment cancelled by user") ||
    desc.includes("backpressed")
  );
}

/* -------------------------------------------------------------------- */
/* Tier 2 — In-app WebView shell                                        */
/* -------------------------------------------------------------------- */

/**
 * Escape any value so it's safe to interpolate inside a JS single-quoted
 * string (used when building the checkout HTML — user-controlled fields
 * like name / prefill would otherwise be script-injection surfaces).
 */
function escapeForJs(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/</g, "\\u003c");
}

function normalizeContact(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function normalizePrefillEmail(raw: string | null | undefined, contact: string): string {
  const email = String(raw ?? "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
  // Razorpay method preselection requires email + contact. Never send empty.
  const digits = contact.replace(/\D/g, "").slice(-10);
  if (digits.length === 10) return `cx${digits}@customers.gatimitra.com`;
  return "checkout@gatimitra.com";
}

/**
 * Build the HTML shell that loads Razorpay's checkout.js and opens the sheet
 * immediately. Communicates back to RN via window.ReactNativeWebView.postMessage.
 * Message contract:
 *   { type: "success", payload: {razorpay_payment_id, ...} }
 *   { type: "dismiss" }
 *   { type: "error",   error: { code?, description? } }
 *   { type: "log",     msg: "…" }   // debug traces, discarded in prod
 */
function buildCheckoutHtml(args: {
  orderParams: RazorpayOrderParams;
  prefill: RazorpayPrefill | undefined;
  themeColor: string;
  checkoutMethod?: RazorpayCheckoutMethod | null;
}): string {
  const key = escapeForJs(args.orderParams.keyId);
  const orderId = escapeForJs(args.orderParams.orderId);
  const amount = Math.trunc(args.orderParams.amount);
  const themeColor = escapeForJs(args.themeColor);
  const prefillName = escapeForJs(args.prefill?.name ?? "");
  const prefillContact = escapeForJs(normalizeContact(args.prefill?.contact));
  const prefillEmail = escapeForJs(
    normalizePrefillEmail(args.prefill?.email, normalizeContact(args.prefill?.contact))
  );
  const name = escapeForJs(COMPANY_NAME);
  const desc = escapeForJs(COMPANY_DESCRIPTION);
  const methodJson = JSON.stringify({
    method: args.checkoutMethod?.method ?? null,
    upiApp: args.checkoutMethod?.upiApp ?? null,
    wallet: args.checkoutMethod?.wallet ?? null,
  }).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <title>Complete payment</title>
  <style>
    html,body { margin:0; padding:0; height:100%; background:#ffffff; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
    .center { display:none; }
    .spinner { width:36px; height:36px; border:3px solid #d1fae5; border-top-color:${themeColor}; border-radius:50%; animation:spin 0.9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .hint { font-size:14px; }
    .err { color:#dc2626; font-size:14px; display:none; padding:24px; text-align:center; }
  </style>
</head>
<body>
  <div class="center">
    <div class="spinner" id="spin"></div>
    <div class="hint" id="hint">Opening secure payment…</div>
    <div class="err" id="err"></div>
  </div>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    (function() {
      function post(payload) {
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          }
        } catch (e) {}
      }
      function showErr(msg) {
        var e = document.getElementById('err');
        var s = document.getElementById('spin');
        var h = document.getElementById('hint');
        if (e) { e.textContent = msg; e.style.display = 'block'; }
        if (s) { s.style.display = 'none'; }
        if (h) { h.style.display = 'none'; }
      }
      function boot() {
        if (typeof Razorpay === 'undefined') {
          showErr('Payment gateway did not load. Check your internet and try again.');
          post({ type: 'error', error: { code: 'CHECKOUT_JS_FAILED', description: 'Razorpay checkout.js failed to load.' } });
          return;
        }
        var opts = {
          key: '${key}',
          order_id: '${orderId}',
          amount: ${amount},
          currency: 'INR',
          name: '${name}',
          description: '${desc}',
          theme: { color: '${themeColor}' },
          prefill: {
            name: '${prefillName}',
            email: '${prefillEmail}',
            contact: '${prefillContact}'
          },
          notes: { source: 'gatimitra_customer_webview' },
          retry: { enabled: true, max_count: 2 },
          handler: function (response) {
            post({ type: 'success', payload: response });
          },
          modal: {
            ondismiss: function () {
              post({ type: 'dismiss' });
            },
            escape: false,
            backdropclose: false
          }
        };
        var methodPick = ${methodJson};
        if (methodPick && methodPick.method) {
          opts.method = methodPick.method;
          opts.prefill.method = methodPick.method;
          if (methodPick.method === 'wallet' && methodPick.wallet) {
            opts.wallet = methodPick.wallet;
          }
          if (methodPick.method === 'upi' && methodPick.upiApp) {
            var upiApps = methodPick.upiApp === 'google_pay'
              ? ['google_pay', 'gpay']
              : [methodPick.upiApp];
            var upiLabel = methodPick.upiApp === 'google_pay' ? 'Google Pay'
              : methodPick.upiApp === 'phonepe' ? 'PhonePe'
              : methodPick.upiApp === 'paytm' ? 'Paytm'
              : methodPick.upiApp === 'bhim' ? 'BHIM'
              : 'UPI';
            opts.config = {
              display: {
                blocks: {
                  preferred: {
                    name: 'Pay using ' + upiLabel,
                    instruments: [{ method: 'upi', flows: ['intent'], apps: upiApps }]
                  }
                },
                sequence: ['block.preferred'],
                preferences: { show_default_blocks: false }
              }
            };
          } else if (methodPick.method === 'wallet' && methodPick.wallet) {
            opts.config = {
              display: {
                blocks: {
                  preferred: {
                    name: 'Pay using Wallet',
                    instruments: [{ method: 'wallet', wallets: [methodPick.wallet] }]
                  }
                },
                sequence: ['block.preferred'],
                preferences: { show_default_blocks: false }
              }
            };
          } else if (methodPick.method === 'card' || methodPick.method === 'netbanking') {
            opts.config = {
              display: {
                blocks: {
                  preferred: {
                    name: methodPick.method === 'card' ? 'Pay using Card' : 'Netbanking',
                    instruments: [{ method: methodPick.method }]
                  }
                },
                sequence: ['block.preferred'],
                preferences: { show_default_blocks: false }
              }
            };
          }
          post({ type: 'log', msg: 'razorpay_checkout_open method=' + methodPick.method + ' upiApp=' + (methodPick.upiApp || '') });
        }
        try {
          var rzp = new Razorpay(opts);
          rzp.on('payment.failed', function (resp) {
            var e = (resp && resp.error) || {};
            try { rzp.close(); } catch (closeErr) {}
            post({ type: 'error', error: { code: e.code, description: e.description, reason: e.reason, source: e.source, step: e.step } });
          });
          rzp.open();
        } catch (openErr) {
          showErr('Payment could not start. Please retry.');
          post({ type: 'error', error: { code: 'RAZORPAY_OPEN_FAILED', description: String(openErr && openErr.message || openErr) } });
        }
      }
      if (document.readyState === 'complete') boot();
      else window.addEventListener('load', boot);
    })();
  </script>
</body>
</html>`;
}

function isUpiLaunchUrl(url: string): boolean {
  return (
    url.startsWith("upi://") ||
    url.startsWith("intent://") ||
    url.startsWith("phonepe://") ||
    url.startsWith("tez://") ||
    url.startsWith("gpay://") ||
    url.startsWith("paytmmp://") ||
    url.startsWith("bhim://") ||
    url.startsWith("cred://") ||
    url.startsWith("whatsapp://") ||
    url.startsWith("amazonpay://") ||
    url.startsWith("ppe://")
  );
}

const UPI_INTERCEPT_JS = `
(function() {
  function report(url) {
    if (!url) return;
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'launch_url', url: String(url) }));
    } catch (e) {}
  }
  var wo = window.open;
  window.open = function(url) { report(url); return null; };
  document.addEventListener('click', function(e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (a && a.href) report(a.href);
  }, true);
})();
true;
`;

/* -------------------------------------------------------------------- */
/* Component                                                            */
/* -------------------------------------------------------------------- */

type Tier = "native" | "webview";

export function RazorpayCheckoutModal({
  visible,
  orderParams,
  prefill,
  themeColor,
  checkoutMethod,
  onSuccess,
  onCancel,
  onFailure,
  onUpiAppOpened,
}: Props): React.ReactElement | null {
  const theme = themeColor ?? DEFAULT_THEME;
  const [tier, setTier] = useState<Tier | null>(null);
  const [webviewError, setWebviewError] = useState<string | null>(null);
  const [waitingUpiLaunch, setWaitingUpiLaunch] = useState(false);
  const inFlightRef = useRef(false);
  const completedRef = useRef(false);
  const upiOpenedRef = useRef(false);

  const upiAppLabel = upiAppDisplayName(checkoutMethod?.upiApp);

  const schedulePaymentFailure = (handler: () => void) => {
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(handler);
    });
  };

  const failOrCancel = () => {
    schedulePaymentFailure(() => {
      if (onFailure) onFailure();
      else onCancel();
    });
  };

  const markUpiOpened = () => {
    if (completedRef.current || upiOpenedRef.current) return;
    upiOpenedRef.current = true;
    completedRef.current = true;
    if (onUpiAppOpened) onUpiAppOpened();
  };

  const orderKey = orderParams?.orderId ?? null;
  const checkoutMethodKey = `${checkoutMethod?.method ?? ""}:${checkoutMethod?.upiApp ?? ""}:${checkoutMethod?.wallet ?? ""}`;
  const launchGenRef = useRef(0);
  useEffect(() => {
    if (!visible) {
      inFlightRef.current = false;
      completedRef.current = false;
      upiOpenedRef.current = false;
      setTier(null);
      setWebviewError(null);
      setWaitingUpiLaunch(false);
      return;
    }
    if (!orderParams) return;

    const launchGen = ++launchGenRef.current;
    let cancelled = false;
    inFlightRef.current = true;
    completedRef.current = false;
    upiOpenedRef.current = false;
    setTier(null);
    setWebviewError(null);

    const isExpoGo = Constants.appOwnership === "expo";

    (async () => {
      await new Promise((r) => setTimeout(r, 60));
      if (cancelled || launchGen !== launchGenRef.current) return;

      const goWebview = () => {
        inFlightRef.current = false;
        setWaitingUpiLaunch(false);
        setTier("webview");
      };

      if (isExpoGo) {
        goWebview();
        return;
      }

      try {
        const result = await openNativeSdk({
          orderParams,
          prefill,
          themeColor: theme,
          checkoutMethod,
        });
        if (cancelled || completedRef.current || launchGen !== launchGenRef.current) return;
        if (!result.razorpayPaymentId || !result.razorpayOrderId || !result.razorpaySignature) {
          goWebview();
          return;
        }
        completedRef.current = true;
        onSuccess(result);
      } catch (e) {
        if (cancelled || launchGen !== launchGenRef.current) return;
        const errObj = e as Error & {
          fallback?: boolean;
          code?: number | string;
          error?: { code?: number | string };
        };
        if (errObj.fallback === true) {
          goWebview();
          return;
        }
        if (isExplicitUserCancel(e)) {
          completedRef.current = true;
          schedulePaymentFailure(onCancel);
          return;
        }
        if (isRazorpayNoMethodError(e)) {
          completedRef.current = true;
          failOrCancel();
          return;
        }
        const codeRaw = errObj.code ?? errObj.error?.code;
        const code = typeof codeRaw === "string" ? Number(codeRaw) : codeRaw;
        if (code === 2) {
          completedRef.current = true;
          failOrCancel();
          return;
        }
        goWebview();
      }
    })();

    return () => {
      cancelled = true;
      inFlightRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, orderKey, checkoutMethodKey]);

  // ── Tier 2 — WebView modal render                                   ──
  const html = useMemo(() => {
    if (tier !== "webview" || !orderParams) return "";
    return buildCheckoutHtml({ orderParams, prefill, themeColor: theme, checkoutMethod });
  }, [tier, orderParams, prefill, theme, checkoutMethod]);

  // Android back while payment overlay is open = same as dismiss
  useEffect(() => {
    if (!visible || Platform.OS !== "android") return;
    if (!waitingUpiLaunch && tier !== "webview") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!completedRef.current) {
        completedRef.current = true;
        onCancel();
      }
      return true;
    });
    return () => sub.remove();
  }, [visible, tier, waitingUpiLaunch, onCancel]);

  useEffect(() => {
    if (!visible || (tier !== "webview" && !waitingUpiLaunch)) return;
    StatusBar.setHidden(false, "none");
  }, [visible, tier, waitingUpiLaunch]);

  if (!visible || !orderParams) return null;

  const showOpeningOverlay = tier == null && !waitingUpiLaunch;

  const handleLaunchUrl = (url: string) => {
    if (!isUpiLaunchUrl(url) || completedRef.current) return;
    void (async () => {
      const ok = await openUpiApp(url, checkoutMethod?.upiApp);
      if (ok) markUpiOpened();
    })();
  };

  const webView = webviewError ? (
    <View style={styles.errorWrap}>
      <Ionicons name="alert-circle-outline" size={40} color="#dc2626" />
      <AppText style={styles.errorTitle}>Payment could not start</AppText>
      <AppText style={styles.errorBody}>{webviewError}</AppText>
      <Pressable
        onPress={() => {
          if (!completedRef.current) {
            completedRef.current = true;
            onCancel();
          }
        }}
        style={[styles.retryBtn, { backgroundColor: theme }]}
      >
        <AppText style={styles.retryTxt}>Close</AppText>
      </Pressable>
    </View>
  ) : html.length > 0 ? (
    <WebView
      originWhitelist={["*"]}
      source={{ html, baseUrl: "https://checkout.razorpay.com" }}
      javaScriptEnabled
      domStorageEnabled
      thirdPartyCookiesEnabled
      mixedContentMode="always"
      setSupportMultipleWindows={Platform.OS === "android" ? false : true}
      allowsBackForwardNavigationGestures={false}
      keyboardDisplayRequiresUserAction={false}
      injectedJavaScript={UPI_INTERCEPT_JS}
      style={styles.webview}
      startInLoadingState
      androidHardwareAccelerationDisabled={false}
      renderLoading={() => (
        <View style={styles.spinnerWrap}>
          <ActivityIndicator size="large" color={theme} />
        </View>
      )}
      onShouldStartLoadWithRequest={(req: WebViewNavigation) => {
        const url = String(req.url || "");
        if (isUpiLaunchUrl(url)) {
          handleLaunchUrl(url);
          return false;
        }
        return true;
      }}
      onOpenWindow={(e) => {
        const url = String(e.nativeEvent.targetUrl || "");
        if (isUpiLaunchUrl(url)) handleLaunchUrl(url);
      }}
      onMessage={(evt: WebViewMessageEvent) => {
        let parsed: {
          type?: string;
          payload?: Record<string, unknown>;
          error?: Record<string, unknown>;
          url?: string;
        } = {};
        try {
          parsed = JSON.parse(String(evt.nativeEvent.data));
        } catch {
          return;
        }
        if (parsed.type === "launch_url" && parsed.url) {
          handleLaunchUrl(String(parsed.url));
          return;
        }
        if (completedRef.current) return;
        if (parsed.type === "success" && parsed.payload) {
          const p = parsed.payload as {
            razorpay_payment_id?: string;
            razorpay_order_id?: string;
            razorpay_signature?: string;
          };
          if (p.razorpay_payment_id && p.razorpay_order_id && p.razorpay_signature) {
            completedRef.current = true;
            onSuccess({
              razorpayPaymentId: String(p.razorpay_payment_id),
              razorpayOrderId: String(p.razorpay_order_id),
              razorpaySignature: String(p.razorpay_signature),
            });
          }
          return;
        }
        if (parsed.type === "dismiss") {
          completedRef.current = true;
          onCancel();
          return;
        }
        if (parsed.type === "error") {
          completedRef.current = true;
          failOrCancel();
        }
      }}
      onError={(syntheticEvent) => {
        if (completedRef.current) return;
        completedRef.current = true;
        failOrCancel();
      }}
    />
  ) : (
    <View style={styles.spinnerWrap}>
      <ActivityIndicator size="large" color={theme} />
      <AppText style={styles.openingHint}>Loading secure payment…</AppText>
    </View>
  );

  if (showOpeningOverlay) {
    return (
      <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!completedRef.current) {
            completedRef.current = true;
            onCancel();
          }
        }}
      >
        <View style={styles.upiLaunchRoot}>
          <View style={styles.upiLaunchDim}>
            <View style={styles.upiLaunchCard}>
              <ActivityIndicator color={theme} />
              <AppText style={styles.upiLaunchText}>Opening secure payment…</AppText>
              <Pressable
                onPress={() => {
                  if (!completedRef.current) {
                    completedRef.current = true;
                    onCancel();
                  }
                }}
                hitSlop={10}
                style={styles.upiLaunchCancelHit}
              >
                <AppText style={styles.upiLaunchCancel}>Cancel</AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  if (waitingUpiLaunch) {
    return (
      <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!completedRef.current) {
            completedRef.current = true;
            onCancel();
          }
        }}
      >
        <View style={styles.upiLaunchRoot}>
          <View style={styles.upiLaunchDim}>
            <View style={styles.upiLaunchCard}>
              <ActivityIndicator color={theme} />
              <AppText style={styles.upiLaunchText}>Redirecting {upiAppLabel}</AppText>
              <Pressable
                onPress={() => {
                  if (!completedRef.current) {
                    completedRef.current = true;
                    onCancel();
                  }
                }}
                hitSlop={10}
                style={styles.upiLaunchCancelHit}
              >
                <AppText style={styles.upiLaunchCancel}>Cancel</AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  if (tier !== "webview") {
    return null;
  }

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      onRequestClose={() => {
        if (!completedRef.current) {
          completedRef.current = true;
          onCancel();
        }
      }}
    >
      <StatusBar hidden={false} barStyle="dark-content" backgroundColor="#ffffff" />
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        {webView}
      </SafeAreaView>
    </Modal>
  );
}

/* -------------------------------------------------------------------- */
/* Styles                                                               */
/* -------------------------------------------------------------------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  closeBtn: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: "600", color: "#0f172a", textAlign: "center" },
  headerSpacer: { width: 36 },
  webview: { flex: 1, backgroundColor: "#ffffff" },
  webviewBehind: {
    flex: 1,
    backgroundColor: "transparent",
  },
  upiLaunchRoot: {
    flex: 1,
  },
  upiWebviewHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  upiLaunchDim: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  upiLaunchCard: {
    backgroundColor: "#1E1E1E",
    borderRadius: 16,
    paddingHorizontal: 28,
    paddingVertical: 22,
    alignItems: "center",
    minWidth: 220,
  },
  upiLaunchText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
    marginTop: 12,
    textAlign: "center",
  },
  upiLaunchCancelHit: {
    marginTop: 14,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  upiLaunchCancel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2DD4BF",
    textAlign: "center",
  },
  spinnerWrap: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  openingHint: {
    marginTop: 12,
    fontSize: 14,
    color: "#475569",
    textAlign: "center",
  },
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorTitle: { fontSize: 17, fontWeight: "600", color: "#0f172a", marginTop: 8 },
  errorBody: { fontSize: 14, color: "#475569", textAlign: "center", lineHeight: 20 },
  retryBtn: { marginTop: 16, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 10 },
  retryTxt: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
});
