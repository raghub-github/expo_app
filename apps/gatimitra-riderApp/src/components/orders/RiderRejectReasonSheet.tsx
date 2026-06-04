import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import { RIDER_ORDER_REJECT_REASON_OPTIONS } from "@/src/lib/rider-order-reject-reasons";

type Props = {
  visible: boolean;
  loading?: boolean;
  onClose: () => void;
  onSelect: (reasonCode: string, label: string) => void;
};

export function RiderRejectReasonSheet({
  visible,
  loading = false,
  onClose,
  onSelect,
}: Props) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={loading ? undefined : onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>
          {t("orders.reject.title", "Why are you rejecting this order?")}
        </Text>
        <Text style={styles.subtitle}>
          {t(
            "orders.reject.subtitle",
            "You will not receive this order again. Your reason is recorded."
          )}
        </Text>

        <ScrollView style={styles.list} bounces={false}>
          {RIDER_ORDER_REJECT_REASON_OPTIONS.map((opt) => {
            const label = t(opt.labelKey, opt.defaultLabel);
            return (
              <Pressable
                key={opt.code}
                disabled={loading}
                onPress={() => onSelect(opt.code, label)}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                  loading && styles.rowDisabled,
                ]}
              >
                <Text style={styles.rowText}>{label}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.gray[400]} />
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary[600]} />
          </View>
        ) : (
          <Pressable onPress={onClose} style={styles.dismissBtn}>
            <Text style={styles.dismissText}>{t("common.back", "Back")}</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 24,
    maxHeight: "78%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray[300],
    marginTop: 10,
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.gray[900],
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.gray[500],
    marginTop: 6,
    marginBottom: 12,
    lineHeight: 18,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[200],
  },
  rowPressed: {
    backgroundColor: colors.gray[50],
  },
  rowDisabled: {
    opacity: 0.6,
  },
  rowText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.gray[800],
    paddingRight: 8,
  },
  loadingRow: {
    paddingVertical: 16,
    alignItems: "center",
  },
  dismissBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  dismissText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.gray[600],
  },
});
