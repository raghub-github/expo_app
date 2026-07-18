import { View, TouchableOpacity, StyleSheet, Image, ActivityIndicator, ScrollView } from "react-native";
import { AppText } from "@/components/AppText";

import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { resolveRideImage } from "@/features/ride/rideOptionAssets";
import type { RideQuoteBillingLine } from "@/lib/ride-quote-display";

export type RideVehicleFareDetailsSheetProps = {
  visible: boolean;
  onClose: () => void;
  vehicleName: string;
  imageKey: string;
  fare: number | null;
  billingLines?: RideQuoteBillingLine[];
  rateCardSummary?: string | null;
  waitingChargeNote?: string | null;
  loading?: boolean;
};

function formatFareAmount(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  return `₹${Number.isInteger(value) ? value : value.toFixed(1)}`;
}

export function RideVehicleFareDetailsSheet({
  visible,
  onClose,
  vehicleName,
  imageKey,
  fare,
  billingLines = [],
  rateCardSummary,
  waitingChargeNote,
  loading = false,
}: RideVehicleFareDetailsSheetProps) {
  const fareLabel = formatFareAmount(fare);
  const showBreakdown = billingLines.length > 0;

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.72}>
      <View style={styles.handle} />

      <View style={styles.headerRow}>
        {resolveRideImage(imageKey) ? (
          <Image source={resolveRideImage(imageKey)!} style={styles.headerIcon} resizeMode="contain" />
        ) : null}
        <AppText style={styles.title}>{vehicleName} Fare Details</AppText>
      </View>

      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.totalRow}>
          <AppText style={styles.totalLabel}>Total Estimated fare price including taxes.</AppText>
          {loading ? (
            <ActivityIndicator size="small" color="#111827" />
          ) : (
            <AppText style={styles.totalFare}>{fareLabel}*</AppText>
          )}
        </View>

        <View style={styles.divider} />

        {showBreakdown ? (
          billingLines.map((line) => (
            <View key={`${line.label}-${line.amount}`} style={styles.lineRow}>
              <AppText style={styles.lineLabel}>{line.label}</AppText>
              <AppText style={styles.lineValue}>{loading ? "…" : formatFareAmount(line.amount)}</AppText>
            </View>
          ))
        ) : (
          <View style={styles.lineRow}>
            <AppText style={styles.lineLabel}>Ride Fare</AppText>
            <AppText style={styles.lineValue}>{loading ? "…" : fareLabel}</AppText>
          </View>
        )}

        {showBreakdown ? (
          <View style={[styles.lineRow, styles.totalBreakdownRow]}>
            <AppText style={styles.totalBreakdownLabel}>Total payable</AppText>
            <AppText style={styles.totalBreakdownValue}>{loading ? "…" : fareLabel}</AppText>
          </View>
        ) : null}

        <AppText style={styles.disclaimer}>
          *Price may vary based on final pickup or drop location, time taken, final route and toll area.
        </AppText>

        {rateCardSummary ? (
          <View style={styles.infoBlock}>
            <AppText style={styles.infoHeading}>Rate Card</AppText>
            <AppText style={styles.infoText}>{rateCardSummary}</AppText>
          </View>
        ) : null}

        {waitingChargeNote ? (
          <View style={styles.infoBlock}>
            <AppText style={styles.infoHeading}>Waiting Charges</AppText>
            <AppText style={styles.infoText}>{waitingChargeNote}</AppText>
          </View>
        ) : null}
      </ScrollView>

      <TouchableOpacity style={styles.gotItBtn} onPress={onClose} activeOpacity={0.85}>
        <AppText style={styles.gotItText}>Got it</AppText>
      </TouchableOpacity>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  headerIcon: {
    width: 36,
    height: 36,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  bodyScroll: {
    flexGrow: 0,
    maxHeight: 360,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  totalLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    lineHeight: 20,
  },
  totalFare: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginBottom: 14,
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  lineLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  lineValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  totalBreakdownRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  totalBreakdownLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  totalBreakdownValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  disclaimer: {
    fontSize: 12,
    lineHeight: 18,
    color: "#6B7280",
    marginBottom: 16,
  },
  infoBlock: {
    marginBottom: 14,
  },
  infoHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#4B5563",
  },
  gotItBtn: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  gotItText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
});
