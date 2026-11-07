import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import { POPPINS_BOLD, POPPINS_SEMIBOLD, LORA_REGULAR } from "@/src/theme/headerFonts";

type Breakdown = NonNullable<RiderOrderSummary["settlementBreakdown"]>;

function formatKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return "—";
  return `${km.toFixed(1)} km`;
}

function formatInr(amount: number): string {
  const n = Math.round(amount * 100) / 100;
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedInr(amount: number): string {
  const abs = Math.abs(amount);
  const body = formatInr(abs);
  if (amount > 0.49) return `+${body}`;
  if (amount < -0.49) return `−${body}`;
  return body;
}

function Row({
  label,
  value,
  emphasize,
  muted,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.row}>
      <AppText
        style={[styles.rowLabel, muted ? styles.muted : null, emphasize ? styles.emphLabel : null]}
        numberOfLines={2}
      >
        {label}
      </AppText>
      <AppText
        style={[styles.rowValue, muted ? styles.muted : null, emphasize ? styles.emphValue : null]}
      >
        {value}
      </AppText>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText style={styles.sectionTitle}>{title}</AppText>
      {children}
    </View>
  );
}

export function RiderSettlementBreakdownCard({
  breakdown,
  compact,
  initialExpanded = false,
}: {
  breakdown: Breakdown | null | undefined;
  compact?: boolean;
  initialExpanded?: boolean;
}) {
  const b = breakdown;
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const toggleExpanded = () => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded((prev) => !prev);
  };

  const showDiff = useMemo(() => {
    if (!b) return false;
    return Math.abs(b.differenceAmount) > 0.49 || b.investigationRequired;
  }, [b]);

  const isDifferenceMatched = useMemo(() => {
    if (!b) return false;
    return Math.abs(b.differenceAmount) <= 0.49 && !b.investigationRequired;
  }, [b]);

  // Adjustments check to avoid repeating duplicate finalBase / finalDistance / finalSettlement
  const hasDistinctDistance = useMemo(() => {
    if (!b) return false;
    return (
      b.finalDistanceEarning > 0.005 &&
      Math.abs(b.finalDistanceEarning - b.finalBaseEarning) >= 0.01
    );
  }, [b]);

  const hasAdjustments = useMemo(() => {
    if (!b) return false;
    return (
      hasDistinctDistance ||
      b.waitingCharge > 0.005 ||
      b.additionalEarning > 0.005 ||
      b.deductions > 0.005 ||
      Math.abs(b.cancellationAdjustment) > 0.005 ||
      Math.abs(b.finalSettlementAmount - b.finalBaseEarning) >= 0.01
    );
  }, [b, hasDistinctDistance]);

  const showAcceptedQuote = useMemo(() => {
    if (!b) return false;
    return Math.abs(b.acceptedQuoteAmount - b.dispatchOfferAmount) >= 0.01;
  }, [b]);

  const showWalletCredited = useMemo(() => {
    if (!b) return false;
    return Math.abs(b.walletCreditedAmount - b.finalSettlementAmount) >= 0.01;
  }, [b]);

  if (!b) return null;

  return (
    <View style={[styles.card, compact ? styles.cardCompact : null]}>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={toggleExpanded}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel="Settlement breakdown"
      >
        <View style={styles.headerLeft}>
          <Ionicons name="receipt-outline" size={17} color="#137243" />
          <AppText style={styles.title}>Settlement breakdown</AppText>
        </View>

        <View style={styles.headerRight}>
          {!isExpanded ? (
            <View style={styles.headerCollapsedPreview}>
              {isDifferenceMatched ? (
                <View style={styles.matchedPill}>
                  <Ionicons name="checkmark-circle" size={12} color="#137243" />
                  <AppText style={styles.matchedPillText}>Matched</AppText>
                </View>
              ) : null}
              <AppText style={styles.previewAmount}>
                {formatInr(b.finalSettlementAmount)}
              </AppText>
            </View>
          ) : null}
          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={18}
            color="#64748B"
          />
        </View>
      </TouchableOpacity>

      {isExpanded ? (
        <View style={styles.body}>
          <Section title="Original dispatch offer">
            {b.dispatchQuotedDistanceKm != null && Number.isFinite(b.dispatchQuotedDistanceKm) ? (
              <Row label="Quoted distance" value={formatKm(b.dispatchQuotedDistanceKm)} />
            ) : null}
            <Row label="Quoted rider earning" value={formatInr(b.dispatchOfferAmount)} emphasize />
            {showAcceptedQuote ? (
              <Row label="Accepted quote" value={formatInr(b.acceptedQuoteAmount)} muted />
            ) : null}
          </Section>

          <Section title="Final settlement">
            {b.finalBillableDistanceKm != null && Number.isFinite(b.finalBillableDistanceKm) ? (
              <Row label="Billable distance" value={formatKm(b.finalBillableDistanceKm)} />
            ) : null}
            {hasAdjustments ? (
              <>
                <Row label="Base earning" value={formatInr(b.finalBaseEarning)} />
                {hasDistinctDistance ? (
                  <Row label="Distance-based earning" value={formatInr(b.finalDistanceEarning)} />
                ) : null}
                {b.waitingCharge > 0.005 ? (
                  <Row label="Waiting charges" value={formatInr(b.waitingCharge)} />
                ) : null}
                {b.additionalEarning > 0.005 ? (
                  <Row label="Additional charges" value={formatInr(b.additionalEarning)} />
                ) : null}
                {b.deductions > 0.005 ? (
                  <Row label="Deductions" value={formatSignedInr(-b.deductions)} />
                ) : null}
                {Math.abs(b.cancellationAdjustment) > 0.005 ? (
                  <Row
                    label="Cancellation adjustment"
                    value={formatSignedInr(b.cancellationAdjustment)}
                  />
                ) : null}
              </>
            ) : null}
            <Row
              label="Final payable earning"
              value={formatInr(b.finalSettlementAmount)}
              emphasize
            />
            {showWalletCredited ? (
              <Row
                label="Wallet credited"
                value={formatInr(b.walletCreditedAmount)}
                muted
              />
            ) : null}
          </Section>

          {isDifferenceMatched ? (
            <View style={styles.matchedBanner}>
              <Ionicons name="checkmark-circle" size={15} color="#137243" />
              <AppText style={styles.matchedBannerText}>
                {b.differenceReasonText || "Offer amount matched"}
              </AppText>
            </View>
          ) : (
            <Section title="Difference explanation">
              {Math.abs(b.dispatchOfferAmount - b.finalSettlementAmount) >= 0.01 ? (
                <>
                  <Row label="Dispatched amount" value={formatInr(b.dispatchOfferAmount)} />
                  <Row label="Final settled amount" value={formatInr(b.finalSettlementAmount)} />
                </>
              ) : null}
              <Row
                label="Difference"
                value={
                  Math.abs(b.differenceAmount) <= 0.49
                    ? "₹0"
                    : formatSignedInr(b.differenceAmount)
                }
                emphasize
              />
              <AppText
                style={[
                  styles.reason,
                  b.investigationRequired ? styles.reasonWarn : null,
                  !showDiff && !b.investigationRequired ? styles.reasonOk : null,
                ]}
              >
                {b.differenceReasonText}
              </AppText>
            </Section>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardCompact: {
    marginTop: 8,
    paddingVertical: 10,
  },
  headerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  title: {
    fontFamily: POPPINS_BOLD,
    fontSize: 14,
    color: "#0F172A",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerCollapsedPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  matchedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#BBF7D0",
  },
  matchedPillText: {
    fontFamily: POPPINS_SEMIBOLD,
    fontSize: 10,
    color: "#137243",
  },
  previewAmount: {
    fontFamily: POPPINS_BOLD,
    fontSize: 13,
    color: "#137243",
  },
  body: {
    marginTop: 8,
  },
  section: {
    marginBottom: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
  },
  sectionTitle: {
    fontFamily: POPPINS_BOLD,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "#64748B",
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 3,
  },
  rowLabel: {
    flex: 1,
    fontFamily: LORA_REGULAR,
    fontSize: 13,
    color: "#334155",
  },
  rowValue: {
    fontFamily: POPPINS_BOLD,
    fontSize: 13,
    color: "#0F172A",
  },
  emphLabel: {
    color: "#0F172A",
  },
  emphValue: {
    color: "#137243",
    fontSize: 14,
  },
  muted: {
    color: "#94A3B8",
  },
  matchedBanner: {
    marginTop: 4,
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  matchedBannerText: {
    fontFamily: POPPINS_SEMIBOLD,
    fontSize: 12,
    color: "#137243",
  },
  reason: {
    marginTop: 6,
    fontFamily: LORA_REGULAR,
    fontSize: 13,
    lineHeight: 18,
    color: "#334155",
  },
  reasonOk: {
    color: "#137243",
  },
  reasonWarn: {
    color: "#B45309",
  },
});
