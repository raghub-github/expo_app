/**
 * Order history date range — Zomato-style preset list + full-screen calendar for custom.
 */

import { useCallback, useEffect, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Modal, Pressable, Platform, ScrollView, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";
import {
  type DateRangePresetId,
  type OrderDateRange,
  buildPresetRange,
  presetLabel,
  presetSubtitle,
  formatRangeSubtitle,
  formatDateBarLabel,
} from "@/lib/orderDateRange";
import { RangeCalendarPicker } from "@/components/order/RangeCalendarPicker";

const PRESETS: DateRangePresetId[] = [
  "last_2_days",
  "this_week",
  "last_week",
  "last_30_days",
];

type SheetStep = "presets" | "calendar";

type Props = {
  visible: boolean;
  value: OrderDateRange;
  onClose: () => void;
  onApply: (range: OrderDateRange) => void;
};

export function OrderDateRangeSheet({ visible, value, onClose, onApply }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [step, setStep] = useState<SheetStep>("presets");
  const [draftPreset, setDraftPreset] = useState<DateRangePresetId>(value.preset);
  const [customStart, setCustomStart] = useState(value.startMs);
  const [customEnd, setCustomEnd] = useState(value.endMs);

  const sync = useCallback(() => {
    setDraftPreset(value.preset);
    setCustomStart(value.startMs);
    setCustomEnd(value.endMs);
    setStep("presets");
  }, [value]);

  useEffect(() => {
    if (visible) sync();
  }, [visible, sync]);

  const selectPreset = (preset: DateRangePresetId) => {
    setDraftPreset(preset);
    if (preset !== "custom") {
      const r = buildPresetRange(preset);
      setCustomStart(r.startMs);
      setCustomEnd(r.endMs);
    }
  };

  const openCustomCalendar = () => {
    setDraftPreset("custom");
    setStep("calendar");
  };

  const handleApply = () => {
    if (draftPreset === "custom") {
      onApply({
        preset: "custom",
        startMs: Math.min(customStart, customEnd),
        endMs: Math.max(customStart, customEnd),
      });
    } else {
      onApply(buildPresetRange(draftPreset));
    }
    onClose();
  };

  const calendarPadding = 32;
  const calendarWidth = windowWidth - calendarPadding;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.dismissArea} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheetWrap}>
          <Pressable onPress={onClose} style={styles.closeFab} hitSlop={12}>
            <Ionicons name="close" size={22} color={GatiMitraMerchant.textPrimary} />
          </Pressable>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Text style={styles.title}>
              {step === "calendar" ? "Select date range" : "Select date range"}
            </Text>

            {step === "presets" ? (
              <>
                <ScrollView
                  style={styles.presetList}
                  contentContainerStyle={styles.presetListContent}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  {PRESETS.map((preset) => {
                    const active = draftPreset === preset;
                    return (
                      <Pressable
                        key={preset}
                        onPress={() => selectPreset(preset)}
                        style={({ pressed }) => [
                          styles.presetRow,
                          pressed && styles.presetRowPressed,
                        ]}
                      >
                        <View style={styles.presetRowText}>
                          <Text style={styles.presetTitle}>{presetLabel(preset)}</Text>
                          <Text style={styles.presetSub}>{presetSubtitle(preset)}</Text>
                        </View>
                        <View style={[styles.radio, active && styles.radioOn]}>
                          {active ? <View style={styles.radioDot} /> : null}
                        </View>
                      </Pressable>
                    );
                  })}

                  <Pressable
                    onPress={openCustomCalendar}
                    style={({ pressed }) => [
                      styles.presetRow,
                      styles.customRow,
                      draftPreset === "custom" && styles.presetRowActive,
                      pressed && styles.presetRowPressed,
                    ]}
                  >
                    <View style={styles.presetRowText}>
                      <Text style={styles.presetTitle}>Custom date range</Text>
                      <Text style={styles.presetSub}>
                        {draftPreset === "custom"
                          ? formatRangeSubtitle(new Date(customStart), new Date(customEnd))
                          : "Select your own date range"}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={GatiMitraMerchant.textTertiary}
                    />
                  </Pressable>
                </ScrollView>

                <View style={styles.footer}>
                  <Pressable
                    onPress={handleApply}
                    style={({ pressed }) => [styles.applyBtnFull, pressed && { opacity: 0.92 }]}
                  >
                    <Text style={styles.applyBtnFullText}>Apply</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.calendarPane, { paddingHorizontal: 16 }]}>
                  <RangeCalendarPicker
                    layoutWidth={calendarWidth}
                    startMs={customStart}
                    endMs={customEnd}
                    onChange={(s, e) => {
                      setCustomStart(s);
                      setCustomEnd(e);
                    }}
                  />
                </View>
                <View style={styles.calendarFooter}>
                  <Pressable
                    onPress={() => setStep("presets")}
                    style={({ pressed }) => [styles.textActionBtn, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.textActionBtnText}>CANCEL</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleApply}
                    style={({ pressed }) => [styles.textActionBtn, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.textActionBtnText}>OK</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Compact bar shown above order list on history page. */
export function OrderDateRangeBar({
  range,
  onPress,
}: {
  range: OrderDateRange;
  onPress: () => void;
}) {
  const line = formatDateBarLabel(range);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [barStyles.bar, pressed && { opacity: 0.94 }]}
    >
      <Ionicons
        name="calendar-outline"
        size={18}
        color={GatiMitraMerchant.textSecondary}
        style={barStyles.calIcon}
      />
      <Text style={barStyles.lineText} numberOfLines={1}>
        {line}
      </Text>
      <Ionicons name="chevron-down" size={18} color={GatiMitraMerchant.textTertiary} />
    </Pressable>
  );
}

const barStyles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: "#FFFFFF",
    gap: 8,
  },
  calIcon: { flexShrink: 0 },
  lineText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  dismissArea: { flex: 1 },
  sheetWrap: { maxHeight: "92%" },
  closeFab: {
    alignSelf: "center",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
    maxHeight: "88%",
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  presetList: {
    flexGrow: 0,
    maxHeight: 420,
  },
  presetListContent: {
    paddingBottom: 8,
  },
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.border,
    gap: 12,
  },
  presetRowPressed: {
    backgroundColor: "#F8FAFC",
  },
  presetRowActive: {
    backgroundColor: "#F0FDF4",
  },
  customRow: {
    borderBottomWidth: 0,
  },
  presetRowText: {
    flex: 1,
    minWidth: 0,
  },
  presetTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  presetSub: {
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    marginTop: 4,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  radioOn: {
    borderColor: GatiMitraMerchant.primary,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GatiMitraMerchant.primary,
  },
  calendarPane: {
    paddingTop: 8,
    paddingBottom: 4,
    minHeight: 380,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.border,
  },
  applyBtnFull: {
    backgroundColor: GatiMitraMerchant.textPrimary,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  applyBtnFullText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  calendarFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 24,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.border,
  },
  textActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  textActionBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: GatiMitraMerchant.primary,
    letterSpacing: 0.5,
  },
});
