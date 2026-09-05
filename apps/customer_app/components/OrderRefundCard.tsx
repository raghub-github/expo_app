import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";

const GREEN = "#059669";
const GREEN_SOFT = "#D1FAE5";
const MUTED = "#6B7280";
const CARD_BORDER = "#E5E7EB";

export type OrderRefundTimelineStep = {
  key: string;
  label: string;
  at: string | null;
};

export type OrderRefundSlab = {
  amount: number;
  reference: string | null;
  status: string | null;
  initiatedAt: string | null;
  completedAt: string | null;
};

export type OrderRefundCardData = {
  status: string | null;
  amount: number | null;
  reference: string | null;
  references?: string[];
  slabs?: OrderRefundSlab[];
  walletReference?: string | null;
  gatewayReference?: string | null;
  originalGatiCashTxnId?: string | null;
  route: string | null;
  walletAmount: number | null;
  gatewayAmount: number | null;
  initiatedAt: string | null;
  processedAt: string | null;
  completedAt: string | null;
  timeline: OrderRefundTimelineStep[];
};

function formatMoney(n: number): string {
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatRefundWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function methodsLine(refund: OrderRefundCardData): string | null {
  const parts: string[] = [];
  if ((refund.walletAmount ?? 0) > 0.005) {
    parts.push(`GatiCash ${formatMoney(refund.walletAmount!)}`);
  }
  if ((refund.gatewayAmount ?? 0) > 0.005) {
    parts.push(`Bank/UPI ${formatMoney(refund.gatewayAmount!)}`);
  }
  if (parts.length) return parts.join(" · ");
  const route = (refund.route ?? "").toUpperCase();
  if (route === "WALLET") return "Refunded to GatiCash";
  if (route === "RAZORPAY") return "Refunded to original payment method";
  if (route === "MIXED") return "Refunded to GatiCash + original payment method";
  return null;
}

type RefundDisplayKind = "gateway" | "wallet" | "mixed" | "unknown";

function detectRefundKind(refund: OrderRefundCardData): RefundDisplayKind {
  const walletAmt = refund.walletAmount ?? 0;
  const gatewayAmt = refund.gatewayAmount ?? 0;
  const route = (refund.route ?? "").toUpperCase();
  const hasWalletRef = Boolean(refund.walletReference?.trim());
  const hasGatewayRef = Boolean(refund.gatewayReference?.trim());

  if (
    route === "MIXED" ||
    (walletAmt > 0.005 && gatewayAmt > 0.005) ||
    (hasWalletRef && hasGatewayRef)
  ) {
    return "mixed";
  }
  if (route === "WALLET" || (walletAmt > 0.005 && gatewayAmt <= 0.005)) {
    return "wallet";
  }
  if (
    route === "RAZORPAY" ||
    route === "GATEWAY" ||
    (gatewayAmt > 0.005 && walletAmt <= 0.005)
  ) {
    return "gateway";
  }
  if (hasWalletRef && !hasGatewayRef) return "wallet";
  if (hasGatewayRef && !hasWalletRef) return "gateway";
  return "unknown";
}

function refundInfoMessage(kind: RefundDisplayKind, completed: boolean): string {
  if (kind === "wallet") {
    return completed
      ? "Your refund has been successfully credited back to your GatiCash Wallet and is available for immediate use. If you notice any discrepancy, please contact Support and share your Refund Reference Number (RRN)."
      : "Your refund is being credited to your GatiCash Wallet. Once complete, it will be available for immediate use. If you notice any discrepancy, please contact Support and share your Refund Reference Number (RRN).";
  }
  if (kind === "mixed") {
    return completed
      ? "Your refund has been processed according to your original payment sources. The Wallet portion has been credited back to your GatiCash Wallet instantly, and the Gateway portion has been initiated to your original payment method, which may take 3–5 working days to reflect. Please use your Refund Reference Number (RRN) when contacting Support."
      : "Your refund is being processed according to your original payment sources. The Wallet portion credits to GatiCash instantly; the Gateway portion may take 3–5 working days. Please use your Refund Reference Number (RRN) when contacting Support.";
  }
  if (kind === "gateway") {
    return completed
      ? "Your refund has been processed to your original payment method. Depending on your bank or payment provider, it may take 3–5 working days to reflect in your account. If you do not receive the refund within this period, please contact Support and share your Refund Reference Number (RRN)."
      : "Your refund to the original payment method is being processed. Bank/UPI refunds can take 3–5 working days. If you do not receive it within this period, please contact Support and share your Refund Reference Number (RRN).";
  }
  return completed
    ? "Your refund should reflect in your account by now. In case of any issues, please contact Support and share your Refund Reference Number (RRN)."
    : "Your refund is being processed. Bank/UPI refunds can take a few business days.";
}

type RefRow = { label: string; value: string };

/** Customer card shows every unique refund RRN across slabs (never RFND-{id}). */
function buildReferenceRows(refund: OrderRefundCardData): RefRow[] {
  const slabs = refund.slabs?.filter((s) => Boolean(s.reference?.trim())) ?? [];
  if (slabs.length > 1) {
    return slabs.map((s, i) => ({
      label: `Refund reference number (RRN) ${i + 1} · ${formatMoney(s.amount)}`,
      value: s.reference!.trim(),
    }));
  }

  const fromList = (refund.references ?? [])
    .map((r) => r.trim())
    .filter((r) => r && !/^RFND-\d+$/i.test(r));
  const unique = [...new Set(fromList)];
  if (unique.length > 1) {
    return unique.map((value, i) => ({
      label: `Refund reference number (RRN) ${i + 1}`,
      value,
    }));
  }

  const raw =
    unique[0] ||
    refund.reference?.trim() ||
    refund.walletReference?.trim() ||
    refund.gatewayReference?.trim() ||
    null;
  if (!raw) return [];
  if (/^RFND-\d+$/i.test(raw)) return [];
  return [{ label: "Refund reference number (RRN)", value: raw }];
}

export function OrderRefundCard({ refund }: { refund: OrderRefundCardData }) {
  const [expanded, setExpanded] = useState(true);
  const amount = refund.amount != null && Number.isFinite(refund.amount) ? refund.amount : 0;
  const completed =
    (refund.status ?? "").toLowerCase() === "completed" ||
    (refund.status ?? "").toLowerCase() === "refunded";
  const title = completed
    ? `Refund of ${formatMoney(amount)} sent`
    : `Refund of ${formatMoney(amount)} in progress`;
  const slabCount = refund.slabs?.length ?? 0;
  const subtitle = completed
    ? `Refund completed on ${formatRefundWhen(refund.completedAt ?? refund.processedAt)}${
        slabCount > 1 ? ` · ${slabCount} refunds` : ""
      }`
    : refund.processedAt
      ? `Refund processed on ${formatRefundWhen(refund.processedAt)}`
      : refund.initiatedAt
        ? `Refund initiated on ${formatRefundWhen(refund.initiatedAt)}`
        : null;
  const methodHint = useMemo(() => methodsLine(refund), [refund]);
  const refundKind = useMemo(() => detectRefundKind(refund), [refund]);
  const referenceRows = useMemo(() => buildReferenceRows(refund), [refund]);
  const infoMessage = useMemo(
    () => refundInfoMessage(refundKind, completed),
    [refundKind, completed]
  );
  const timeline =
    refund.timeline?.length > 0
      ? refund.timeline
      : [
          {
            key: "initiated",
            label: `Refund initiated for ${formatMoney(amount)}`,
            at: refund.initiatedAt,
          },
          { key: "processed", label: "Refund processed", at: refund.processedAt },
          ...(completed
            ? [{ key: "completed", label: "Refund completed", at: refund.completedAt }]
            : []),
        ];

  const allStepsDone =
    completed ||
    (timeline.length > 0 && timeline.every((s) => Boolean(s.at)));

  const onCopy = async (value: string, label: string) => {
    const ref = value.trim();
    if (!ref) return;
    try {
      await Clipboard.setStringAsync(ref);
      Alert.alert("Copied", `${label} copied to clipboard.`);
    } catch {
      Alert.alert("Copy failed", "Could not copy refund reference.");
    }
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.85}
      >
        <View style={[styles.headerIcon, allStepsDone && styles.headerIconSuccess]}>
          <Ionicons
            name="checkmark-circle"
            size={28}
            color={allStepsDone ? GREEN : "#6B7280"}
          />
        </View>
        <View style={styles.headerText}>
          <AppText style={styles.title}>{title}</AppText>
          {!!subtitle && <AppText style={styles.subtitle}>{subtitle}</AppText>}
          {!!methodHint && <AppText style={styles.methodHint}>{methodHint}</AppText>}
        </View>
        <Ionicons
          name={expanded ? "chevron-down" : "chevron-forward"}
          size={18}
          color="#111827"
        />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.body}>
          <View style={styles.timeline}>
            {timeline.map((step, idx) => {
              const isLast = idx === timeline.length - 1;
              const stepDone = allStepsDone || Boolean(step.at);
              return (
                <View key={`${step.key}-${idx}`} style={styles.stepRow}>
                  <View style={styles.rail}>
                    <View style={[styles.dot, stepDone ? styles.dotDone : styles.dotPending]}>
                      <Ionicons
                        name="checkmark"
                        size={12}
                        color={stepDone ? "#fff" : MUTED}
                      />
                    </View>
                    {!isLast ? (
                      <View
                        style={[styles.railLine, stepDone ? styles.railLineDone : null]}
                      />
                    ) : null}
                  </View>
                  <View style={styles.stepText}>
                    <AppText
                      style={[styles.stepLabel, stepDone ? styles.stepLabelDone : null]}
                    >
                      {step.label}
                    </AppText>
                    {!!step.at && (
                      <AppText style={styles.stepAt}>{formatRefundWhen(step.at)}</AppText>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={16} color={MUTED} />
            <AppText style={styles.infoText}>{infoMessage}</AppText>
          </View>

          {referenceRows.map((row) => (
            <View key={`${row.label}-${row.value}`} style={styles.rrnBox}>
              <View style={{ flex: 1 }}>
                <AppText style={styles.rrnLabel}>{row.label}</AppText>
                <AppText style={styles.rrnValue} selectable>
                  {row.value}
                </AppText>
              </View>
              <Pressable
                onPress={() => onCopy(row.value, row.label)}
                hitSlop={10}
                style={styles.copyBtn}
              >
                <Ionicons name="copy-outline" size={18} color="#374151" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    marginBottom: 12,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconSuccess: {
    backgroundColor: GREEN_SOFT,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: "700", color: "#111827" },
  subtitle: { marginTop: 2, fontSize: 12, color: MUTED },
  methodHint: { marginTop: 4, fontSize: 11, color: GREEN, fontWeight: "600" },
  body: { paddingHorizontal: 14, paddingBottom: 14 },
  timeline: { marginTop: 4, marginBottom: 10 },
  stepRow: { flexDirection: "row", minHeight: 44 },
  rail: { width: 22, alignItems: "center" },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  dotDone: {
    backgroundColor: GREEN,
  },
  dotPending: {
    backgroundColor: "#E5E7EB",
  },
  railLine: {
    flex: 1,
    width: 2,
    backgroundColor: "#E5E7EB",
    marginVertical: 2,
  },
  railLineDone: {
    backgroundColor: GREEN,
  },
  stepText: { flex: 1, paddingLeft: 8, paddingBottom: 10 },
  stepLabel: { fontSize: 13, fontWeight: "600", color: "#111827" },
  stepLabelDone: { color: GREEN },
  stepAt: { marginTop: 2, fontSize: 11, color: MUTED },
  infoRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginBottom: 12 },
  infoText: { flex: 1, fontSize: 12, color: MUTED, lineHeight: 17 },
  rrnBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 8,
  },
  rrnLabel: { fontSize: 11, color: MUTED, marginBottom: 2 },
  rrnValue: { fontSize: 14, fontWeight: "700", color: "#111827" },
  copyBtn: { padding: 4 },
});
