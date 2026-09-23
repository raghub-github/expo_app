/**
 * Razorpay Checkout — native SDK primary, in-app WebView fallback (Expo Go).
 *
 * Tier 1: react-native-razorpay (dev / production builds)
 * Tier 2: checkout.js inside react-native-webview when native module is missing
 *         (Expo Go) or fails to open.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent, WebViewNavigation } from "react-native-webview";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";

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
  /**
   * Fast-confirm: polled while the native sheet is open. Return true once the
   * backend confirms the payment (webhook/reconciler) so we can finish without
   * waiting on the slow UPI SDK promise. `onServerConfirmed` then runs instead
   * of the token-based `onSuccess`.
   */
  checkServerStatus?: () => Promise<boolean>;
  onServerConfirmed?: () => void;
};

const DEFAULT_THEME = "#16a34a";
const COMPANY_NAME = "GatiMitra Partner";
const COMPANY_DESCRIPTION = "Complete your payment";

type Tier = "native" | "webview";

function normalizeContact(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function normalizePrefillEmail(raw: string | null | undefined, contact: string): string {
  const email = String(raw ?? "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
  const digits = contact.replace(/\D/g, "").slice(-10);
  if (digits.length === 10) return `mx${digits}@partners.gatimitra.com`;
  return "partner@gatimitra.com";
}

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

function isNativeUnlinkedError(err: unknown): boolean {
  const msg = String(
    (err as Error)?.message ??
      (err as { description?: string })?.description ??
      err ??
      ""
  ).toLowerCase();
  return (
    msg.includes("null") ||
    msg.includes("undefined") ||
    msg.includes("not linked") ||
    msg.includes("unregistered") ||
    msg.includes("native module") ||
    msg.includes("cannot read") ||
    msg.includes("sdk_missing") ||
    msg.includes("sdk_unlinked")
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
    const err = new Error("SDK_MISSING");
    (err as Error & { code?: string }).code = "SDK_MISSING";
    throw err;
  }
  return checkout;
}

async function openNativeSdk(args: {
  orderParams: RazorpayOrderParams;
  prefill: RazorpayPrefill | undefined;
  themeColor: string;
  onSheetOpening?: () => void;
}): Promise<RazorpayPaymentResult> {
  const RazorpayCheckout = loadRazorpayCheckout();
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

  // Fired the instant the sheet is handed to Razorpay — the promise below only
  // settles after the payment fully completes (slow for UPI intent), so this is
  // what lets the overlay relabel to "Confirming…" during the wait.
  args.onSheetOpening?.();
  const data = await RazorpayCheckout.open(options);
  return {
    razorpayPaymentId: String(data.razorpay_payment_id ?? ""),
    razorpayOrderId: String(data.razorpay_order_id ?? ""),
    razorpaySignature: String(data.razorpay_signature ?? ""),
  };
}

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
  const prefillContact = escapeForJs(normalizeContact(args.prefill?.contact));
  const prefillEmail = escapeForJs(
    normalizePrefillEmail(args.prefill?.email, normalizeContact(args.prefill?.contact))
  );
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
    .center { display:flex; align-items:center; justify-content:center; flex-direction:column; height:100%; gap:12px; color:#64748b; }
    .spinner { width:36px; height:36px; border:3px solid #d1fae5; border-top-color:${themeColor}; border-radius:50%; animation:spin 0.9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .err { color:#dc2626; font-size:14px; display:none; padding:24px; text-align:center; }
  </style>
</head>
<body>
  <div class="center">
    <div class="spinner" id="spin"></div>
    <div id="hint">Opening secure payment…</div>
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
          notes: { source: 'gatimitra_merchant_webview' },
          retry: { enabled: true, max_count: 2 },
          handler: function (response) {
            post({ type: 'success', payload: response });
          },
          modal: {
            ondismiss: function () { post({ type: 'dismiss' }); },
            escape: false,
            backdropclose: false
          }
        };
        try {
          var rzp = new Razorpay(opts);
          rzp.on('payment.failed', function (resp) {
            var e = (resp && resp.error) || {};
            try { rzp.close(); } catch (closeErr) {}
            post({ type: 'error', error: { code: e.code, description: e.description } });
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
    url.startsWith("bhim://")
  );
}

export function RazorpayCheckoutModal({
  visible,
  orderParams,
  prefill,
  themeColor,
  onSuccess,
  onCancel,
  onFailure,
  checkServerStatus,
  onServerConfirmed,
}: Props): React.ReactElement | null {
  const theme = themeColor ?? DEFAULT_THEME;
  const [tier, setTier] = useState<Tier | null>(null);
  const [nativeSheetOpen, setNativeSheetOpen] = useState(false);
  const [webviewError, setWebviewError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const completedRef = useRef(false);
  const orderKey = orderParams?.orderId ?? null;
  const launchGenRef = useRef(0);
  // Latest callbacks without retriggering the launch effect (keyed on order only).
  const checkServerStatusRef = useRef(checkServerStatus);
  const onServerConfirmedRef = useRef(onServerConfirmed);
  useEffect(() => {
    checkServerStatusRef.current = checkServerStatus;
    onServerConfirmedRef.current = onServerConfirmed;
  }, [checkServerStatus, onServerConfirmed]);

  useEffect(() => {
    if (!visible) {
      inFlightRef.current = false;
      completedRef.current = false;
      setTier(null);
      setNativeSheetOpen(false);
      setWebviewError(null);
      return;
    }
    if (!orderParams) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const launchGen = ++launchGenRef.current;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const isExpoGo = Constants.appOwnership === "expo";

    const stopPoll = () => {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
    };

    // Fast-confirm: while the native sheet resolves the slow UPI collect, poll
    // the backend; finish the moment it confirms instead of waiting on the SDK.
    const startServerConfirmPoll = () => {
      const check = checkServerStatusRef.current;
      if (!check) return;
      const tick = async () => {
        if (cancelled || completedRef.current || launchGen !== launchGenRef.current) return;
        let confirmed = false;
        try {
          confirmed = await check();
        } catch {
          confirmed = false;
        }
        if (cancelled || completedRef.current || launchGen !== launchGenRef.current) return;
        if (confirmed) {
          completedRef.current = true;
          stopPoll();
          onServerConfirmedRef.current?.();
          return;
        }
        pollTimer = setTimeout(() => void tick(), 2500);
      };
      pollTimer = setTimeout(() => void tick(), 3000);
    };

    const goWebview = () => {
      inFlightRef.current = false;
      setTier("webview");
    };

    (async () => {
      await new Promise((r) => setTimeout(r, 60));
      if (cancelled || launchGen !== launchGenRef.current) return;

      if (isExpoGo) {
        goWebview();
        return;
      }

      try {
        const result = await openNativeSdk({
          orderParams,
          prefill,
          themeColor: theme,
          onSheetOpening: () => {
            if (cancelled || launchGen !== launchGenRef.current) return;
            setNativeSheetOpen(true);
            startServerConfirmPoll();
          },
        });
        stopPoll();
        if (cancelled || completedRef.current || launchGen !== launchGenRef.current) return;
        if (!result.razorpayPaymentId || !result.razorpayOrderId || !result.razorpaySignature) {
          goWebview();
          return;
        }
        completedRef.current = true;
        onSuccess(result);
      } catch (e) {
        stopPoll();
        if (cancelled || completedRef.current || launchGen !== launchGenRef.current) return;
        if (isExplicitUserCancel(e)) {
          completedRef.current = true;
          onCancel();
          return;
        }
        if (isNativeUnlinkedError(e)) {
          goWebview();
          return;
        }
        const msg =
          e instanceof Error
            ? e.message
            : String((e as { description?: string })?.description ?? e ?? "Payment failed");
        inFlightRef.current = false;
        if (onFailure) onFailure({ message: msg, rawError: e });
        else onCancel();
      }
    })();

    return () => {
      cancelled = true;
      stopPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, orderKey]);

  useEffect(() => {
    if (!visible || Platform.OS !== "android" || tier !== "webview") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!completedRef.current) {
        completedRef.current = true;
        onCancel();
      }
      return true;
    });
    return () => sub.remove();
  }, [visible, tier, onCancel]);

  useEffect(() => {
    if (!visible || tier !== "webview") return;
    StatusBar.setHidden(false, "none");
  }, [visible, tier]);

  const html = useMemo(() => {
    if (tier !== "webview" || !orderParams) return "";
    return buildCheckoutHtml({ orderParams, prefill, themeColor: theme });
  }, [tier, orderParams, prefill, theme]);

  if (!visible || !orderParams) return null;

  if (tier !== "webview") {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
        <View style={styles.opening}>
          <ActivityIndicator size="large" color={theme} />
          <AppText style={styles.openingText}>
            {nativeSheetOpen ? "Confirming your payment…" : "Opening payment…"}
          </AppText>
          {nativeSheetOpen ? (
            <AppText style={styles.openingSub}>This can take a few seconds.</AppText>
          ) : null}
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <AppText style={styles.headerTitle}>Complete payment</AppText>
          <Pressable
            onPress={() => {
              if (!completedRef.current) {
                completedRef.current = true;
                onCancel();
              }
            }}
            hitSlop={12}
          >
            <Ionicons name="close" size={24} color="#0f172a" />
          </Pressable>
        </View>
        {webviewError ? (
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
              style={[styles.closeBtn, { backgroundColor: theme }]}
            >
              <AppText style={styles.closeBtnText}>Close</AppText>
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
            setSupportMultipleWindows={Platform.OS === "android" ? false : true}
            style={styles.webview}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.spinnerWrap}>
                <ActivityIndicator size="large" color={theme} />
              </View>
            )}
            onShouldStartLoadWithRequest={(req: WebViewNavigation) => {
              const url = String(req.url || "");
              if (isUpiLaunchUrl(url)) {
                // Let Razorpay / system handle UPI deep links when possible.
                return true;
              }
              return true;
            }}
            onMessage={(evt: WebViewMessageEvent) => {
              let parsed: {
                type?: string;
                payload?: Record<string, unknown>;
                error?: { description?: string; code?: string };
              } = {};
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
                const msg =
                  parsed.error?.description ||
                  "Payment failed. Please try again.";
                inFlightRef.current = false;
                if (onFailure) {
                  onFailure({ message: msg, rawError: parsed.error });
                } else {
                  setWebviewError(msg);
                }
              }
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  opening: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  openingText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  openingSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "500" },
  safe: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  webview: { flex: 1 },
  spinnerWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
  },
  errorTitle: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  errorBody: { fontSize: 14, color: "#64748b", textAlign: "center" },
  closeBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  closeBtnText: { color: "#fff", fontWeight: "700" },
});
