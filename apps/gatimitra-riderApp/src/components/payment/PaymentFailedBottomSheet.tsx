import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";

const ACCENT_DARK = "#22a745";

type Props = {
  visible: boolean;
  message?: string | null;
  onContinue: () => void;
  onCancel: () => void;
};

/**
 * Shown when onboarding Razorpay checkout is cancelled or fails — keeps the
 * rider on the payment screen (no deep-link bounce / Unmatched / logout).
 */
export function PaymentFailedBottomSheet({
  visible,
  message,
  onContinue,
  onCancel,
}: Props) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onCancel} accessibilityRole="button" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <View style={styles.iconWrap}>
            <Ionicons name="alert-circle" size={36} color="#DC2626" />
          </View>
          <Text style={styles.title}>Payment failed</Text>
          <Text style={styles.subtitle}>
            {message?.trim() ||
              "Your payment was not completed. You can try again or cancel and stay on this screen."}
          </Text>

          <TouchableOpacity
            activeOpacity={0.88}
            onPress={onContinue}
            style={styles.primaryBtn}
            accessibilityRole="button"
            accessibilityLabel="Continue"
          >
            <Text style={styles.primaryBtnText}>Continue</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onCancel}
            style={styles.outlineBtn}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.outlineBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 10,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray[200],
    marginBottom: 8,
  },
  iconWrap: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.gray[900],
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.gray[600],
    textAlign: "center",
    marginBottom: 8,
  },
  primaryBtn: {
    backgroundColor: ACCENT_DARK,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 4,
  },
  outlineBtnText: {
    color: colors.gray[700],
    fontSize: 16,
    fontWeight: "700",
  },
});
