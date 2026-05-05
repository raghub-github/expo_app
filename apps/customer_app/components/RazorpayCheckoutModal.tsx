/**
 * Razorpay checkout in a WebView. Uses inline HTML so the device only needs to load
 * checkout.razorpay.com (no backend URL). Shows UPI, cards, wallets etc.
 */

import React, { useCallback, useMemo } from "react";
import { Modal, View, StyleSheet, TouchableOpacity, Text, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

// Use an internal scheme so the OS does not open it as a deep link (which would reload the app).
// The app scheme is "gatimitra" – loading gatimitra:// in the WebView was triggering a reload.
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
  /** Indian mobile (10 digits, with or without +91). Required for UPI Collect convenience. */
  contact?: string | null;
  email?: string | null;
  name?: string | null;
};

type Props = {
  visible: boolean;
  /** Order params from create-order API. When set, checkout is rendered as inline HTML (recommended). */
  orderParams: RazorpayOrderParams | null;
  /** Prefill for contact/email/name; improves UPI Collect UX (auto-fills VPA sheet) and helps ensure UPI block renders. */
  prefill?: RazorpayPrefill;
  /** Brand colour shown in the Razorpay modal. */
  themeColor?: string;
  onSuccess: (result: RazorpayPaymentResult) => void;
  onCancel: () => void;
};

/**
 * Build checkout HTML so WebView only loads Razorpay script from the internet.
 *
 * UPI visibility notes (from Razorpay Checkout docs):
 *  - Currency MUST be INR (we rely on the order currency).
 *  - The account must have UPI enabled in Razorpay Dashboard → Settings →
 *    Configuration → Payment methods. Test mode accounts often have it
 *    disabled by default.
 *  - Passing `prefill.contact` (10-digit Indian mobile) enables UPI Collect
 *    convenience and helps the UPI block render reliably on mobile WebViews.
 *  - `config.display.blocks.banks` with `"upi"` sequencing ensures UPI is
 *    shown as a primary method in the checkout modal.
 *  - `theme.color` is optional but improves brand consistency.
 */
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
        prefill: {
          contact: prefill.contact || "",
          email: prefill.email || "",
          name: prefill.name || ""
        },
        theme: { color: themeColor || "#16a34a" },
        // Tell Razorpay Checkout to show UPI / cards / netbanking / wallets as
        // top-level blocks. If an account doesn't have UPI enabled server-side
        // Razorpay will silently drop it — this config only controls ordering.
        config: {
          display: {
            blocks: {
              upi: { name: "Pay using UPI", instruments: [{ method: "upi" }] },
              other: { name: "Other methods", instruments: [
                { method: "card" }, { method: "netbanking" }, { method: "wallet" }
              ] }
            },
            sequence: ["block.upi", "block.other"],
            preferences: { show_default_blocks: true }
          }
        },
        handler: function(r) {
          var u = success_url + (success_url.indexOf("?") >= 0 ? "&" : "?") +
            "razorpay_payment_id=" + encodeURIComponent(r.razorpay_payment_id) +
            "&razorpay_order_id=" + encodeURIComponent(r.razorpay_order_id) +
            "&razorpay_signature=" + encodeURIComponent(r.razorpay_signature);
          window.location.href = u;
        },
        modal: {
          confirm_close: true,
          ondismiss: function() { window.location.href = cancel_url; }
        }
      };
      var rzp = new Razorpay(options);
      rzp.on("payment.failed", function(resp) {
        // Surface the error briefly then navigate back so checkout can retry.
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

export function RazorpayCheckoutModal({ visible, orderParams, prefill, themeColor, onSuccess, onCancel }: Props) {
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
  }, [
    orderParams?.orderId,
    orderParams?.keyId,
    orderParams?.amount,
    prefill?.contact,
    prefill?.email,
    prefill?.name,
    themeColor,
  ]);

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
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={24} color={GatiMitraColors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Complete payment</Text>
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
              <Text style={styles.loadingText}>Opening Razorpay…</Text>
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
  loadingWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  loadingText: { marginTop: 12, fontSize: 15, color: GatiMitraColors.textSecondary },
});
