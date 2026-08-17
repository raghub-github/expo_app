/**
 * In-app alert dialog — matches customer app card/CTA language (not system Alert).
 */

import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { StoreTheme } from "@/constants/storeTheme";

export type AppAlertVariant = "info" | "success" | "warning";

export type AppAlertModalProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: AppAlertVariant;
  onClose: () => void;
};

const VARIANT: Record<
  AppAlertVariant,
  { icon: keyof typeof Ionicons.glyphMap; iconColor: string; iconBg: string }
> = {
  info: {
    icon: "information-circle-outline",
    iconColor: StoreTheme.accentMintDark,
    iconBg: StoreTheme.accentMintSoft,
  },
  success: {
    icon: "heart",
    iconColor: "#16A34A",
    iconBg: "#ECFDF5",
  },
  warning: {
    icon: "bicycle-outline",
    iconColor: "#C2410C",
    iconBg: "#FFF7ED",
  },
};

export function AppAlertModal({
  visible,
  title,
  message,
  confirmLabel = "OK",
  variant = "info",
  onClose,
}: AppAlertModalProps) {
  const v = VARIANT[variant];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View style={styles.card} accessibilityRole="alert">
          <View style={[styles.iconWrap, { backgroundColor: v.iconBg }]}>
            <Ionicons name={v.icon} size={28} color={v.iconColor} />
          </View>

          <AppText style={styles.title}>{title}</AppText>
          <AppText style={styles.message}>{message}</AppText>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <AppText style={styles.buttonText}>{confirmLabel}</AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
  },
  card: {
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F0F0F0",
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 18,
    zIndex: 2,
    // Hint of depth only — same language as home cards.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  iconWrap: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    marginBottom: 14,
  },
  title: {
    color: StoreTheme.textPrimary,
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.2,
  },
  message: {
    color: StoreTheme.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  button: {
    alignSelf: "stretch",
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#16A34A",
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  buttonPressed: {
    opacity: 0.88,
    backgroundColor: "#15803D",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
