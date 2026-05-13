/**
 * Payment / order confirmation failed.
 *
 * UX rules (from production payment best-practices):
 *   1. Tell the user what went wrong in plain language (no gateway codes).
 *   2. Make the FASTEST recovery action the primary CTA — for payment failures
 *      that's "Try a different payment method" which goes back to checkout
 *      with the cart preserved (NOT a full restart).
 *   3. Reassure them about debited money (auto-refund SLA).
 *   4. Keep escape hatches: "View My Orders" (in case the order DID save) and
 *      "Contact support" for stuck cases.
 */

import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

const PAD = 20;

/** Heuristic: classify the error so we can pick the right primary CTA. */
function classifyError(message: string, code: string | null): "PAYMENT_DECLINED" | "TIMEOUT" | "NETWORK" | "UNKNOWN" {
  const m = message.toLowerCase();
  if (m.includes("declined") || m.includes("insufficient") || m.includes("authentication") || m.includes("limit")) {
    return "PAYMENT_DECLINED";
  }
  if (m.includes("timeout") || m.includes("timed out") || code === "PAYMENT_PENDING_CONFIRMATION") {
    return "TIMEOUT";
  }
  if (m.includes("network") || m.includes("connection") || m.includes("offline")) {
    return "NETWORK";
  }
  return "UNKNOWN";
}

export default function PaymentFailureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { message: msgParam, title: titleParam, code: codeParam } = useLocalSearchParams<{
    message?: string | string[];
    title?: string | string[];
    code?: string | string[];
  }>();
  const message = (Array.isArray(msgParam) ? msgParam[0] : msgParam) ?? "We could not confirm your payment or order.";
  const title = (Array.isArray(titleParam) ? titleParam[0] : titleParam) ?? "Payment couldn't be completed";
  const code = (Array.isArray(codeParam) ? codeParam[0] : codeParam) ?? null;

  const kind = classifyError(message, code);
  const primaryLabel =
    kind === "PAYMENT_DECLINED"
      ? "Try a different payment method"
      : kind === "NETWORK"
      ? "Check connection & retry"
      : kind === "TIMEOUT"
      ? "Retry payment"
      : "Try a different payment method";

  /** Go back to checkout — the cart, address, and bill are preserved in cart store. */
  const goToCheckout = () => router.replace("/checkout");

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.iconWrap}>
        <View style={styles.iconCircle}>
          <Ionicons name="close-circle" size={64} color="#dc2626" />
        </View>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{message}</Text>

      <View style={styles.reassureCard}>
        <Ionicons name="shield-checkmark" size={20} color={GatiMitraColors.emerald} />
        <Text style={styles.reassureText}>
          If money was debited, it is auto-refunded within 5–7 business days. No action needed.
        </Text>
      </View>

      {/* Primary: try a different method (or retry, depending on error class) */}
      <TouchableOpacity style={styles.primary} onPress={goToCheckout} activeOpacity={0.88}>
        <Ionicons name="card-outline" size={20} color="#fff" style={styles.btnIcon} />
        <Text style={styles.primaryText}>{primaryLabel}</Text>
      </TouchableOpacity>

      {/* Helpful sub-line under the CTA explains where it'll take you */}
      <Text style={styles.primaryHint}>
        You'll go back to checkout — your cart and address are saved. Pick UPI, a different card, netbanking, or a wallet.
      </Text>

      <TouchableOpacity style={styles.secondary} onPress={() => router.replace("/(tabs)/orders")} activeOpacity={0.88}>
        <Ionicons name="receipt-outline" size={18} color={GatiMitraColors.emerald} style={styles.btnIcon} />
        <Text style={styles.secondaryText}>View My Orders</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.tertiary} onPress={() => router.replace("/(tabs)/")} activeOpacity={0.88}>
        <Text style={styles.tertiaryText}>Back to Home</Text>
      </TouchableOpacity>

      {code ? <Text style={styles.errorCode}>Reference: {code}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: GatiMitraColors.softBackground },
  content: { paddingHorizontal: PAD },
  iconWrap: { alignItems: "center", marginBottom: 16 },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
  },
  title: { fontSize: 22, fontWeight: "800", color: GatiMitraColors.textPrimary, textAlign: "center", marginBottom: 10 },
  body: { fontSize: 15, color: GatiMitraColors.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 16 },
  reassureCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#ECFDF5",
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  reassureText: { flex: 1, fontSize: 13, color: GatiMitraColors.textPrimary, lineHeight: 19 },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraColors.emerald,
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 8,
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  primaryHint: { fontSize: 12, color: GatiMitraColors.textSecondary, textAlign: "center", marginBottom: 16, paddingHorizontal: 12 },
  secondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: GatiMitraColors.emerald,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  secondaryText: { color: GatiMitraColors.emerald, fontSize: 15, fontWeight: "700" },
  tertiary: { paddingVertical: 12, alignItems: "center" },
  tertiaryText: { color: GatiMitraColors.textSecondary, fontSize: 15, fontWeight: "600" },
  btnIcon: { marginRight: 8 },
  errorCode: { fontSize: 11, color: GatiMitraColors.textSecondary, textAlign: "center", marginTop: 16, opacity: 0.6 },
});
