import { useCallback, useEffect, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, Modal, Pressable, StyleSheet, ScrollView, TextInput, Alert, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import { STORE_CLOSE_REASONS } from "@/lib/storeCloseReasons";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { getOperatingHours, type OperatingHours } from "@/services/outletApi";
import {
  getNextOpenDayStartIso,
  getNextOpenIsoAfterIstCalendarDay,
  nowInStoreTz,
  operatingHoursToFlatRow,
} from "@/lib/merchantStoreNextOpenIso";

type CloseMode = "TODAY" | "MANUAL";

export function RejectStoreCloseSheet({
  visible,
  onClose,
  onAfterClose,
}: {
  visible: boolean;
  /** Dismiss without closing store / cancelling order. */
  onClose: () => void;
  /** After store close succeeds — e.g. cancel the rejected order. */
  onAfterClose?: () => void | Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { closeStore } = useStoreStatus();

  const [closeReason, setCloseReason] = useState<string | null>(null);
  const [closeReasonOther, setCloseReasonOther] = useState("");
  const [reasonPickerOpen, setReasonPickerOpen] = useState(false);
  const [operatingHours, setOperatingHours] = useState<OperatingHours | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCloseReason(null);
    setCloseReasonOther("");
    setReasonPickerOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!visible || !selectedStore?.id || !token) return;
    let cancelled = false;
    void getOperatingHours(selectedStore.id, token).then((h) => {
      if (!cancelled) setOperatingHours(h);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, selectedStore?.id, token]);

  const getCloseUntilIso = useCallback((): string | null => {
    if (operatingHours) {
      const row = operatingHoursToFlatRow(operatingHours);
      const { dayOfWeek } = nowInStoreTz();
      const ref = new Date();
      const next =
        getNextOpenIsoAfterIstCalendarDay(row, dayOfWeek, ref) ??
        getNextOpenDayStartIso(row, dayOfWeek, ref);
      if (next) return next;
    }
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const d = parts.find((p) => p.type === "day")?.value ?? "";
    const endOfTodayIST = new Date(`${y}-${m}-${d}T23:59:59+05:30`);
    return Number.isNaN(endOfTodayIST.getTime()) ? null : endOfTodayIST.toISOString();
  }, [operatingHours]);

  const confirm = async () => {
    if (!closeReason) {
      Alert.alert("Select reason", "Please select a reason for closing your store.");
      return;
    }
    if (closeReason === "Other" && !closeReasonOther.trim()) {
      Alert.alert("Add details", "Please enter the reason in the Other reason box.");
      return;
    }
    setBusy(true);
    try {
      await closeStore({
        manual_close_until: getCloseUntilIso() ?? undefined,
        manual_close_reason:
          closeReason === "Other" ? closeReasonOther.trim() : closeReason,
      });
      if (onAfterClose) {
        await onAfterClose();
      } else {
        onClose();
      }
    } catch {
      Alert.alert("Could not close store", "Please try again from Store Status.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !busy && onClose()}>
      <Pressable style={styles.backdrop} onPress={() => !busy && onClose()}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Close store for today?</Text>
              <Text style={styles.subtitle}>
                You rejected an order because the store is not operational today. Mark the store closed until end of today&apos;s hours.
              </Text>
            </View>
            <Pressable onPress={onClose} disabled={busy} hitSlop={8}>
              <Ionicons name="close" size={22} color={GatiMitraMerchant.textPrimary} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Closure type</Text>
            <View style={styles.modeBox}>
              <Text style={styles.modeValue}>Close for today</Text>
            </View>

            <Text style={[styles.label, { marginTop: 16 }]}>Reason for closing</Text>
            <Pressable
              onPress={() => setReasonPickerOpen(true)}
              style={styles.select}
              disabled={busy}
            >
              <Text style={closeReason ? styles.selectValue : styles.selectPlaceholder}>
                {closeReason ?? "Select reason"}
              </Text>
              <Ionicons name="chevron-down" size={16} color={GatiMitraMerchant.textTertiary} />
            </Pressable>

            {closeReason === "Other" ? (
              <TextInput
                style={styles.otherInput}
                placeholder="Enter reason…"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                value={closeReasonOther}
                onChangeText={setCloseReasonOther}
                multiline
              />
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable onPress={onClose} disabled={busy} style={styles.skipBtn}>
              <Text style={styles.skipBtnText}>Skip</Text>
            </Pressable>
            <Pressable onPress={() => void confirm()} disabled={busy} style={styles.confirmBtn}>
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmBtnText}>Confirm close</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>

      <Modal visible={reasonPickerOpen} transparent animationType="fade">
        <Pressable style={styles.backdrop} onPress={() => setReasonPickerOpen(false)}>
          <Pressable style={[styles.reasonSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Text style={styles.reasonTitle}>Select reason</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {STORE_CLOSE_REASONS.map((reason) => (
                <Pressable
                  key={reason}
                  onPress={() => {
                    setCloseReason(reason);
                    setReasonPickerOpen(false);
                  }}
                  style={styles.reasonRow}
                >
                  <Text style={styles.reasonRowText}>{reason}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: H_PADDING,
    maxHeight: "88%",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: GatiMitraMerchant.border,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerText: { flex: 1, paddingRight: 8 },
  title: { fontSize: 18, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  subtitle: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginTop: 4, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textSecondary, marginBottom: 6 },
  modeBox: {
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: CARD_RADIUS,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#FEF2F2",
  },
  modeValue: { fontSize: 15, fontWeight: "600", color: "#B91C1C" },
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: CARD_RADIUS,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  selectValue: { fontSize: 15, color: GatiMitraMerchant.textPrimary, flex: 1 },
  selectPlaceholder: { fontSize: 15, color: GatiMitraMerchant.textTertiary, flex: 1 },
  otherInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: CARD_RADIUS,
    padding: 12,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    minHeight: 72,
    textAlignVertical: "top",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.border,
  },
  skipBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
  },
  skipBtnText: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: CARD_RADIUS,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  confirmBtnText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  reasonSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: H_PADDING,
    maxHeight: "70%",
  },
  reasonTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 12,
  },
  reasonRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.border,
  },
  reasonRowText: { fontSize: 15, color: GatiMitraMerchant.textPrimary },
});
