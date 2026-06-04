/**
 * Pre-book tip sheet — shown after "Book ride" before confirm pickup.
 * Base fare stays fixed; selected amount is sent as customer_tip_amount.
 */

import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { RIDE_TIP_STEPS } from "@/lib/ride-tip-amounts";

export type RidePreBookTipSheetProps = {
  visible: boolean;
  baseFare: number;
  rideName: string;
  pickupLabel?: string;
  dropLabel?: string;
  onConfirm: (tipAmount: number) => void;
  onClose: () => void;
  onTripDetails?: () => void;
};

export function RidePreBookTipSheet({
  visible,
  baseFare,
  rideName,
  pickupLabel,
  dropLabel,
  onConfirm,
  onClose,
  onTripDetails,
}: RidePreBookTipSheetProps) {
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const [tripDetailsVisible, setTripDetailsVisible] = useState(false);

  const tipAmount = RIDE_TIP_STEPS[stepIndex] ?? 0;
  const totalFare = baseFare + tipAmount;
  const maxStepIndex = RIDE_TIP_STEPS.length - 1;

  const thumbLeft = useMemo(() => {
    if (trackWidth <= 0) return 0;
    const ratio = stepIndex / maxStepIndex;
    return ratio * trackWidth;
  }, [stepIndex, trackWidth, maxStepIndex]);

  const handleTrackLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const openTripDetails = useCallback(() => {
    if (onTripDetails) {
      onTripDetails();
      return;
    }
    setTripDetailsVisible(true);
  }, [onTripDetails]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderSpacer} />
            <TouchableOpacity
              style={styles.tripDetailsBtn}
              onPress={openTripDetails}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Trip details"
            >
              <Text style={styles.tripDetailsText}>Trip details</Text>
              <Ionicons name="chevron-forward" size={14} color={GatiMitraColors.deepMintStart} />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>Now you can set a price that works for you</Text>

          <View style={styles.priceBox}>
            <Text style={styles.priceValue}>₹{totalFare}</Text>
          </View>

          <View style={styles.hintRow}>
            <Ionicons name="bulb-outline" size={16} color="#9CA3AF" />
            <Text style={styles.hintText}>
              Higher the price, higher the chance of getting a ride
            </Text>
          </View>

          <View style={styles.sliderSection}>
            <View style={styles.sliderLabels}>
              {RIDE_TIP_STEPS.map((amount, index) => {
                if (index === 0) {
                  return (
                    <View key="base" style={styles.sliderLabelCell}>
                      <Ionicons name="diamond" size={12} color="#374151" />
                    </View>
                  );
                }
                return (
                  <View key={amount} style={styles.sliderLabelCell}>
                    <Text
                      style={[
                        styles.sliderLabelText,
                        stepIndex === index && styles.sliderLabelTextActive,
                      ]}
                    >
                      +{amount}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.sliderTrackWrap} onLayout={handleTrackLayout}>
              <View style={styles.sliderTrackBg} />
              <View style={styles.sliderTrack}>
                <View
                  style={[
                    styles.sliderFill,
                    { width: trackWidth > 0 ? Math.max(12, thumbLeft) : `${(stepIndex / maxStepIndex) * 100}%` },
                  ]}
                />
                {RIDE_TIP_STEPS.map((amount, index) => {
                  const left =
                    trackWidth > 0 ? (index / maxStepIndex) * trackWidth : `${(index / maxStepIndex) * 100}%`;
                  return (
                    <Pressable
                      key={amount}
                      style={[
                        styles.sliderDotHit,
                        typeof left === "number" ? { left: left - 14 } : { left: left as `${number}%`, marginLeft: -14 },
                      ]}
                      onPress={() => setStepIndex(index)}
                      accessibilityRole="button"
                      accessibilityLabel={index === 0 ? "No tip" : `Add ${amount} rupees tip`}
                    >
                      <View style={[styles.sliderDot, stepIndex === index && styles.sliderDotActive]} />
                    </Pressable>
                  );
                })}
                {trackWidth > 0 ? (
                  <View
                    style={[
                      styles.sliderThumb,
                      { transform: [{ translateX: thumbLeft - 12 }] },
                    ]}
                  />
                ) : null}
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.bookBtn}
            activeOpacity={0.9}
            onPress={() => onConfirm(tipAmount)}
          >
            <Text style={styles.bookBtnText}>
              Book {rideName} for ₹{totalFare}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={tripDetailsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTripDetailsVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setTripDetailsVisible(false)} />
        <View style={[styles.tripModal, { paddingBottom: insets.bottom + 20 }]}>
          <Text style={styles.tripModalTitle}>Trip details</Text>
          {pickupLabel ? (
            <View style={styles.tripRow}>
              <View style={[styles.tripDot, styles.tripDotPickup]} />
              <View style={styles.tripTextCol}>
                <Text style={styles.tripRowLabel}>Pickup</Text>
                <Text style={styles.tripRowValue}>{pickupLabel}</Text>
              </View>
            </View>
          ) : null}
          {dropLabel ? (
            <View style={styles.tripRow}>
              <View style={[styles.tripDot, styles.tripDotDrop]} />
              <View style={styles.tripTextCol}>
                <Text style={styles.tripRowLabel}>Drop</Text>
                <Text style={styles.tripRowValue}>{dropLabel}</Text>
              </View>
            </View>
          ) : null}
          <View style={styles.tripMetaRow}>
            <Text style={styles.tripMetaLabel}>Base fare</Text>
            <Text style={styles.tripMetaValue}>₹{baseFare}</Text>
          </View>
          <View style={styles.tripMetaRow}>
            <Text style={styles.tripMetaLabel}>Tip</Text>
            <Text style={styles.tripMetaValue}>{tipAmount > 0 ? `+₹${tipAmount}` : "None"}</Text>
          </View>
          <View style={styles.tripMetaRow}>
            <Text style={styles.tripMetaLabel}>Total</Text>
            <Text style={styles.tripMetaValue}>₹{totalFare}</Text>
          </View>
          <TouchableOpacity
            style={styles.tripModalClose}
            onPress={() => setTripDetailsVisible(false)}
            activeOpacity={0.9}
          >
            <Text style={styles.tripModalCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.18)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  sheetHeaderSpacer: {
    flex: 1,
  },
  tripDetailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  tripDetailsText: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraColors.deepMintStart,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    lineHeight: 26,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  priceBox: {
    alignSelf: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    paddingHorizontal: 36,
    paddingVertical: 14,
    marginBottom: 12,
  },
  priceValue: {
    fontSize: 36,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.5,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  hintText: {
    fontSize: 13,
    color: "#9CA3AF",
    flexShrink: 1,
  },
  sliderSection: {
    marginBottom: 20,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sliderLabelCell: {
    width: 36,
    alignItems: "center",
  },
  sliderLabelText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  sliderLabelTextActive: {
    color: GatiMitraColors.deepMintStart,
  },
  sliderTrackWrap: {
    paddingHorizontal: 4,
    position: "relative",
    height: 28,
    justifyContent: "center",
  },
  sliderTrackBg: {
    position: "absolute",
    left: 4,
    right: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
  },
  sliderTrack: {
    height: 28,
    justifyContent: "center",
    position: "relative",
  },
  sliderFill: {
    position: "absolute",
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: GatiMitraColors.primaryMint,
  },
  sliderDotHit: {
    position: "absolute",
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    top: 0,
  },
  sliderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E5E7EB",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  sliderDotActive: {
    backgroundColor: GatiMitraColors.primaryMint,
  },
  sliderThumb: {
    position: "absolute",
    top: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: GatiMitraColors.primaryMint,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  bookBtn: {
    backgroundColor: GatiMitraColors.primaryMint,
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: "center",
  },
  bookBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  tripModal: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
  },
  tripModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  tripRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  tripDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  tripDotPickup: {
    backgroundColor: GatiMitraColors.primaryMint,
  },
  tripDotDrop: {
    backgroundColor: "#EF4444",
  },
  tripTextCol: {
    flex: 1,
  },
  tripRowLabel: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 2,
  },
  tripRowValue: {
    fontSize: 14,
    color: "#111827",
    lineHeight: 20,
  },
  tripMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  tripMetaLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  tripMetaValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  tripModalClose: {
    marginTop: 16,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  tripModalCloseText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
});
