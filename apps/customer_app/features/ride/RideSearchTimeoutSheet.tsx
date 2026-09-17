/**
 * Search-extension sheet — shown when initial rider search window ends without assignment.
 * Compact Continue Searching / Cancel Order only (no tip boost UI).
 */

import { AppText } from "@/components/AppText";
import { View, TouchableOpacity, StyleSheet, Modal, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

const EXTENSION_MINUTES = 3;
const TIP_BOOST_DECISION_MINUTES = 1.5;

function formatCountdownMmSs(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export type TipBoostLoadingAction = "add_tip" | "continue" | null;

export type RideTipBoostSheetProps = {
  visible: boolean;
  loadingAction?: TipBoostLoadingAction;
  /** Seconds left to pick a CTA before auto-cancel (1.5 min decision window). */
  decisionRemainingSec?: number;
  /** Kept for call-site compatibility — tip UI removed. */
  orderTotal?: number;
  existingTipAmount?: number;
  heroImage?: unknown;
  onAddTipAndContinue?: (tipAmount: number) => void;
  onContinueWithoutTip: () => void;
  onCancelOrder: () => void;
};

export function RideTipBoostSheet({
  visible,
  loadingAction = null,
  decisionRemainingSec = 90,
  onContinueWithoutTip,
  onCancelOrder,
}: RideTipBoostSheetProps) {
  const insets = useSafeAreaInsets();
  const busy = loadingAction != null;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onContinueWithoutTip}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={busy ? undefined : onContinueWithoutTip}
          accessibilityRole="button"
        />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <AppText style={styles.title}>Still looking for a rider</AppText>
              <AppText style={styles.message}>
                No captain accepted yet. Continue searching for another {EXTENSION_MINUTES} minutes,
                or cancel this ride.
              </AppText>
            </View>
            <View style={styles.timerBadge}>
              <Ionicons name="timer-outline" size={15} color={GatiMitraColors.deepMintStart} />
              <AppText style={styles.timerBadgeText}>
                {formatCountdownMmSs(decisionRemainingSec)}
              </AppText>
            </View>
          </View>

          <View style={styles.shieldBanner}>
            <Ionicons name="shield-checkmark" size={18} color={GatiMitraColors.deepMintStart} />
            <AppText style={styles.shieldBannerText}>
              Choose within{" "}
              <AppText style={styles.shieldBold}>{TIP_BOOST_DECISION_MINUTES} minutes</AppText> or
              your ride will be cancelled.
            </AppText>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, busy && styles.btnDisabled]}
            onPress={onContinueWithoutTip}
            activeOpacity={0.9}
            disabled={busy}
          >
            {loadingAction === "continue" || loadingAction === "add_tip" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <AppText style={styles.primaryBtnText}>Continue searching</AppText>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.cancelBtn, busy && styles.btnDisabled]}
            onPress={onCancelOrder}
            activeOpacity={0.9}
            disabled={busy}
          >
            <AppText style={styles.cancelBtnText}>Cancel order</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** @deprecated Use RideTipBoostSheet */
export const RideSearchTimeoutSheet = RideTipBoostSheet;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "48%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 6,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: "#6B7280",
  },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  timerBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraColors.deepMintStart,
  },
  shieldBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  shieldBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#374151",
  },
  shieldBold: {
    fontWeight: "700",
    color: "#111827",
  },
  primaryBtn: {
    backgroundColor: GatiMitraColors.primaryMint,
    paddingVertical: 15,
    borderRadius: 20,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  cancelBtn: {
    borderWidth: 2,
    borderColor: "#EF4444",
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: "center",
    marginBottom: 4,
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#EF4444",
  },
  btnDisabled: {
    opacity: 0.65,
  },
});
