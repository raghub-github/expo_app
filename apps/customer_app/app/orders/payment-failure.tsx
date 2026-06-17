/**
 * Payment / order confirmation failed.
 *
 * Primary recovery: back to checkout with cart preserved.
 * Reassurance about auto-refund when money was debited.
 */

import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

const PAD = 20;
const PURPLE = "#7C3AED";
const PURPLE_DARK = "#6D28D9";
const GREEN = GatiMitraColors.emerald;

function classifyError(
  message: string,
  code: string | null
): "PAYMENT_DECLINED" | "TIMEOUT" | "NETWORK" | "UNKNOWN" {
  const m = message.toLowerCase();
  if (
    m.includes("declined") ||
    m.includes("insufficient") ||
    m.includes("authentication") ||
    m.includes("limit")
  ) {
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
  const message =
    (Array.isArray(msgParam) ? msgParam[0] : msgParam) ??
    "We couldn't create your order at the moment. Please try again. If your account was charged, the amount will be refunded.";
  const title =
    (Array.isArray(titleParam) ? titleParam[0] : titleParam) ?? "Payment couldn't be completed";
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

  const goToCheckout = () => router.replace("/checkout");

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={12}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back" size={22} color={GatiMitraColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconWrap}>
          <View style={styles.iconShadow} />
          <View style={styles.iconCircle}>
            <Ionicons name="close" size={42} color="#fff" />
          </View>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{message}</Text>

        <View style={styles.reassureCard}>
          <View style={styles.reassureIconWrap}>
            <Ionicons name="shield-checkmark" size={22} color={GREEN} />
          </View>
          <View style={styles.reassureBody}>
            <Text style={styles.reassureHeading}>No worries! We've got you.</Text>
            <Text style={styles.reassureText}>
              If money was debited, it will be <Text style={styles.reassureBold}>auto-refunded</Text>{" "}
              within <Text style={styles.reassureBold}>5–7 business days</Text>. No action is needed
              from your side.
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.primary} onPress={goToCheckout} activeOpacity={0.9}>
          <Ionicons name="card-outline" size={20} color="#fff" />
          <Text style={styles.primaryText}>{primaryLabel}</Text>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <View style={styles.infoIconWrap}>
            <Ionicons name="information" size={16} color={PURPLE} />
          </View>
          <Text style={styles.infoText}>
            You'll go back to checkout — your cart and address are saved. Choose a different payment
            option like UPI, card, netbanking, or wallet.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.secondary}
          onPress={() => router.replace("/(tabs)/orders")}
          activeOpacity={0.88}
        >
          <Ionicons name="receipt-outline" size={18} color={GREEN} />
          <Text style={styles.secondaryText}>View My Orders</Text>
        </TouchableOpacity>

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>or</Text>
          <View style={styles.orLine} />
        </View>

        <TouchableOpacity
          style={styles.homeLink}
          onPress={() => router.replace("/(tabs)/")}
          activeOpacity={0.88}
        >
          <Ionicons name="home-outline" size={18} color={PURPLE} />
          <Text style={styles.homeLinkText}>Back to Home</Text>
        </TouchableOpacity>

        {code ? <Text style={styles.errorCode}>Reference: {code}</Text> : null}
      </ScrollView>

      <View style={styles.footerDecor} pointerEvents="none">
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />
        <View style={styles.decorWave} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: PAD,
    paddingBottom: 12,
    backgroundColor: "#fff",
    zIndex: 2,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  headerSpacer: { width: 40 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: PAD, paddingTop: 8 },
  iconWrap: {
    alignItems: "center",
    marginBottom: 20,
    marginTop: 8,
  },
  iconShadow: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#FECDD3",
    top: 8,
    opacity: 0.55,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF4444",
    shadowColor: "#FCA5A5",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 10,
    lineHeight: 30,
  },
  body: {
    fontSize: 15,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  reassureCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#ECFDF5",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  reassureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#D1FAE5",
    alignItems: "center",
    justifyContent: "center",
  },
  reassureBody: { flex: 1 },
  reassureHeading: {
    fontSize: 15,
    fontWeight: "800",
    color: "#047857",
    marginBottom: 6,
  },
  reassureText: { fontSize: 13, color: "#065F46", lineHeight: 20 },
  reassureBold: { fontWeight: "800" },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: PURPLE,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 14,
    shadowColor: PURPLE_DARK,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryText: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "700", textAlign: "center" },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#F5F3FF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#EDE9FE",
  },
  infoIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: "#5B21B6",
    lineHeight: 19,
  },
  secondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: GREEN,
    borderRadius: 16,
    paddingVertical: 15,
    backgroundColor: "#fff",
    marginBottom: 6,
  },
  secondaryText: { color: GREEN, fontSize: 15, fontWeight: "700" },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 14,
  },
  orLine: { flex: 1, height: 1, backgroundColor: GatiMitraColors.border },
  orText: { fontSize: 13, color: GatiMitraColors.textSecondary, fontWeight: "500" },
  homeLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
  },
  homeLinkText: { color: PURPLE, fontSize: 15, fontWeight: "700" },
  errorCode: {
    fontSize: 11,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    marginTop: 20,
    opacity: 0.55,
  },
  footerDecor: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 100,
    overflow: "hidden",
    zIndex: 0,
  },
  decorCircle1: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F5F3FF",
    bottom: 20,
    left: -20,
    opacity: 0.7,
  },
  decorCircle2: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ECFDF5",
    bottom: 40,
    right: 24,
    opacity: 0.8,
  },
  decorWave: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 36,
    backgroundColor: "#F8FAF9",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    opacity: 0.9,
  },
});
