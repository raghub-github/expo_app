import { View, Modal, Pressable, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { AppText } from "@/components/AppText";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  FOOD_ORDER_CANCEL_REASONS,
  type FoodCancelReason,
} from "@/lib/food-cancel-reasons";
import { GatiMitraColors } from "@/constants/gatimitra";

type FoodCancelReasonSheetProps = {
  visible: boolean;
  loading?: boolean;
  onClose: () => void;
  onSelectReason: (reason: FoodCancelReason) => void;
};

export function FoodCancelReasonSheet({
  visible,
  loading = false,
  onClose,
  onSelectReason,
}: FoodCancelReasonSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={loading ? undefined : onClose} />

        <Pressable
          style={[styles.backFab, { top: insets.top + 8 }]}
          onPress={onClose}
          disabled={loading}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </Pressable>

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <AppText style={styles.title}>Why do you want to cancel?</AppText>
          <AppText style={styles.subtitle}>Please select a reason for cancellation</AppText>

          <View style={styles.divider} />

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={GatiMitraColors.primaryMint} />
              <AppText style={styles.loadingText}>Cancelling your order…</AppText>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {FOOD_ORDER_CANCEL_REASONS.map((reason, index) => (
                <View key={reason.id}>
                  <TouchableOpacity
                    style={styles.reasonRow}
                    onPress={() => onSelectReason(reason)}
                    activeOpacity={0.85}
                  >
                    <AppText style={styles.reasonText}>{reason.label}</AppText>
                    <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                  {index < FOOD_ORDER_CANCEL_REASONS.length - 1 ? (
                    <View style={styles.rowDivider} />
                  ) : null}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  backFab: {
    position: "absolute",
    left: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    zIndex: 2,
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 22,
    maxHeight: "62%",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#4B5563",
    marginBottom: 14,
  },
  divider: {
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    marginBottom: 4,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
  },
  reasonText: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    paddingRight: 12,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#4B5563",
  },
});
