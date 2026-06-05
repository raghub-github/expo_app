import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";

const GREEN = colors.success[600];

let DateTimePicker: React.ComponentType<{
  value: Date;
  mode: "date";
  display?: "default" | "spinner";
  maximumDate?: Date;
  onChange: (event: { type: string }, date?: Date) => void;
}> | null = null;
try {
  DateTimePicker = require("@react-native-community/datetimepicker").default;
} catch {
  // native module unavailable
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function isOrderInDateRange(
  createdAt: string,
  from: Date | null,
  to: Date | null
): boolean {
  const ts = new Date(createdAt).getTime();
  if (Number.isNaN(ts)) return true;
  if (from && ts < startOfDay(from).getTime()) return false;
  if (to && ts > endOfDay(to).getTime()) return false;
  return true;
}

export function formatDateRangeChip(from: Date | null, to: Date | null): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  if (from && to) {
    const same =
      from.getFullYear() === to.getFullYear() &&
      from.getMonth() === to.getMonth() &&
      from.getDate() === to.getDate();
    if (same) return fmt(from);
    return `${fmt(from)} – ${fmt(to)}`;
  }
  if (from) return `${fmt(from)} →`;
  if (to) return `→ ${fmt(to)}`;
  return "";
}

function normalizeRange(from: Date, to: Date): { from: Date; to: Date } {
  if (startOfDay(from).getTime() <= startOfDay(to).getTime()) {
    return { from, to };
  }
  return { from: to, to: from };
}

type ActiveField = "from" | "to";

type OrderHistoryDateRangeSheetProps = {
  visible: boolean;
  onClose: () => void;
  initialFrom: Date | null;
  initialTo: Date | null;
  onApply: (from: Date | null, to: Date | null) => void;
};

function formatFieldDate(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function OrderHistoryDateRangeSheet({
  visible,
  onClose,
  initialFrom,
  initialTo,
  onApply,
}: OrderHistoryDateRangeSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const today = new Date();
  const [draftFrom, setDraftFrom] = useState(initialFrom ?? today);
  const [draftTo, setDraftTo] = useState(initialTo ?? today);
  const [activeField, setActiveField] = useState<ActiveField>("from");
  const [showPicker, setShowPicker] = useState(Platform.OS === "ios");

  useEffect(() => {
    if (!visible) return;
    setDraftFrom(initialFrom ?? today);
    setDraftTo(initialTo ?? today);
    setActiveField("from");
    setShowPicker(Platform.OS === "ios");
  }, [visible, initialFrom, initialTo]);

  const pickerValue = activeField === "from" ? draftFrom : draftTo;

  const onPickerChange = useCallback(
    (event: { type: string }, selectedDate?: Date) => {
      if (Platform.OS === "android") {
        setShowPicker(false);
      }
      if (event.type === "dismissed") return;
      if (!selectedDate) return;
      if (activeField === "from") {
        setDraftFrom(selectedDate);
      } else {
        setDraftTo(selectedDate);
      }
    },
    [activeField]
  );

  const openField = (field: ActiveField) => {
    setActiveField(field);
    if (Platform.OS === "android") {
      setShowPicker(true);
    }
  };

  const handleApply = () => {
    const { from, to } = normalizeRange(draftFrom, draftTo);
    onApply(from, to);
    onClose();
  };

  const handleClear = () => {
    onApply(null, null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>
          {t("profile.myOrders.dateRangeTitle", "Filter by date")}
        </Text>
        <Text style={styles.sheetSub}>
          {t("profile.myOrders.dateRangeSub", "Choose From and To dates")}
        </Text>

        <Pressable
          onPress={() => openField("from")}
          style={[styles.dateField, activeField === "from" && styles.dateFieldActive]}
        >
          <View style={styles.dateFieldIconWrap}>
            <Ionicons name="calendar-outline" size={20} color={GREEN} />
          </View>
          <View style={styles.dateFieldText}>
            <Text style={styles.dateFieldLabel}>
              {t("profile.myOrders.dateFrom", "From")}
            </Text>
            <Text style={styles.dateFieldValue}>{formatFieldDate(draftFrom)}</Text>
          </View>
          <Ionicons
            name={activeField === "from" ? "chevron-up" : "chevron-down"}
            size={18}
            color="#94A3B8"
          />
        </Pressable>

        <Pressable
          onPress={() => openField("to")}
          style={[styles.dateField, activeField === "to" && styles.dateFieldActive]}
        >
          <View style={styles.dateFieldIconWrap}>
            <Ionicons name="calendar-outline" size={20} color={GREEN} />
          </View>
          <View style={styles.dateFieldText}>
            <Text style={styles.dateFieldLabel}>
              {t("profile.myOrders.dateTo", "To")}
            </Text>
            <Text style={styles.dateFieldValue}>{formatFieldDate(draftTo)}</Text>
          </View>
          <Ionicons
            name={activeField === "to" ? "chevron-up" : "chevron-down"}
            size={18}
            color="#94A3B8"
          />
        </Pressable>

        {showPicker && DateTimePicker ? (
          <View style={styles.pickerWrap}>
            <DateTimePicker
              value={pickerValue}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              maximumDate={today}
              onChange={onPickerChange}
            />
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable onPress={handleClear} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>
              {t("profile.myOrders.clearDates", "Clear")}
            </Text>
          </Pressable>
          <TouchableOpacity onPress={handleApply} style={styles.applyBtn} activeOpacity={0.9}>
            <Text style={styles.applyBtnText}>
              {t("profile.myOrders.applyDates", "Apply")}
            </Text>
          </TouchableOpacity>
        </View>

        {Platform.OS === "ios" ? (
          <TouchableOpacity onPress={onClose} style={styles.iosCloseBtn}>
            <Text style={styles.iosCloseText}>{t("common.cancel", "Cancel")}</Text>
          </TouchableOpacity>
        ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },
  sheetSub: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 20,
  },
  dateField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    marginBottom: 10,
  },
  dateFieldActive: {
    borderColor: GREEN,
    backgroundColor: "#ECFDF5",
  },
  dateFieldIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  dateFieldText: { flex: 1 },
  dateFieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  dateFieldValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  pickerWrap: {
    marginVertical: 8,
    alignItems: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  clearBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  clearBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#475569",
  },
  applyBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: GREEN,
  },
  applyBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  iosCloseBtn: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 4,
  },
  iosCloseText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748B",
  },
});
