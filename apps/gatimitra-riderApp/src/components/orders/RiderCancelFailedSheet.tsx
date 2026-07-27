import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import { useRiderBottomInset } from "@/src/hooks/useRiderBottomInset";

type Props = {
  visible: boolean;
  title?: string;
  message?: string;
  onDismiss: () => void;
  onRetry?: () => void;
};

/** Error sheet replacing Alert.alert for rider cancel failures. */
export function RiderCancelFailedSheet({
  visible,
  title,
  message,
  onDismiss,
  onRetry,
}: Props) {
  const { t } = useTranslation();
  const bottomInset = useRiderBottomInset();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onDismiss}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityRole="button" />
        <View style={styles.sheet}>
          <View style={styles.sheetBody}>
            <View style={styles.handle} />
            <View style={styles.iconWrap}>
              <Ionicons name="alert-circle" size={44} color={colors.error[600]} />
            </View>
            <Text style={styles.title}>
              {title?.trim() ||
                t("orders.activeRide.cancelFailedTitle", "Could not cancel")}
            </Text>
            <Text style={styles.message}>
              {message?.trim() ||
                t(
                  "orders.activeRide.cancelFailedMessage",
                  "Please try again or contact support."
                )}
            </Text>

            <View style={styles.actions}>
              <Pressable onPress={onDismiss} style={[styles.btn, styles.btnSecondary]}>
                <Text style={styles.btnSecondaryText}>{t("common.ok", "OK")}</Text>
              </Pressable>
              {onRetry ? (
                <Pressable onPress={onRetry} style={[styles.btn, styles.btnPrimary]}>
                  <Text style={styles.btnPrimaryText}>{t("common.retry", "Retry")}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <View style={[styles.bottomSafeFill, { height: bottomInset }]} />
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
  sheet: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
    ...Platform.select({
      android: { elevation: 14 },
    }),
  },
  sheetBody: {
    width: "100%",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  bottomSafeFill: {
    width: "100%",
    backgroundColor: "#fff",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray[300],
    marginTop: 8,
    marginBottom: 12,
  },
  iconWrap: {
    alignSelf: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.gray[900],
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.gray[600],
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  btn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  btnSecondary: {
    backgroundColor: colors.gray[100],
  },
  btnSecondaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.gray[700],
  },
  btnPrimary: {
    backgroundColor: colors.primary[600],
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
});
