import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import { useRiderBottomInset } from "@/src/hooks/useRiderBottomInset";
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
  const bottomInset = useRiderBottomInset();

  const reasonRows = RIDER_ORDER_REJECT_REASON_OPTIONS.map((opt) => {
    const label = t(opt.labelKey, opt.defaultLabel);
    return (
      <TouchableOpacity
        key={opt.code}
        activeOpacity={0.75}
        disabled={loading}
        onPress={() => onSelect(opt.code, label)}
        style={[styles.row, loading ? styles.rowDisabled : null]}
      >
        <View style={styles.rowInner}>
          <Text style={styles.rowText} numberOfLines={2}>
            {label}
          </Text>
          <View style={styles.rowChevronWrap}>
            <Ionicons name="chevron-forward" size={18} color={colors.gray[400]} />
          </View>
        </View>
      </TouchableOpacity>
    );
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={loading ? undefined : onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close", "Close")}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetBody}>
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

            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
            >
              {reasonRows}
            </ScrollView>

            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.primary[600]} />
              </View>
            ) : (
              <Pressable onPress={onClose} style={styles.dismissBtn} disabled={loading}>
                <Text style={styles.dismissText}>{t("common.back", "Back")}</Text>
              </Pressable>
            )}
          </View>
          <View style={[styles.bottomSafeFill, { height: bottomInset }]} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
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
    maxHeight: "78%",
    overflow: "hidden",
    ...Platform.select({
      android: { elevation: 12 },
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
    width: "100%",
    flexGrow: 0,
    flexShrink: 1,
  },
  listContent: {
    width: "100%",
    paddingBottom: 4,
  },
  row: {
    width: "100%",
    alignSelf: "stretch",
    minHeight: 52,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[200],
  },
  rowInner: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowDisabled: {
    opacity: 0.55,
  },
  rowText: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "600",
    color: colors.gray[800],
    paddingRight: 12,
  },
  rowChevronWrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    flexGrow: 0,
  },
  loadingRow: {
    alignItems: "center",
    paddingVertical: 12,
  },
  dismissBtn: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 4,
  },
  dismissText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.gray[600],
  },
});
