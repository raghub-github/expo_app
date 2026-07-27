import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatRtoOtpDisplay } from "@/lib/orderOtps";
import { GatiMitraMerchant, FONT_SECONDARY } from "@/constants/theme";

type Props = {
  orderStatus: string;
  pickupOtp: string | null | undefined;
  rtoOtp: string | null | undefined;
};

function OtpCell({
  label,
  value,
  masked,
  full,
}: {
  label: string;
  value: string;
  masked?: boolean;
  full?: boolean;
}) {
  return (
    <View style={[styles.cell, full && styles.cellFull]}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellValue, masked && styles.cellValueMasked]}>{value}</Text>
    </View>
  );
}

export function OrderDetailOtpRow({ orderStatus, pickupOtp, rtoOtp }: Props) {
  const pickup = (pickupOtp ?? "").trim();
  const rto = (rtoOtp ?? "").trim();
  if (!pickup && !rto) return null;

  const isRto = orderStatus.toUpperCase() === "RTO";
  const rtoDisplay = formatRtoOtpDisplay(orderStatus, rto || null);
  const showBoth = Boolean(pickup && rto && rtoDisplay);

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Ionicons name="key-outline" size={14} color="#64748B" />
        <Text style={styles.title}>Order OTPs</Text>
      </View>
      <View style={styles.row}>
        {pickup ? (
          <OtpCell label="Pickup OTP" value={pickup} full={!showBoth} />
        ) : null}
        {showBoth ? <View style={styles.divider} /> : null}
        {rto && rtoDisplay ? (
          <OtpCell label="RTO OTP" value={rtoDisplay} masked={!isRto} full={!showBoth} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    overflow: "hidden",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  cell: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 64,
  },
  cellFull: {
    flex: 1,
    width: "100%",
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "#CBD5E1",
    marginVertical: 8,
  },
  cellLabel: {
    fontSize: FONT_SECONDARY,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  cellValue: {
    fontSize: 20,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    letterSpacing: 3,
    fontVariant: ["tabular-nums"],
  },
  cellValueMasked: {
    color: "#94A3B8",
    letterSpacing: 4,
  },
});
