/**
 * Withdrawal submitted confirmation — scooped bottom sheet (not Alert).
 */
import { AppText as Text } from "@/components/AppText";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PermissionBottomSheetShell } from "@/components/permissions/PermissionBottomSheetShell";
import { GatiMitraMerchant } from "@/constants/theme";

const LORA = "Lora_400Regular";
const LORA_BOLD = "Lora_700Bold";
const POPPINS_BOLD = "Poppins_700Bold";

export type WithdrawalSuccessSheetProps = {
  visible: boolean;
  amountLabel: string;
  onClose: () => void;
};

export function WithdrawalSuccessSheet({
  visible,
  amountLabel,
  onClose,
}: WithdrawalSuccessSheetProps) {
  return (
    <PermissionBottomSheetShell
      visible={visible}
      dismissible
      onDismiss={onClose}
      maxHeightRatio={0.55}
    >
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="checkmark-circle" size={52} color={GatiMitraMerchant.primary} />
        </View>
        <Text style={styles.title}>Withdrawal submitted</Text>
        <Text style={styles.body}>
          Withdrawal of{" "}
          <Text style={styles.amountInline}>{amountLabel}</Text>
          {" "}is submitted. Full amount typically reaches your bank in 24–48 hours.
        </Text>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="OK"
        >
          <Text style={styles.ctaText}>OK</Text>
        </Pressable>
      </View>
    </PermissionBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: "center",
  },
  iconWrap: {
    marginBottom: 14,
  },
  title: {
    fontFamily: LORA_BOLD,
    fontSize: 22,
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    marginBottom: 10,
  },
  body: {
    fontFamily: LORA,
    fontSize: 15,
    lineHeight: 22,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    marginBottom: 22,
  },
  amountInline: {
    fontFamily: POPPINS_BOLD,
    color: GatiMitraMerchant.textPrimary,
  },
  cta: {
    alignSelf: "stretch",
    backgroundColor: GatiMitraMerchant.primary,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: {
    fontFamily: LORA_BOLD,
    fontSize: 16,
    color: "#FFFFFF",
  },
  pressed: { opacity: 0.88 },
});
