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
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { ResponsiveSheetBody } from "@/src/components/ui/ResponsiveSheetBody";
import { flexShrinkText, rowLayout } from "@/src/theme/responsiveText";

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
  const { height, isShortHeight } = useResponsiveLayout();
  const cardMaxH = Math.round(height * (isShortHeight ? 0.72 : 0.8));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.card, { maxHeight: cardMaxH }]}
          onPress={(e) => e.stopPropagation()}
        >
          <ResponsiveSheetBody
            maxHeight={cardMaxH - 16}
            contentContainerStyle={styles.bodyContent}
            footerStyle={styles.footerSlot}
            footer={
              <View style={[rowLayout.row, styles.actions]}>
                <Pressable onPress={onCancel} disabled={loading} style={styles.cancelBtn}>
                  <Text style={styles.cancelText} numberOfLines={1}>
                    {t("common.cancel", "Cancel")}
                  </Text>
                </Pressable>
                <Pressable onPress={onConfirm} disabled={loading} style={styles.confirmBtn}>
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.primary[600]} />
                  ) : (
                    <Text style={styles.confirmText} numberOfLines={1}>
                      {t("common.confirm", "Confirm")}
                    </Text>
                  )}
                </Pressable>
              </View>
            }
          >
            <View style={styles.pill}>
              <View style={styles.pillIcon} />
              <Text style={styles.pillText} numberOfLines={1}>
                {t("topbar.dutyOff", "OFF DUTY")}
              </Text>
            </View>

            <Text style={[styles.title, flexShrinkText]} numberOfLines={isShortHeight ? 3 : 4}>
              {t("home.offDutyConfirmTitle", "Are you sure you want to go off duty?")}
            </Text>
            <Text
              style={[styles.subtitle, flexShrinkText]}
              numberOfLines={isShortHeight ? 3 : 5}
            >
              {t(
                "home.offDutyConfirmSub",
                "You will stop receiving orders once you have turned your duty OFF"
              )}
            </Text>
          </ResponsiveSheetBody>
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
    paddingTop: 8,
    paddingBottom: 10,
    alignItems: "stretch",
    overflow: "hidden",
    flexShrink: 1,
    minHeight: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  bodyContent: {
    alignItems: "center",
    paddingTop: 12,
    paddingHorizontal: 22,
  },
  footerSlot: {
    borderTopWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 22,
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
    alignSelf: "center",
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
    alignSelf: "stretch",
  },
  subtitle: {
    fontSize: 13,
    color: colors.gray[500],
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 8,
    paddingHorizontal: 4,
    alignSelf: "stretch",
  },
  actions: {
    justifyContent: "flex-end",
    alignSelf: "stretch",
    gap: 20,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    flexShrink: 1,
    minWidth: 0,
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
    flexShrink: 0,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.primary[600],
  },
});
