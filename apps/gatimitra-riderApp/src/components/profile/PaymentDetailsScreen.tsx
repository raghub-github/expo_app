// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useOnboardingPaymentDetails } from "@/src/hooks/usePayment";
import { formatRupeeFromPaise } from "@/src/hooks/useOnboardingFeeConfig";
import { colors } from "@/src/theme";

const TEAL = colors.primary[600];
const TEAL_LIGHT = colors.primary[50];

type StatusTone = "success" | "warning" | "danger" | "info";

function statusMeta(status?: string): {
  label: string;
  tone: StatusTone;
  icon: keyof typeof Ionicons.glyphMap;
} {
  switch ((status ?? "").toLowerCase()) {
    case "completed":
      return { label: "Paid", tone: "success", icon: "checkmark-circle" };
    case "refunded":
      return { label: "Refunded", tone: "info", icon: "arrow-undo-circle" };
    case "partially_refunded":
      return { label: "Partially refunded", tone: "info", icon: "arrow-undo-circle" };
    case "pending":
      return { label: "Pending", tone: "warning", icon: "time" };
    case "failed":
      return { label: "Failed", tone: "danger", icon: "close-circle" };
    default:
      return { label: status ?? "—", tone: "warning", icon: "help-circle" };
  }
}

const TONE_COLORS: Record<StatusTone, { fg: string; bg: string }> = {
  success: { fg: "#166534", bg: "#DCFCE7" },
  warning: { fg: "#92400E", bg: "#FEF3C7" },
  danger: { fg: "#991B1B", bg: "#FEE2E2" },
  info: { fg: "#1E40AF", bg: "#DBEAFE" },
};

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.rowLabelStrong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowValueStrong]}>{value}</Text>
    </View>
  );
}

export function PaymentDetailsScreen() {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const riderId = session?.riderId ?? null;
  const { data, isLoading, isError, refetch, isRefetching } = useOnboardingPaymentDetails(riderId);

  const st = statusMeta(data?.status);
  const tone = TONE_COLORS[st.tone];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t("common.back", "Back")}
        >
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>
          {t("profile.paymentDetails.title", "Onboarding Payment")}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={TEAL} />
        }
      >
        {isLoading && !data ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={TEAL} />
          </View>
        ) : isError ? (
          <View style={styles.centerBox}>
            <Ionicons name="cloud-offline-outline" size={40} color="#CBD5E1" />
            <Text style={styles.emptyText}>
              {t("profile.paymentDetails.error", "Could not load payment details.")}
            </Text>
            <Pressable style={styles.retryBtn} onPress={() => refetch()}>
              <Text style={styles.retryText}>{t("common.retry", "Retry")}</Text>
            </Pressable>
          </View>
        ) : !data?.hasPayment ? (
          <View style={styles.centerBox}>
            <Ionicons name="receipt-outline" size={44} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>
              {t("profile.paymentDetails.noneTitle", "No payment yet")}
            </Text>
            <Text style={styles.emptyText}>
              {t(
                "profile.paymentDetails.noneSub",
                "Your onboarding fee payment will appear here once completed.",
              )}
            </Text>
          </View>
        ) : (
          <>
            {/* Hero: amount + status */}
            <View style={styles.heroCard}>
              <Text style={styles.heroLabel}>
                {t("profile.paymentDetails.feeLabel", "Onboarding fee")}
              </Text>
              <Text style={styles.heroAmount}>₹{formatRupeeFromPaise(data.amountPaise ?? 0)}</Text>
              <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
                <Ionicons name={st.icon} size={14} color={tone.fg} />
                <Text style={[styles.statusText, { color: tone.fg }]}>{st.label}</Text>
              </View>
            </View>

            {/* Breakdown */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {t("profile.paymentDetails.breakdown", "Amount breakdown")}
              </Text>
              {data.subtotalPaise != null ? (
                <Row
                  label={t("profile.paymentDetails.subtotal", "Onboarding fee")}
                  value={`₹${formatRupeeFromPaise(data.subtotalPaise)}`}
                />
              ) : null}
              {data.gstAmountPaise != null && data.gstAmountPaise > 0 ? (
                <Row
                  label={`${t("profile.paymentDetails.gst", "GST")}${
                    data.gstPercentApplied ? ` (${data.gstPercentApplied}%)` : ""
                  }`}
                  value={`₹${formatRupeeFromPaise(data.gstAmountPaise)}`}
                />
              ) : null}
              <View style={styles.divider} />
              <Row
                label={t("profile.paymentDetails.total", "Total paid")}
                value={`₹${formatRupeeFromPaise(data.amountPaise ?? 0)}`}
                strong
              />
            </View>

            {/* Transaction meta */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {t("profile.paymentDetails.transaction", "Transaction")}
              </Text>
              <Row
                label={t("profile.paymentDetails.method", "Method")}
                value={(data.provider ?? "razorpay").toUpperCase()}
              />
              {data.razorpayPaymentId ? (
                <Row
                  label={t("profile.paymentDetails.paymentId", "Payment ID")}
                  value={data.razorpayPaymentId}
                />
              ) : null}
              {data.razorpayOrderId ? (
                <Row
                  label={t("profile.paymentDetails.orderId", "Order ID")}
                  value={data.razorpayOrderId}
                />
              ) : null}
              {data.refId ? (
                <Row label={t("profile.paymentDetails.reference", "Reference")} value={data.refId} />
              ) : null}
              <Row
                label={t("profile.paymentDetails.date", "Date")}
                value={formatDate(data.paidAt ?? data.createdAt)}
              />
            </View>

            {/* Refund block (only when present) */}
            {data.refund ? (
              <View style={[styles.card, styles.refundCard]}>
                <View style={styles.refundHeader}>
                  <Ionicons name="arrow-undo-circle" size={18} color="#1E40AF" />
                  <Text style={styles.refundTitle}>
                    {data.refund.partial
                      ? t("profile.paymentDetails.refundPartial", "Partial refund")
                      : t("profile.paymentDetails.refund", "Refund")}
                  </Text>
                </View>
                {data.refund.amountPaise != null ? (
                  <Row
                    label={t("profile.paymentDetails.refundAmount", "Refunded")}
                    value={`₹${formatRupeeFromPaise(data.refund.amountPaise)}`}
                  />
                ) : null}
                {data.refund.status ? (
                  <Row
                    label={t("profile.paymentDetails.refundStatus", "Status")}
                    value={data.refund.status}
                  />
                ) : null}
                {data.refund.refundId ? (
                  <Row
                    label={t("profile.paymentDetails.refundId", "Refund ID")}
                    value={data.refund.refundId}
                  />
                ) : null}
                {data.refund.at ? (
                  <Row
                    label={t("profile.paymentDetails.refundDate", "Refunded on")}
                    value={formatDate(data.refund.at)}
                  />
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#0F172A" },
  scroll: { padding: 16, gap: 14, paddingBottom: 40 },
  centerBox: { alignItems: "center", justifyContent: "center", paddingVertical: 72, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#334155", marginTop: 4 },
  emptyText: { fontSize: 13, color: "#64748B", textAlign: "center", paddingHorizontal: 24, lineHeight: 19 },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
    backgroundColor: TEAL,
    borderRadius: 10,
  },
  retryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 22,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#EEF2F6",
  },
  heroLabel: { fontSize: 13, color: "#64748B", fontWeight: "500" },
  heroAmount: { fontSize: 40, fontWeight: "800", color: "#0F172A", letterSpacing: -1 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 2,
  },
  statusText: { fontSize: 13, fontWeight: "700" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#EEF2F6",
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#0F172A", marginBottom: 2 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rowLabel: { fontSize: 13.5, color: "#64748B", flexShrink: 1 },
  rowLabelStrong: { fontWeight: "700", color: "#0F172A" },
  rowValue: { fontSize: 13.5, color: "#334155", fontWeight: "600", textAlign: "right", flexShrink: 1 },
  rowValueStrong: { fontSize: 16, fontWeight: "800", color: TEAL },
  divider: { height: 1, backgroundColor: "#EEF2F6" },
  refundCard: { borderColor: "#DBEAFE", backgroundColor: "#F8FAFF" },
  refundHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  refundTitle: { fontSize: 14, fontWeight: "700", color: "#1E40AF" },
});
