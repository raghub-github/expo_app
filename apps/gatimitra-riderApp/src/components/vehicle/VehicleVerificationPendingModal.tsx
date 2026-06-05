import React from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";

type VehicleVerificationPendingModalProps = {
  visible: boolean;
  onDismiss: () => void;
};

export function VehicleVerificationPendingModal({
  visible,
  onDismiss,
}: VehicleVerificationPendingModalProps) {
  const { t } = useTranslation();
  const teal = colors.primary[600];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.iconWrap}>
            <Ionicons name="car-outline" size={28} color={teal} />
          </View>
          <Text style={styles.title}>
            {t("vehicle.verification.title", "Vehicle verification pending")}
          </Text>
          <Text style={styles.subtitle}>
            {t(
              "vehicle.verification.subtitle",
              "Your vehicle details have been submitted. You can go online after our team verifies your vehicle.",
            )}
          </Text>
          <Pressable onPress={onDismiss} style={styles.btn}>
            <Text style={styles.btnText}>{t("common.ok", "OK")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 22,
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#64748B",
    textAlign: "center",
  },
  btn: {
    marginTop: 8,
    width: "100%",
    backgroundColor: colors.primary[600],
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
