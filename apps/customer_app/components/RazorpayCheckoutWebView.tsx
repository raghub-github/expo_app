/**
 * Razorpay checkout — WebView fallback.
 *
 * Used when the native `react-native-razorpay` SDK is unavailable (e.g. running
 * inside Expo Go, or the dev client wasn't rebuilt after adding the native
 * module). Limitations vs the native SDK:
 *   - UPI Intent (Google Pay / PhonePe / Paytm) is HIDDEN by Razorpay because
 *     WebViews can't deep-link via `upi://` Intent URLs.
 *   - UPI QR is hidden for the same reason.
 *   - UPI Collect (enter VPA) DOES still render if the merchant has it enabled.
 * Cards / EMI / Netbanking / Wallets / Pay Later all work normally.
 */

import { useCallback, useMemo } from "react";
import { AppText } from "@/components/AppText";

import { Modal, View, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

const PAY_SUCCESS_PREFIX = "gm-internal://pay-success";
const PAY_CANCEL_PREFIX = "gm-internal://pay-cancel";
const SUCCESS_URL = "gm-internal://pay-success";
const CANCEL_URL = "gm-internal://pay-cancel";

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

function buildCheckoutHtml(
  orderId: string,
  keyId: string,
  amount: number,
  prefill: RazorpayPrefill | undefined,
  themeColor: string
): string {
  const orderIdJ = JSON.stringify(orderId);
  const keyIdJ = JSON.stringify(keyId);
  const amountJ = JSON.stringify(String(amount));
  const successUrlJ = JSON.stringify(SUCCESS_URL);
  const cancelUrlJ = JSON.stringify(CANCEL_URL);
  const prefillJ = JSON.stringify({
    contact: prefill?.contact ? String(prefill.contact).replace(/[^\d+]/g, "") : undefined,
    email: prefill?.email || undefined,
    name: prefill?.name || undefined,
  });
  const themeJ = JSON.stringify(themeColor);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <title>Complete payment</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; box-sizing: border-box; }
    .msg { color: #64748b; font-size: 15px; margin-top: 12px; }
    .err { color: #dc2626; font-size: 14px; margin-top: 12px; text-align: center; }
  </style>
</head>
<body>
  <p class="msg" id="status">Opening Razorpay…</p>
  <p class="err" id="err" style="display:none;"></p>
  <script>
(function() {
  var order_id = ${orderIdJ};
  var key_id = ${keyIdJ};
  var amount = ${amountJ};
  var success_url = ${successUrlJ};
  var cancel_url = ${cancelUrlJ};
  var prefill = ${prefillJ};
  var themeColor = ${themeJ};
  var statusEl = document.getElementById("status");
  var errEl = document.getElementById("err");
  function showErr(msg) {
    if (statusEl) statusEl.style.display = "none";
    if (errEl) { errEl.textContent = msg; errEl.style.display = "block"; }
  }
  if (!order_id || !key_id || amount === "0") {
    showErr("Invalid payment parameters.");
    return;
  }
  function openCheckout() {
    if (typeof Razorpay === "undefined") {
      showErr("Razorpay failed to load. Check your connection.");
      return;
    }
    try {
      var options = {
        key: key_id,
        amount: Number(amount),
        currency: "INR",
        order_id: order_id,
        name: "GatiMitra",
        description: "Order payment",
        prefill: { contact: prefill.contact || "", email: prefill.email || "", name: prefill.name || "" },
        theme: { color: themeColor || "#16a34a" },
        notes: { source: "gatimitra-customer-app-webview" },
        retry: { enabled: true, max_count: 3 },
        send_sms_hash: true,
        remember_customer: false,
        handler: function(r) {
          var u = success_url + (success_url.indexOf("?") >= 0 ? "&" : "?") +
            "razorpay_payment_id=" + encodeURIComponent(r.razorpay_payment_id) +
            "&razorpay_order_id=" + encodeURIComponent(r.razorpay_order_id) +
            "&razorpay_signature=" + encodeURIComponent(r.razorpay_signature);
          window.location.href = u;
        },
        modal: { confirm_close: true, ondismiss: function() { window.location.href = cancel_url; } }
      };
      var rzp = new Razorpay(options);
      rzp.on("payment.failed", function(resp) {
        try {
          var desc = (resp && resp.error && resp.error.description) ? resp.error.description : "";
          if (desc && errEl) { errEl.textContent = desc; errEl.style.display = "block"; }
        } catch (e) { /* noop */ }
        setTimeout(function() { window.location.href = cancel_url; }, 400);
      });
      rzp.open();
      if (statusEl) statusEl.textContent = "Choose payment method below…";
    } catch (e) {
      showErr("Could not open payment: " + (e && e.message ? e.message : "Try again."));
    }
  }
  if (typeof Razorpay !== "undefined") { openCheckout(); return; }
  var s = document.createElement("script");
  s.src = "https://checkout.razorpay.com/v1/checkout.js";
  s.async = true;
  s.onload = function() { openCheckout(); };
  s.onerror = function() { showErr("Could not load Razorpay. Check internet."); };
  document.head.appendChild(s);
})();
  </script>
</body>
</html>`;
}

export function RazorpayCheckoutWebView({ visible, orderParams, prefill, themeColor, onSuccess, onCancel }: Props) {
  const webViewSource = useMemo(() => {
    if (!orderParams) return null;
    return {
      html: buildCheckoutHtml(
        orderParams.orderId,
        orderParams.keyId,
        orderParams.amount,
        prefill,
        themeColor ?? GatiMitraColors.emerald
      ),
    };
  }, [orderParams?.orderId, orderParams?.keyId, orderParams?.amount, prefill?.contact, prefill?.email, prefill?.name, themeColor]);

  const handleShouldStartLoadWithRequest = useCallback(
    (request: { url: string }) => {
      const url = request.url;
      if (url.startsWith(PAY_SUCCESS_PREFIX)) {
        try {
          const parsed = new URL(url);
          const paymentId = parsed.searchParams.get("razorpay_payment_id") ?? "";
          const orderId = parsed.searchParams.get("razorpay_order_id") ?? "";
          const signature = parsed.searchParams.get("razorpay_signature") ?? "";
          if (paymentId && orderId && signature) {
            onSuccess({ razorpayPaymentId: paymentId, razorpayOrderId: orderId, razorpaySignature: signature });
          }
        } catch {
          onCancel();
        }
        return false;
      }
      if (url.startsWith(PAY_CANCEL_PREFIX)) {
        onCancel();
        return false;
      }
      return true;
    },
    [onSuccess, onCancel]
  );

  if (!visible || !webViewSource) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={24} color={GatiMitraColors.textPrimary} />
          </TouchableOpacity>
          <AppText style={styles.headerTitle}>Complete payment</AppText>
          <View style={styles.headerSpacer} />
        </View>
        <WebView
          source={webViewSource}
          style={styles.webview}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess={false}
          mixedContentMode="compatibility"
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={GatiMitraColors.emerald} />
              <AppText style={styles.loadingText}>Opening Razorpay…</AppText>
            </View>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
  },
  closeBtn: { padding: 8 },
  headerTitle: { fontSize: 17, fontWeight: "700", color: GatiMitraColors.textPrimary },
  headerSpacer: { width: 40 },
  webview: { flex: 1 },
  loadingWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" },
  loadingText: { marginTop: 12, fontSize: 15, color: GatiMitraColors.textSecondary },
});
