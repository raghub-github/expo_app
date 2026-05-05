import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Platform,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, BUTTON_RADIUS, CARD_RADIUS } from "@/constants/theme";

const LIGHT = {
  bg: "#FFFFFF",
  text: "#111827",
  subtext: "#6B7280",
  muted: "#9CA3AF",
  border: "#E5E7EB",
  divider: "#EEF2F7",
};

// Optional native picker (works when module is available).
let NativeDateTimePicker: React.ComponentType<any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  NativeDateTimePicker = require("@react-native-community/datetimepicker").default;
} catch {
  NativeDateTimePicker = null;
}

export type OutOfStockMode = "HOURS" | "NEXT_OPEN" | "CUSTOM" | "MANUAL";

export type OutOfStockPayload =
  | { mode: "HOURS"; hours: number }
  | { mode: "NEXT_OPEN" }
  | { mode: "CUSTOM"; until: string }
  | { mode: "MANUAL" };

function formatDate(d: Date): string {
  const day = d.getDate();
  const month = d.toLocaleString("en-IN", { month: "short" });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function formatTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const am = h < 12;
  const h12 = h % 12 || 12;
  const min = m < 10 ? `0${m}` : String(m);
  return `${h12}:${min} ${am ? "AM" : "PM"}`;
}

export function OutOfStockModal({
  visible,
  title,
  subtitle,
  helperText,
  confirmLabel = "Confirm",
  hoursDefault = 5,
  onClose,
  onConfirm,
  busy,
}: {
  visible: boolean;
  title: string;
  subtitle?: string | null;
  helperText?: string | null;
  confirmLabel?: string;
  hoursDefault?: number;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (payload: OutOfStockPayload) => void;
}) {
  const [mode, setMode] = useState<OutOfStockMode>("HOURS");
  const [hours, setHours] = useState(Math.max(1, Math.min(24 * 14, Math.floor(hoursDefault))));
  const [customUntil, setCustomUntil] = useState<Date>(() => new Date(Date.now() + 60 * 60 * 1000));
  const [customTouched, setCustomTouched] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const slideY = useRef(new Animated.Value(32)).current;

  const payload: OutOfStockPayload | null = useMemo(() => {
    if (mode === "HOURS") return { mode: "HOURS", hours };
    if (mode === "NEXT_OPEN") return { mode: "NEXT_OPEN" };
    if (mode === "CUSTOM") return { mode: "CUSTOM", until: customUntil.toISOString() };
    if (mode === "MANUAL") return { mode: "MANUAL" };
    return null;
  }, [mode, hours, customUntil]);

  const canConfirm = payload != null && !busy;

  // Reset defaults whenever sheet opens.
  useEffect(() => {
    if (!visible) return;
    // Merchant app expectation: toggle-off should map to manual OOS by default.
    setMode("MANUAL");
    setCustomTouched(false);
    setCustomUntil(new Date(Date.now() + 60 * 60 * 1000));
    Animated.timing(slideY, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, slideY]);

  // Auto-advance custom time while user hasn't changed it.
  useEffect(() => {
    if (!visible) return;
    if (customTouched) return;
    const t = setInterval(() => {
      setCustomUntil(new Date(Date.now() + 60 * 60 * 1000));
    }, 60 * 1000);
    return () => clearInterval(t);
  }, [visible, customTouched]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
          {/* Center close (like design) */}
          <TouchableOpacity
            onPress={onClose}
            hitSlop={12}
            style={styles.floatingClose}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={18} color={LIGHT.text} />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
          </View>

          <View style={styles.optionBlock}>
            {/* For specific time */}
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => setMode("HOURS")}
              activeOpacity={0.9}
            >
              <View style={styles.optionRowLeft}>
                <Text style={styles.optionText}>For specific time</Text>
              </View>
              <View style={styles.optionRowRight}>
                <View style={[styles.stepperInline, mode !== "HOURS" && styles.inlineDisabled]}>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      setHours((h) => Math.max(1, h - 1));
                    }}
                    style={styles.stepBtnCircle}
                    disabled={mode !== "HOURS"}
                  >
                    <Ionicons name="remove" size={16} color={LIGHT.text} />
                  </TouchableOpacity>
                  <Text style={styles.stepValueInline}>
                    {hours} hour
                    {hours !== 1 ? "s" : ""}
                  </Text>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      setHours((h) => Math.min(24 * 14, h + 1));
                    }}
                    style={styles.stepBtnCircle}
                    disabled={mode !== "HOURS"}
                  >
                    <Ionicons name="add" size={16} color={LIGHT.text} />
                  </TouchableOpacity>
                </View>
                <View style={[styles.radioRight, mode === "HOURS" && styles.radioRightOn]}>
                  {mode === "HOURS" ? <View style={styles.radioRightDot} /> : null}
                </View>
              </View>
            </TouchableOpacity>

            {/* Next business day */}
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => setMode("NEXT_OPEN")}
              activeOpacity={0.9}
            >
              <View style={styles.optionRowLeft}>
                <Text style={styles.optionText}>Next business day · Opening time</Text>
              </View>
              <View style={styles.optionRowRight}>
                <View style={[styles.radioRight, mode === "NEXT_OPEN" && styles.radioRightOn]}>
                  {mode === "NEXT_OPEN" ? <View style={styles.radioRightDot} /> : null}
                </View>
              </View>
            </TouchableOpacity>

            {/* Custom date & time (ALWAYS expanded) */}
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => setMode("CUSTOM")}
              activeOpacity={0.9}
            >
              <View style={styles.optionRowLeft}>
                <Text style={styles.optionText}>Custom date & time</Text>
              </View>
              <View style={styles.optionRowRight}>
                <View style={[styles.radioRight, mode === "CUSTOM" && styles.radioRightOn]}>
                  {mode === "CUSTOM" ? <View style={styles.radioRightDot} /> : null}
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.customRow}>
              <TouchableOpacity
                style={styles.dropdown}
                onPress={() => {
                  setMode("CUSTOM");
                  setCustomTouched(true);
                  setShowDate(true);
                }}
                disabled={NativeDateTimePicker == null}
                activeOpacity={0.9}
              >
                <Text style={styles.dropdownText}>{formatDate(customUntil)}</Text>
                <Ionicons name="chevron-down" size={16} color={LIGHT.subtext} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dropdown}
                onPress={() => {
                  setMode("CUSTOM");
                  setCustomTouched(true);
                  setShowTime(true);
                }}
                disabled={NativeDateTimePicker == null}
                activeOpacity={0.9}
              >
                <Text style={styles.dropdownText}>{formatTime(customUntil)}</Text>
                <Ionicons name="chevron-down" size={16} color={LIGHT.subtext} />
              </TouchableOpacity>
              {NativeDateTimePicker == null ? (
                <Text style={styles.helperTextMuted}>Custom picker not available on this device.</Text>
              ) : null}
            </View>

            {/* Manual */}
            <TouchableOpacity
              style={[styles.optionRow, styles.optionRowLast]}
              onPress={() => setMode("MANUAL")}
              activeOpacity={0.9}
            >
              <View style={styles.optionRowLeft}>
                <Text style={styles.optionText}>I will turn it on manually</Text>
                <Text style={styles.optionHint}>
                  Item won&apos;t be visible to customers until you mark it back in stock
                </Text>
              </View>
              <View style={styles.optionRowRight}>
                <View style={[styles.radioRight, mode === "MANUAL" && styles.radioRightOn]}>
                  {mode === "MANUAL" ? <View style={styles.radioRightDot} /> : null}
                </View>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity onPress={onClose} style={styles.backBtn} disabled={busy}>
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (!payload) return;
                void Promise.resolve(onConfirm(payload)).catch(() => {
                  /* errors surfaced by parent (e.g. Alert) */
                });
              }}
              style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
              disabled={!canConfirm}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>{confirmLabel}</Text>
              )}
            </TouchableOpacity>
          </View>

          {NativeDateTimePicker && showDate ? (
            <NativeDateTimePicker
              value={customUntil}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={(event: any, d?: Date) => {
                // Android fires onChange with {type:'dismissed'} and {type:'set'}.
                // iOS fires continuously; treat any valid date as a set.
                const type = event?.type as string | undefined;
                if (Platform.OS === "android" && type && type !== "set") {
                  setShowDate(false);
                  return;
                }
                if (d) {
                  setCustomTouched(true);
                  const next = new Date(customUntil);
                  next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                  setCustomUntil(next);
                }
                setShowDate(false);
              }}
            />
          ) : null}
          {NativeDateTimePicker && showTime ? (
            <NativeDateTimePicker
              value={customUntil}
              mode="time"
              is24Hour={false}
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(event: any, d?: Date) => {
                const type = event?.type as string | undefined;
                if (Platform.OS === "android" && type && type !== "set") {
                  setShowTime(false);
                  return;
                }
                if (d) {
                  setCustomTouched(true);
                  const next = new Date(customUntil);
                  next.setHours(d.getHours(), d.getMinutes(), 0, 0);
                  setCustomUntil(next);
                }
                setShowTime(false);
              }}
            />
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: LIGHT.bg,
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: LIGHT.border,
    ...GatiMitraMerchant.shadowCard,
  },
  handleWrap: { alignItems: "center", paddingTop: 6, paddingBottom: 10 },
  handle: { width: 44, height: 5, borderRadius: 999, backgroundColor: LIGHT.border },
  floatingClose: {
    position: "absolute",
    top: -22,
    alignSelf: "center",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: LIGHT.bg,
    borderWidth: 1,
    borderColor: LIGHT.border,
    alignItems: "center",
    justifyContent: "center",
    ...GatiMitraMerchant.shadowSm,
  },
  header: { paddingTop: 8, paddingBottom: 10 },
  title: { fontSize: 16, fontWeight: "800", color: LIGHT.text, textAlign: "center" },
  subtitle: { marginTop: 6, fontSize: 12, color: LIGHT.subtext, textAlign: "center" },
  helperText: { marginTop: 8, fontSize: 12, color: LIGHT.subtext, lineHeight: 17, textAlign: "center" },
  optionBlock: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: LIGHT.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: LIGHT.bg,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: LIGHT.divider,
    backgroundColor: LIGHT.bg,
  },
  optionRowLast: { borderBottomWidth: 0 },
  optionRowLeft: { flex: 1, minWidth: 0, paddingRight: 10 },
  optionRowRight: { flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 0 },
  optionText: { fontSize: 13, fontWeight: "700", color: LIGHT.text },
  optionHint: { marginTop: 3, fontSize: 11, color: LIGHT.subtext },
  radioRight: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: LIGHT.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioRightOn: { borderColor: GatiMitraMerchant.primary },
  radioRightDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: GatiMitraMerchant.primary },
  stepperInline: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 0 },
  inlineDisabled: { opacity: 0.45 },
  stepBtnCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: LIGHT.border,
    backgroundColor: LIGHT.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  stepValueInline: { fontSize: 12, fontWeight: "700", color: LIGHT.text, minWidth: 62, textAlign: "center" },
  customRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: LIGHT.bg,
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: LIGHT.border,
    backgroundColor: LIGHT.bg,
  },
  dropdownText: { fontSize: 12, fontWeight: "700", color: LIGHT.text },
  helperTextMuted: { fontSize: 11, color: LIGHT.muted },
  footer: { flexDirection: "row", gap: 12, marginTop: 16 },
  backBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BUTTON_RADIUS,
    alignItems: "center",
    backgroundColor: LIGHT.bg,
    borderWidth: 1,
    borderColor: LIGHT.border,
  },
  backBtnText: { fontSize: 14, fontWeight: "800", color: LIGHT.subtext },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BUTTON_RADIUS,
    alignItems: "center",
    backgroundColor: GatiMitraMerchant.primary,
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontSize: 14, fontWeight: "800", color: "#fff" },
});

