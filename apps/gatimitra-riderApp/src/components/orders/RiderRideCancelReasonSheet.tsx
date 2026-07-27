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
import { useRiderCancellationReasons } from "@/src/hooks/useRiderCancellationReasons";
import { useRiderBottomInset } from "@/src/hooks/useRiderBottomInset";
import { RIDER_CANCEL_REASON_FALLBACK } from "@/src/lib/rider-ride-cancel-reasons";

type Props = {
  visible: boolean;
  loading?: boolean;
  variant?: "ride" | "food" | "parcel";
  onClose: () => void;
  onSelect: (reasonCode: string, label: string) => void;
};

export function RiderRideCancelReasonSheet({
  visible,
  loading = false,
  variant = "ride",
  onClose,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const bottomInset = useRiderBottomInset();
  const isFood = variant === "food";
  const { data: reasons = RIDER_CANCEL_REASON_FALLBACK, isLoading: reasonsLoading, isFetching } =
    useRiderCancellationReasons(variant, visible);

  const title = isFood
    ? t("orders.activeFood.cancelTitle", "Why are you cancelling this delivery?")
    : t("orders.activeRide.cancelTitle", "Why are you cancelling this ride?");

  const warning = isFood
    ? t(
        "orders.activeFood.cancelWarning",
        "Please cancel only if necessary or in an emergency. Otherwise, penalties may apply to your account."
      )
    : t(
        "orders.activeRide.cancelWarning",
        "Please cancel only if necessary or in an emergency. Otherwise, penalties may apply to your account."
      );

  const listLoading = visible && (reasonsLoading || isFetching) && reasons === RIDER_CANCEL_REASON_FALLBACK;
  const disabled = loading || listLoading;

  const reasonRows = reasons.map((opt, index) => (
    <TouchableOpacity
      key={opt.id != null ? String(opt.id) : `${opt.reasonCode}-${index}`}
      activeOpacity={0.75}
      disabled={disabled}
      onPress={() => onSelect(opt.reasonCode, opt.label)}
      style={[styles.row, disabled ? styles.rowDisabled : null]}
    >
      <View style={styles.rowInner}>
        <Text style={styles.rowText} numberOfLines={2}>
          {opt.label}
        </Text>
        <View style={styles.rowChevronWrap}>
          <Ionicons name="chevron-forward" size={18} color={colors.gray[400]} />
        </View>
      </View>
    </TouchableOpacity>
  ));

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
          onPress={disabled ? undefined : onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close", "Close")}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetBody}>
            <View style={styles.handle} />
            <Text style={styles.title}>{title}</Text>
            <View style={styles.warningBox}>
              <Ionicons name="warning-outline" size={18} color={colors.error[600]} />
              <Text style={styles.warningText}>{warning}</Text>
            </View>

            {listLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.primary[600]} />
              </View>
            ) : (
              <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
                keyboardShouldPersistTaps="handled"
              >
                {reasonRows}
              </ScrollView>
            )}

            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.primary[600]} />
              </View>
            ) : (
              <Pressable onPress={onClose} style={styles.dismissBtn} disabled={disabled}>
                <Text style={styles.dismissText}>{t("common.cancel", "Cancel")}</Text>
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
    marginBottom: 10,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[100],
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: colors.error[700],
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
  emptyText: {
    textAlign: "center",
    paddingVertical: 20,
    fontSize: 14,
    color: colors.gray[500],
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
