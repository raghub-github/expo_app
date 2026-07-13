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
import {
  Modal,
  View,
  ActivityIndicator,
  Pressable,
  Text,
  StatusBar,
  Platform,
  Linking,
  StyleSheet,
  BackHandler,
} from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent, WebViewNavigation } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

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
};

export type RazorpayPrefill = {
  /** 10-digit Indian mobile — required for UPI Collect to render */
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

/* -------------------------------------------------------------------- */
/* Constants                                                            */
/* -------------------------------------------------------------------- */

const DEFAULT_THEME = "#16a34a";
const COMPANY_NAME = "GatiMitra";
const COMPANY_DESCRIPTION = "Complete your food order";

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
      email: args.prefill?.email ?? "",
      name: args.prefill?.name ?? "",
    },
    notes: {
      source: "gatimitra_customer_native",
    },
    // Retry only enables the Razorpay-side "retry" UI on soft failures — we
    // still get the final result via the promise resolve/reject.
    retry: { enabled: true, max_count: 2 },
  };

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
    const errAny = rzpErr as { code?: number; description?: string };
    const desc = String(errAny.description ?? "").toLowerCase();
    const looksLikeLinkerError =
      desc.includes("unregistered") ||
      desc.includes("undefined") ||
      desc.includes("null is not an object") ||
      desc.includes("cannot read property");
    if (looksLikeLinkerError) {
      const err = new Error("razorpay_module_runtime");
      (err as Error & { fallback?: boolean }).fallback = true;
      throw err;
    }
    // Genuine cancel / failure — surface upward with the real code.
    throw rzpErr;
  }
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
}): string {
  const key = escapeForJs(args.orderParams.keyId);
  const orderId = escapeForJs(args.orderParams.orderId);
  const amount = Math.trunc(args.orderParams.amount);
  const themeColor = escapeForJs(args.themeColor);
  const prefillName = escapeForJs(args.prefill?.name ?? "");
  const prefillEmail = escapeForJs(args.prefill?.email ?? "");
  const prefillContact = escapeForJs(normalizeContact(args.prefill?.contact));
  const name = escapeForJs(COMPANY_NAME);
  const desc = escapeForJs(COMPANY_DESCRIPTION);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <title>Complete payment</title>
  <style>
    html,body { margin:0; padding:0; height:100%; background:#ffffff; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
    .center { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#475569; gap:12px; padding:24px; box-sizing:border-box; text-align:center; }
    .spinner { width:36px; height:36px; border:3px solid #d1fae5; border-top-color:${themeColor}; border-radius:50%; animation:spin 0.9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .hint { font-size:14px; }
    .err { color:#dc2626; font-size:14px; display:none; }
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
        try {
          var rzp = new Razorpay(opts);
          rzp.on('payment.failed', function (resp) {
            var e = (resp && resp.error) || {};
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

/**
 * WebView URL/intent interceptor. Razorpay's UPI Collect step launches
 *   intent://…#Intent;…
 * URLs to open GPay / PhonePe / Paytm directly. On Android these are handled
 * by the system's intent resolver — we just need to forward them to Linking.
 * If the intent has a `browser_fallback_url` (some SDK variants), we honor it.
 */
function extractIntentFallbackUrl(intentUrl: string): string | null {
  try {
    const idx = intentUrl.indexOf("#Intent;");
    if (idx < 0) return null;
    const tail = intentUrl.slice(idx + "#Intent;".length);
    for (const p of tail.split(";")) {
      if (p.startsWith("S.browser_fallback_url=")) {
        return decodeURIComponent(p.replace("S.browser_fallback_url=", ""));
      }
    }
  } catch {}
  return null;
}

async function openExternalUpiUrl(url: string): Promise<boolean> {
  try {
    if (url.startsWith("intent://")) {
      const ok = await Linking.openURL(url).then(() => true).catch(() => false);
      if (ok) return true;
      const fallback = extractIntentFallbackUrl(url);
      if (fallback) {
        await Linking.openURL(fallback);
        return true;
      }
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------- */
/* Component                                                            */
/* -------------------------------------------------------------------- */

type Tier = "native" | "webview";

export function RazorpayCheckoutModal({
  visible,
  orderParams,
  prefill,
  themeColor,
  onSuccess,
  onCancel,
}: Props): React.ReactElement | null {
  const theme = themeColor ?? DEFAULT_THEME;
  const [tier, setTier] = useState<Tier | null>(null);
  const [webviewError, setWebviewError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const completedRef = useRef(false);

  // Reset per-checkout state whenever visibility flips from closed→open with a
  // new orderId. We key on orderId so re-renders (theme change, prefill change)
  // don't relaunch the sheet mid-flight.
  const orderKey = orderParams?.orderId ?? null;
  useEffect(() => {
    if (!visible) {
      inFlightRef.current = false;
      completedRef.current = false;
      setTier(null);
      setWebviewError(null);
      return;
    }
    if (!orderParams) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    // Attempt Tier 1 (native SDK). If it throws with the `fallback` flag,
    // switch to Tier 2 (WebView). Any other error is a real cancel / failure.
    let cancelled = false;
    (async () => {
      try {
        const result = await openNativeSdk({
          orderParams,
          prefill,
          themeColor: theme,
        });
        if (cancelled || completedRef.current) return;
        completedRef.current = true;
        // Sanity guard — the SDK sometimes returns partial payloads if the
        // response bridging is interrupted. Treat missing signature as failure.
        if (!result.razorpayPaymentId || !result.razorpayOrderId || !result.razorpaySignature) {
          onCancel();
          return;
        }
        onSuccess(result);
      } catch (e) {
        const errObj = e as Error & { fallback?: boolean; code?: number };
        if (cancelled) return;
        if (errObj.fallback === true) {
          // Native missing / broken — activate Tier 2.
          setTier("webview");
          return;
        }
        // User cancelled (code 0) or gateway failure (code 2) — treat both as
        // "not paid". Parent will decide whether to prompt retry.
        completedRef.current = true;
        onCancel();
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, orderKey]);

  // ── Tier 2 — WebView modal render                                   ──
  const html = useMemo(() => {
    if (tier !== "webview" || !orderParams) return "";
    return buildCheckoutHtml({ orderParams, prefill, themeColor: theme });
  }, [tier, orderParams, prefill, theme]);

  // Android back button while WebView is open = same as dismiss
  useEffect(() => {
    if (tier !== "webview" || Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!completedRef.current) {
        completedRef.current = true;
        onCancel();
      }
      return true;
    });
    return () => sub.remove();
  }, [tier, onCancel]);

  if (!visible || !orderParams) return null;
  if (tier !== "webview") {
    // Tier 1 is being attempted — no UI needed; native SDK renders its own
    // system-level bottom sheet. We just render nothing.
    return null;
  }

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      onRequestClose={() => {
        if (!completedRef.current) {
          completedRef.current = true;
          onCancel();
        }
      }}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              if (!completedRef.current) {
                completedRef.current = true;
                onCancel();
              }
            }}
            hitSlop={16}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close payment"
          >
            <Ionicons name="close" size={24} color="#0f172a" />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>Complete payment</Text>
          <View style={styles.headerSpacer} />
        </View>

        {webviewError ? (
          <View style={styles.errorWrap}>
            <Ionicons name="alert-circle-outline" size={40} color="#dc2626" />
            <Text style={styles.errorTitle}>Payment could not start</Text>
            <Text style={styles.errorBody}>{webviewError}</Text>
            <Pressable
              onPress={() => {
                if (!completedRef.current) {
                  completedRef.current = true;
                  onCancel();
                }
              }}
              style={[styles.retryBtn, { backgroundColor: theme }]}
            >
              <Text style={styles.retryTxt}>Close</Text>
            </Pressable>
          </View>
        ) : (
          <WebView
            originWhitelist={["*"]}
            source={{ html, baseUrl: "https://checkout.razorpay.com" }}
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            mixedContentMode="always"
            setSupportMultipleWindows={false}
            allowsBackForwardNavigationGestures={false}
            keyboardDisplayRequiresUserAction={false}
            style={styles.webview}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.spinnerWrap}>
                <ActivityIndicator size="large" color={theme} />
              </View>
            )}
            onShouldStartLoadWithRequest={(req: WebViewNavigation) => {
              const url = String(req.url || "");
              // Razorpay checkout redirects to UPI intent URLs to launch
              // GPay/PhonePe/etc. These are not HTTP loads — forward to
              // the system Linking API instead of trying to navigate the WV.
              if (url.startsWith("upi://") || url.startsWith("intent://") || url.startsWith("phonepe://") || url.startsWith("tez://")) {
                void openExternalUpiUrl(url);
                return false;
              }
              return true;
            }}
            onMessage={(evt: WebViewMessageEvent) => {
              let parsed: { type?: string; payload?: Record<string, unknown>; error?: Record<string, unknown> } = {};
              try {
                parsed = JSON.parse(String(evt.nativeEvent.data));
              } catch {
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
                const errDesc = String((parsed.error as { description?: string } | undefined)?.description ?? "");
                completedRef.current = true;
                // Show human-friendly error, then bubble up as cancel so the
                // checkout screen doesn't finalize.
                setWebviewError(errDesc || "Something went wrong. Please try again.");
              }
            }}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              if (completedRef.current) return;
              completedRef.current = true;
              setWebviewError(nativeEvent.description || "Payment page failed to load.");
            }}
          />
        )}
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
  spinnerWrap: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  errorTitle: { fontSize: 17, fontWeight: "600", color: "#0f172a", marginTop: 8 },
  errorBody: { fontSize: 14, color: "#475569", textAlign: "center", lineHeight: 20 },
  retryBtn: { marginTop: 16, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 10 },
  retryTxt: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
});
