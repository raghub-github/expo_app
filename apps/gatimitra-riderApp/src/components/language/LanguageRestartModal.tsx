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

type LanguageRestartModalProps = {
  visible: boolean;
  onCancel: () => void;
  onProceed: () => void;
  loading?: boolean;
};

export function LanguageRestartModal({
  visible,
  onCancel,
  onProceed,
  loading,
}: LanguageRestartModalProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>
            {t("language.restartRequired", "Restart Required")}
          </Text>
          <Text style={styles.message}>
            {t(
              "language.restartMessage",
              "To apply the new language, the app will restart. Do you want to proceed?"
            )}
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={onCancel} disabled={loading} style={styles.actionBtn}>
              <Text style={styles.cancelText}>{t("common.cancel", "Cancel")}</Text>
            </Pressable>
            <Pressable onPress={onProceed} disabled={loading} style={styles.actionBtn}>
              {loading ? (
                <ActivityIndicator size="small" color={colors.primary[600]} />
              ) : (
                <Text style={styles.proceedText}>{t("language.proceed", "Proceed")}</Text>
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
    padding: 28,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.gray[900],
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    color: colors.gray[700],
    lineHeight: 21,
    marginBottom: 20,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 20,
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 64,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.gray[600],
  },
  proceedText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.primary[600],
  },
});
