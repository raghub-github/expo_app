import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { AppText as Text } from "@/components/AppText";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";

type Props = {
  visible: boolean;
  loading?: boolean;
  orderLabel: string;
  onClose: () => void;
  onConfirm: (otp: string) => void | Promise<void>;
};

export function CompleteSelfPickupSheet({
  visible,
  loading,
  orderLabel,
  onClose,
  onConfirm,
}: Props) {
  const [otp, setOtp] = useState("");

  useEffect(() => {
    if (!visible) setOtp("");
  }, [visible]);

  const canSubmit = otp.trim().length >= 4 && !loading;

  return (
    <MerchantBottomSheetShell
      visible={visible}
      onClose={onClose}
      maxHeightPercent="72%"
      keyboardAware
    >
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          Complete self-pickup — {orderLabel}
        </Text>
        <Text style={styles.subtitle}>
          Ask the customer for the Pickup OTP shown in their app, then enter it below. Correct
          OTP marks the order as picked up and completed.
        </Text>

        <View style={styles.otpBox}>
          <Text style={styles.otpLabel}>Customer Pickup OTP</Text>
          <TextInput
            value={otp}
            onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
            autoFocus
            editable={!loading}
            placeholder="••••"
            placeholderTextColor="#94A3B8"
            style={styles.otpInput}
            accessibilityLabel="Customer Pickup OTP"
          />
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={onClose}
            disabled={loading}
            style={({ pressed }) => [
              styles.cancelBtn,
              pressed && !loading && styles.pressed,
              loading && styles.disabled,
            ]}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => void onConfirm(otp.trim())}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.confirmBtn,
              pressed && canSubmit && styles.pressed,
              !canSubmit && styles.disabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.confirmText}>Confirm & complete</Text>
            )}
          </Pressable>
        </View>
      </View>
    </MerchantBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: GatiMitraMerchant.textSecondary,
  },
  otpBox: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    backgroundColor: "#ECFDF5",
    padding: 12,
    gap: 6,
  },
  otpLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#065F46",
  },
  otpInput: {
    borderWidth: 1,
    borderColor: "#A7F3D0",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 10,
    textAlign: "center",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  confirmBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.5 },
});
