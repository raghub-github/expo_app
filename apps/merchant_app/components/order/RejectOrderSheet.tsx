import { useEffect, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { Modal, View, Pressable, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  GatiMitraMerchant,
  H_PADDING,
  CARD_RADIUS,
} from "@/constants/theme";
import {
  MERCHANT_CANCELLATION_REASONS,
  type MerchantCancellationReason,
} from "@/lib/merchantCancellationReasons";
import { formatOrderIdDisplay } from "@/components/order/orderFormatters";

export type RejectOrderSheetProps = {
  visible: boolean;
  formattedOrderId?: string | null;
  fallbackOrderId: number;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (reason: MerchantCancellationReason) => void | Promise<void>;
};

export function RejectOrderSheet({
  visible,
  formattedOrderId,
  fallbackOrderId,
  loading = false,
  onClose,
  onConfirm,
}: RejectOrderSheetProps) {
  const [selected, setSelected] = useState<MerchantCancellationReason | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) setSelected(null);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => !loading && onClose()}
    >
      <Pressable
        style={styles.backdrop}
        onPress={() => !loading && onClose()}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Cancel order</Text>
              <Text style={styles.subtitle}>
                {formatOrderIdDisplay(formattedOrderId, fallbackOrderId) || "Order ID unavailable"}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              disabled={loading}
              hitSlop={8}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="close" size={22} color={GatiMitraMerchant.textPrimary} />
            </Pressable>
          </View>

          <Text style={styles.prompt}>Select a cancellation reason</Text>

          <View style={styles.reasonList}>
            {MERCHANT_CANCELLATION_REASONS.map((reason) => {
              const active = selected === reason;
              return (
                <Pressable
                  key={reason}
                  disabled={loading}
                  onPress={() => setSelected(reason)}
                  style={({ pressed }) => [
                    styles.reasonRow,
                    active && styles.reasonRowActive,
                    pressed && !active && styles.reasonRowPressed,
                  ]}
                >
                  <Text style={[styles.reasonText, active && styles.reasonTextActive]}>
                    {reason}
                  </Text>
                  {active ? (
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={onClose}
              disabled={loading}
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.backBtnText}>Back</Text>
            </Pressable>
            <Pressable
              onPress={() => selected && void onConfirm(selected)}
              disabled={loading || !selected}
              style={({ pressed }) => [
                styles.confirmBtn,
                (!selected || loading) && styles.confirmBtnDisabled,
                pressed && selected && !loading && { opacity: 0.9 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmBtnText}>Confirm reject</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: H_PADDING,
    maxHeight: "85%",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: GatiMitraMerchant.border,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  headerText: { flex: 1, paddingRight: 8 },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 4,
  },
  closeBtn: { padding: 4 },
  prompt: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 12,
    marginBottom: 10,
  },
  reasonList: {
    gap: 8,
    marginBottom: 16,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: CARD_RADIUS,
    backgroundColor: "#FFFFFF",
  },
  reasonRowPressed: { backgroundColor: "#F8FAFC" },
  reasonRowActive: {
    backgroundColor: GatiMitraMerchant.primary,
    borderColor: GatiMitraMerchant.primary,
  },
  reasonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    paddingRight: 8,
  },
  reasonTextActive: { color: "#FFFFFF" },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.border,
    paddingBottom: 4,
  },
  backBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: CARD_RADIUS,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  confirmBtnDisabled: { opacity: 0.45 },
  confirmBtnText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
});
