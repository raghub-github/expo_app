import React from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";

type OffDutyConfirmModalProps = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
};

export function OffDutyConfirmModal({
  visible,
  onCancel,
  onConfirm,
  loading,
}: OffDutyConfirmModalProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.pill}>
            <View style={styles.pillIcon} />
            <Text style={styles.pillText}>{t("topbar.dutyOff", "OFF DUTY")}</Text>
          </View>

          <Text style={styles.title}>
            {t("home.offDutyConfirmTitle", "Are you sure you want to go off duty?")}
          </Text>
          <Text style={styles.subtitle}>
            {t(
              "home.offDutyConfirmSub",
              "You will stop receiving orders once you have turned your duty OFF"
            )}
          </Text>

          <View style={styles.actions}>
            <Pressable onPress={onCancel} disabled={loading} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>{t("common.cancel", "Cancel")}</Text>
            </Pressable>
            <Pressable onPress={onConfirm} disabled={loading} style={styles.confirmBtn}>
              {loading ? (
                <ActivityIndicator size="small" color={colors.primary[600]} />
              ) : (
                <Text style={styles.confirmText}>{t("common.confirm", "Confirm")}</Text>
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
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#374151",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    marginBottom: 18,
  },
  pillIcon: {
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: "#ffffff",
  },
  pillText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.gray[900],
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 13,
    color: colors.gray[500],
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    alignSelf: "stretch",
    gap: 20,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.gray[500],
  },
  confirmBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 72,
    alignItems: "center",
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.primary[600],
  },
});
