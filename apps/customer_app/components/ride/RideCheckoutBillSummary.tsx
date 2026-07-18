import { useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, StyleSheet, Pressable, Modal, ActivityIndicator } from "react-native";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { RideCheckoutCompactBill } from "@/lib/ride-fare-bill-display";

const MINT_DARK = GatiMitraColors.deepMintStart;
const DISCOUNT_COLOR = "#2563EB";

function fmtBillAmount(amount: number): string {
  return `₹${(Math.round(amount * 100) / 100).toFixed(2)}`;
}

function BillRow({
  label,
  amount,
  dashedUnderline = false,
  onLabelPress,
  emphasis = false,
  isDiscount = false,
}: {
  label: string;
  amount: number;
  dashedUnderline?: boolean;
  onLabelPress?: () => void;
  emphasis?: boolean;
  isDiscount?: boolean;
}) {
  const labelText = (
    <AppText
      style={[
        dashedUnderline ? styles.dashedLabelText : styles.plainLabelText,
        emphasis && styles.emphasisLabel,
        isDiscount && styles.discountLabel,
      ]}
    >
      {label}
    </AppText>
  );

  const labelBlock = dashedUnderline ? (
    <View style={styles.dashedLabelWrap}>{labelText}</View>
  ) : (
    labelText
  );

  const valueText = (
    <AppText
      style={[
        styles.lineValue,
        emphasis && styles.emphasisValue,
        isDiscount && styles.discountValue,
      ]}
    >
      {isDiscount ? `-${fmtBillAmount(amount)}` : fmtBillAmount(amount)}
    </AppText>
  );

  return (
    <View style={[styles.lineRow, emphasis && styles.lineRowEmphasis]}>
      <View style={styles.lineLeft}>
        {onLabelPress ? (
          <Pressable onPress={onLabelPress} hitSlop={8} accessibilityRole="button">
            {labelBlock}
          </Pressable>
        ) : (
          labelBlock
        )}
      </View>
      {valueText}
    </View>
  );
}

function RideGstBreakdownModal({
  visible,
  onClose,
  gstTotal,
  gstLines,
}: {
  visible: boolean;
  onClose: () => void;
  gstTotal: number;
  gstLines: RideCheckoutCompactBill["gstLines"];
}) {
  const lines = useMemo(() => {
    if (gstLines.length > 0) return gstLines;
    if (gstTotal > 0.005) {
      return [{ key: "gst", label: "GST", amount: gstTotal }];
    }
    return [];
  }, [gstLines, gstTotal]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalCard}>
          <AppText style={styles.modalDisclaimer}>
            GatiMitra has no role to play in taxes levied by the govt.
          </AppText>

          {lines.map((row) => (
            <View key={row.key} style={styles.modalLine}>
              <AppText style={styles.modalLineLabel}>{row.label}</AppText>
              <AppText style={styles.modalLineValue}>{fmtBillAmount(row.amount)}</AppText>
            </View>
          ))}

          <View style={styles.modalDivider} />

          <View style={styles.modalLine}>
            <AppText style={styles.modalTotalLabel}>Total</AppText>
            <AppText style={styles.modalTotalValue}>{fmtBillAmount(gstTotal)}</AppText>
          </View>

          <Pressable onPress={onClose} style={styles.modalOkBtn} hitSlop={8}>
            <AppText style={styles.modalOkText}>OKAY</AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export type RideCheckoutBillSummaryProps = {
  compactBill: RideCheckoutCompactBill | null;
  loading?: boolean;
  gatiCashApplyAmount?: number;
};

export function RideCheckoutBillSummary({
  compactBill,
  loading = false,
  gatiCashApplyAmount = 0,
}: RideCheckoutBillSummaryProps) {
  const [gstModalVisible, setGstModalVisible] = useState(false);

  if (loading && !compactBill) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={MINT_DARK} />
        <AppText style={styles.loadingText}>Calculating fare…</AppText>
      </View>
    );
  }

  if (!compactBill) return null;

  const showGstRow = compactBill.gstTotal > 0.005 || compactBill.gstLines.length > 0;

  return (
    <>
      <BillRow label="Ride fare" amount={compactBill.rideFare} />

      {compactBill.bookingFee > 0.005 ? (
        <BillRow label="Booking fee" amount={compactBill.bookingFee} />
      ) : null}

      {compactBill.extraLines.map((row) => (
        <BillRow key={row.label} label={row.label} amount={row.amount} />
      ))}

      {showGstRow ? (
        <BillRow
          label="GST (govt. taxes)"
          amount={compactBill.gstTotal}
          dashedUnderline
          onLabelPress={() => setGstModalVisible(true)}
        />
      ) : null}

      <View style={styles.sectionDivider} />

      <BillRow label="Grand Total" amount={compactBill.grandTotal} emphasis />

      {compactBill.discounts.map((row) => (
        <BillRow key={row.label} label={row.label} amount={row.amount} isDiscount />
      ))}

      {gatiCashApplyAmount > 0.005 ? (
        <BillRow label="Using GatiCash" amount={gatiCashApplyAmount} isDiscount />
      ) : null}

      <RideGstBreakdownModal
        visible={gstModalVisible}
        onClose={() => setGstModalVisible(false)}
        gstTotal={compactBill.gstTotal}
        gstLines={compactBill.gstLines}
      />
    </>
  );
}

const styles = StyleSheet.create({
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  loadingText: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    fontWeight: "600",
  },
  lineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 4,
  },
  lineRowEmphasis: {
    paddingVertical: 6,
  },
  lineLeft: {
    flex: 1,
    minWidth: 0,
  },
  dashedLabelWrap: {
    alignSelf: "flex-start",
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderColor: "#94A3B8",
    paddingBottom: 1,
  },
  dashedLabelText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
  },
  plainLabelText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
  emphasisLabel: {
    color: GatiMitraColors.textPrimary,
    fontWeight: "800",
  },
  lineValue: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    flexShrink: 0,
  },
  emphasisValue: {
    fontWeight: "800",
    fontSize: 15,
  },
  discountLabel: {
    color: DISCOUNT_COLOR,
  },
  discountValue: {
    color: DISCOUNT_COLOR,
    fontWeight: "700",
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: GatiMitraColors.border,
    marginVertical: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 8,
  },
  modalDisclaimer: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    lineHeight: 19,
    marginBottom: 14,
  },
  modalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 5,
  },
  modalLineLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
  },
  modalLineValue: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    flexShrink: 0,
  },
  modalDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginVertical: 10,
  },
  modalTotalLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
  },
  modalTotalValue: {
    fontSize: 16,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
  },
  modalOkBtn: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 4,
  },
  modalOkText: {
    fontSize: 15,
    fontWeight: "800",
    color: MINT_DARK,
    letterSpacing: 0.5,
  },
});
