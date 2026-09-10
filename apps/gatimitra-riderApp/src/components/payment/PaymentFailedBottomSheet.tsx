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
import { colors } from "@/src/theme";
import { ResponsiveSheetBody } from "@/src/components/ui/ResponsiveSheetBody";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { resolveRiderBottomInset } from "@/src/hooks/useRiderBottomInset";
import { flexShrinkText } from "@/src/theme/responsiveText";

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
  const { rs, insets, height, isShortHeight } = useResponsiveLayout();
  if (!visible) return null;

  const bottomPad = resolveRiderBottomInset(insets.bottom) + rs(12);
  const maxH = Math.round(height * (isShortHeight ? 0.7 : 0.55));

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
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ResponsiveSheetBody
            maxHeight={maxH}
            contentContainerStyle={styles.body}
            footerBottomInset={bottomPad}
            footer={
              <View>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={onContinue}
                  style={styles.primaryBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Continue"
                >
                  <Text style={styles.primaryBtnText} numberOfLines={1}>
                    Continue
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={onCancel}
                  style={styles.outlineBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.outlineBtnText} numberOfLines={1}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            }
          >
            <View style={styles.iconWrap}>
              <Ionicons name="alert-circle" size={36} color="#DC2626" />
            </View>
            <Text style={[styles.title, flexShrinkText]} numberOfLines={2}>
              Payment failed
            </Text>
            <Text style={[styles.subtitle, flexShrinkText]} numberOfLines={5}>
              {message?.trim() ||
                "Your payment was not completed. You can try again or cancel and stay on this screen."}
            </Text>
          </ResponsiveSheetBody>
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
    paddingTop: 10,
    maxWidth: "100%",
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray[200],
    marginBottom: 4,
  },
  body: {
    alignItems: "center",
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
    marginTop: 6,
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
    marginTop: 8,
    marginBottom: 4,
  },
  outlineBtnText: {
    color: colors.gray[700],
    fontSize: 16,
    fontWeight: "700",
  },
});
