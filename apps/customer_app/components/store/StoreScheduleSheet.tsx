import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StoreTheme } from "@/constants/storeTheme";
import { StoreBottomSheetShell } from "./StoreBottomSheetShell";

export type StoreScheduleSheetProps = {
  visible: boolean;
  onClose: () => void;
  storeName: string;
  onConfirm?: (slotLabel: string) => void;
};

type DayOption = { id: string; label: string; sub: string };

function buildTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 11; h <= 22; h += 1) {
    const start12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const endH = h + 1;
    const end12 = endH > 12 ? endH - 12 : endH === 0 ? 12 : endH;
    const startMer = h >= 12 ? "PM" : "AM";
    const endMer = endH >= 12 ? "PM" : "AM";
    slots.push(`${start12}:00 ${startMer} - ${end12}:00 ${endMer}`);
  }
  return slots;
}

export function StoreScheduleSheet({
  visible,
  onClose,
  storeName,
  onConfirm,
}: StoreScheduleSheetProps) {
  const { height: winH } = useWindowDimensions();
  const slotScrollMaxH = Math.round(winH * 0.34);

  const days = useMemo((): DayOption[] => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    return [
      { id: "today", label: "Today", sub: fmt(now) },
      { id: "tomorrow", label: "Tomorrow", sub: fmt(tomorrow) },
    ];
  }, [visible]);

  const slots = useMemo(() => buildTimeSlots(), []);
  const [selectedDay, setSelectedDay] = useState(days[0]?.id ?? "today");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const handleConfirm = () => {
    if (!selectedSlot) return;
    const day = days.find((d) => d.id === selectedDay);
    const label = `${day?.label ?? "Today"} · ${selectedSlot}`;
    onConfirm?.(label);
    onClose();
  };

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.88}>
      <View style={styles.handle} />
      <Text style={styles.title}>Schedule for later</Text>
      <Text style={styles.sub}>{storeName}</Text>

      <Text style={styles.sectionLabel}>Select day</Text>
      <View style={styles.dayRow}>
        {days.map((d) => {
          const active = selectedDay === d.id;
          return (
            <TouchableOpacity
              key={d.id}
              style={[styles.dayChip, active && styles.dayChipActive]}
              onPress={() => setSelectedDay(d.id)}
              activeOpacity={0.85}
            >
              <Text style={[styles.dayChipLabel, active && styles.dayChipLabelActive]}>{d.label}</Text>
              <Text style={[styles.dayChipSub, active && styles.dayChipSubActive]}>{d.sub}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Select time slot</Text>
      <ScrollView
        style={[styles.slotList, { maxHeight: slotScrollMaxH }]}
        contentContainerStyle={styles.slotListContent}
        showsVerticalScrollIndicator={false}
      >
        {slots.map((slot) => {
          const active = selectedSlot === slot;
          return (
            <TouchableOpacity
              key={slot}
              style={[styles.slotRow, active && styles.slotRowActive]}
              onPress={() => setSelectedSlot(slot)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={active ? "radio-button-on" : "radio-button-off"}
                size={18}
                color={active ? StoreTheme.accentMint : StoreTheme.textMuted}
              />
              <Text style={[styles.slotText, active && styles.slotTextActive]}>{slot}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        style={[styles.confirmBtn, !selectedSlot && styles.confirmBtnDisabled]}
        onPress={handleConfirm}
        disabled={!selectedSlot}
        activeOpacity={0.9}
      >
        <Text style={styles.confirmBtnText}>Confirm schedule</Text>
      </TouchableOpacity>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    paddingHorizontal: 16,
  },
  sub: {
    fontSize: 13,
    color: StoreTheme.textSecondary,
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  dayRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
    paddingHorizontal: 16,
  },
  dayChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: StoreTheme.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  dayChipActive: {
    borderColor: StoreTheme.accentMint,
    backgroundColor: StoreTheme.accentMintSoft,
  },
  dayChipLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
  },
  dayChipLabelActive: {
    color: StoreTheme.accentMintDark,
  },
  dayChipSub: {
    fontSize: 11,
    color: StoreTheme.textSecondary,
    marginTop: 2,
  },
  dayChipSubActive: {
    color: StoreTheme.accentMintDark,
  },
  slotList: {
    marginBottom: 14,
  },
  slotListContent: {
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: StoreTheme.border,
  },
  slotRowActive: {
    borderColor: StoreTheme.accentMint,
    backgroundColor: StoreTheme.accentMintSoft,
  },
  slotText: {
    fontSize: 14,
    fontWeight: "500",
    color: StoreTheme.textPrimary,
  },
  slotTextActive: {
    fontWeight: "700",
    color: StoreTheme.accentMintDark,
  },
  confirmBtn: {
    backgroundColor: StoreTheme.accentMint,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
    marginHorizontal: 16,
  },
  confirmBtnDisabled: {
    backgroundColor: "#D1D5DB",
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});
