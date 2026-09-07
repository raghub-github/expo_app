import { useEffect, useMemo, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { VEG_MODE_WEEKDAY_CHIPS, type VegModeStoreScope } from "@/lib/vegMode";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";

type Props = {
  visible: boolean;
  onClose: () => void;
  onApplied?: () => void;
};

/** Full Veg Mode settings — opened only from "More settings". */
export function VegModeSettingsSheet({ visible, onClose, onApplied }: Props) {
  const insets = useSafeAreaInsets();
  const storeScope = useDietaryPreferenceStore((s) => s.storeScope);
  const weekdays = useDietaryPreferenceStore((s) => s.weekdays);
  const applyVegMode = useDietaryPreferenceStore((s) => s.applyVegMode);

  const [draftScope, setDraftScope] = useState<VegModeStoreScope>("all_restaurants");
  const [daysMode, setDaysMode] = useState<"all" | "select">("all");
  const [draftDays, setDraftDays] = useState<number[]>([]);

  useEffect(() => {
    if (!visible) return;
    setDraftScope(storeScope);
    if (weekdays == null) {
      setDaysMode("all");
      setDraftDays([]);
    } else {
      setDaysMode("select");
      setDraftDays(weekdays);
    }
  }, [visible, storeScope, weekdays]);

  const canApply = daysMode === "all" || draftDays.length > 0;

  const apply = () => {
    if (!canApply) return;
    applyVegMode({
      storeScope: draftScope,
      weekdays: daysMode === "all" ? null : draftDays,
    });
    onClose();
    onApplied?.();
  };

  const toggleDay = (day: number) => {
    if (daysMode !== "select") return;
    setDraftDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const chips = useMemo(() => VEG_MODE_WEEKDAY_CHIPS, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, Platform.OS === "android" ? 16 : 12) },
          ]}
        >
          <View style={styles.handle} />

          <AppText style={styles.sectionTitle}>See veg dishes from</AppText>
          <RadioRow
            label="All restaurants"
            selected={draftScope === "all_restaurants"}
            onPress={() => setDraftScope("all_restaurants")}
          />
          <RadioRow
            label="Pure Veg restaurants only"
            selected={draftScope === "pure_veg_only"}
            onPress={() => setDraftScope("pure_veg_only")}
          />

          <AppText style={[styles.sectionTitle, styles.sectionGap]}>Select Veg Mode days</AppText>
          <RadioRow
            label="All days"
            selected={daysMode === "all"}
            onPress={() => setDaysMode("all")}
          />
          <RadioRow
            label="Select days of the week"
            selected={daysMode === "select"}
            onPress={() => setDaysMode("select")}
          />

          <View style={styles.daysRow}>
            {chips.map((chip, index) => {
              const on = daysMode === "select" && draftDays.includes(chip.day);
              const disabled = daysMode !== "select";
              return (
                <Pressable
                  key={`${chip.day}-${index}`}
                  onPress={() => toggleDay(chip.day)}
                  disabled={disabled}
                  style={[
                    styles.dayChip,
                    disabled && styles.dayChipDisabled,
                    on && styles.dayChipOn,
                  ]}
                >
                  <AppText style={[styles.dayChipText, on && styles.dayChipTextOn]}>{chip.label}</AppText>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[styles.applyBtn, !canApply && styles.applyBtnDisabled]}
            onPress={apply}
            disabled={!canApply}
          >
            <AppText style={styles.applyText}>Switch on Veg Mode</AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function RadioRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.radioRow} onPress={onPress}>
      <AppText style={styles.radioLabel}>{label}</AppText>
      <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
    </Pressable>
  );
}

const VEG_GREEN = "#22C55E";

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
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 14,
  },
  sectionGap: {
    marginTop: 18,
  },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  radioLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#1F2937",
    paddingRight: 12,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterOn: {
    borderColor: VEG_GREEN,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: VEG_GREEN,
  },
  daysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 20,
    gap: 8,
  },
  dayChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  dayChipDisabled: {
    opacity: 0.45,
  },
  dayChipOn: {
    backgroundColor: VEG_GREEN,
  },
  dayChipText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#6B7280",
  },
  dayChipTextOn: {
    color: "#FFFFFF",
  },
  applyBtn: {
    backgroundColor: VEG_GREEN,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  applyBtnDisabled: {
    opacity: 0.4,
  },
  applyText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
