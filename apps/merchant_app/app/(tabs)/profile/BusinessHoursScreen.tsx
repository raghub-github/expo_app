import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS, BUTTON_RADIUS } from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { getOperatingHours, updateOperatingHours, type OperatingHours, type DaySlots } from "@/services/outletApi";

const DAY_KEYS: Array<{ key: keyof OperatingHours; label: string }> = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

function isDayKey(key: keyof OperatingHours): key is DayKey {
  return ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].includes(key as string);
}

function formatTime(time: string | null): string {
  if (!time) return "--";
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr ?? "0");
  if (!Number.isFinite(h)) return time;
  const isPM = h >= 12;
  const displayH = ((h + 11) % 12) + 1;
  const displayM = m.toString().padStart(2, "0");
  const suffix = isPM ? "pm" : "am";
  return `${displayH}:${displayM} ${suffix}`;
}

function formatRange(start: string | null, end: string | null): string {
  if (!start && !end) return "—";
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function durationLabel(start: string | null, end: string | null): string {
  if (!start || !end) return "";
  const [sh, sm] = start.split(":").map((x) => Number(x));
  const [eh, em] = end.split(":").map((x) => Number(x));
  if (![sh, sm, eh, em].every((x) => Number.isFinite(x))) return "";
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (endMin <= startMin) return "";
  const diff = endMin - startMin;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h && m) return `${h} hrs ${m} min`;
  if (h) return `${h} hrs`;
  if (m) return `${m} min`;
  return "";
}

type LocalDay = DaySlots & { hasSecond: boolean };

type LocalState = {
  is_24_hours: boolean;
  days: Record<DayKey, LocalDay>;
};

type SlotModalState = {
  visible: boolean;
  dayKey: DayKey;
  slot: 1 | 2;
  start: string;
  end: string;
};

type CloseWarningState = {
  visible: boolean;
  dayKey: DayKey;
};

function makeEmptyDay(): LocalDay {
  return {
    open: false,
    slot1_start: null,
    slot1_end: null,
    slot2_start: null,
    slot2_end: null,
    hasSecond: false,
  };
}

function fromApi(hours: OperatingHours | null): LocalState {
  const days: Record<DayKey, LocalDay> = {
    monday: makeEmptyDay(),
    tuesday: makeEmptyDay(),
    wednesday: makeEmptyDay(),
    thursday: makeEmptyDay(),
    friday: makeEmptyDay(),
    saturday: makeEmptyDay(),
    sunday: makeEmptyDay(),
  };
  if (!hours) return { is_24_hours: false, days };
  for (const d of DAY_KEYS) {
    const k = d.key;
    if (!isDayKey(k)) continue;
    const src = hours[k] as DaySlots;
    days[k] = {
      open: !!src.open,
      slot1_start: src.slot1_start,
      slot1_end: src.slot1_end,
      slot2_start: src.slot2_start,
      slot2_end: src.slot2_end,
      hasSecond: !!(src.slot2_start || src.slot2_end),
    };
  }
  return { is_24_hours: !!hours.is_24_hours, days };
}

function toApiPayload(local: LocalState): { is_24_hours: boolean; days: Record<string, DaySlots> } {
  const days: Record<string, DaySlots> = {};
  for (const d of DAY_KEYS) {
    const key = d.key as DayKey;
    const src = local.days[key];
    days[d.key] = {
      open: src.open,
      slot1_start: src.open ? src.slot1_start : null,
      slot1_end: src.open ? src.slot1_end : null,
      slot2_start: src.open && src.hasSecond ? src.slot2_start : null,
      slot2_end: src.open && src.hasSecond ? src.slot2_end : null,
    };
  }
  return { is_24_hours: local.is_24_hours, days };
}

function normalizeTimeInput(raw: string): string {
  let t = raw.trim();
  if (!t) return "";
  // Allow 12.00 or 1200 style input from number pad
  t = t.replace(/\./g, ":");
  let m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) {
    const compact = /^(\d{3,4})$/.exec(t);
    if (compact) {
      const digits = compact[1];
      const hPart = digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2);
      const mPart = digits.slice(-2);
      m = [digits, hPart, mPart] as any;
    }
  }
  if (!m) return t;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm) || mm < 0 || mm > 59) return t;
  if (h < 0 || h > 23) return t;
  return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

function toDbTime(raw: string): string | null {
  const t = normalizeTimeInput(raw);
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) return null;
  return `${m[1]}:${m[2]}:00`;
}

export default function BusinessHoursScreen() {
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();
  const storeId = selectedStore?.id ?? null;

  const [local, setLocal] = useState<LocalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotModal, setSlotModal] = useState<SlotModalState | null>(null);
  const [closeWarning, setCloseWarning] = useState<CloseWarningState | null>(null);

  useEffect(() => {
    if (!storeId || !token) {
      setLoading(false);
      if (!token) setError("Not signed in.");
      else if (!storeId) setError("No store selected.");
      return;
    }
    let cancelled = false;
    getOperatingHours(storeId, token)
      .then((h) => {
        if (cancelled) return;
        setLocal(fromApi(h));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load hours");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, token]);

  const syncToBackend = async (next: LocalState, showToast: boolean) => {
    if (!storeId || !token) {
      setLocal(next);
      return;
    }
    setSaving(true);
    setLocal(next);
    try {
      await updateOperatingHours(storeId, toApiPayload(next), token);
      const fresh = await getOperatingHours(storeId, token);
      setLocal(fromApi(fresh));
      if (showToast) {
        Alert.alert("Saved", "Business hours updated.");
      }
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Could not update business hours.");
    } finally {
      setSaving(false);
    }
  };

  const requestToggleOpen = (dayKey: DayKey) => {
    if (!local) return;
    const day = local.days[dayKey];
    if (day.open) {
      // warn before closing
      setCloseWarning({ visible: true, dayKey });
    } else {
      const next: LocalState = {
        ...local,
        days: {
          ...local.days,
          [dayKey]: { ...day, open: true },
        },
      };
      syncToBackend(next, false);
    }
  };

  const confirmCloseDay = () => {
    if (!local || !closeWarning) return;
    const { dayKey } = closeWarning;
    const cur = local.days[dayKey];
    const updated: LocalDay = {
      open: false,
      slot1_start: null,
      slot1_end: null,
      slot2_start: null,
      slot2_end: null,
      hasSecond: false,
    };
    const next: LocalState = {
      ...local,
      // When any single day is marked closed, disable 24/7 mode so
      // remaining days can use individual slots again.
      is_24_hours: false,
      days: {
        ...local.days,
        [dayKey]: updated,
      },
    };
    setCloseWarning(null);
    syncToBackend(next, false);
  };

  const openSlotEditor = (dayKey: DayKey, slot: 1 | 2) => {
    if (!local) return;
    const day = local.days[dayKey];
    const start = (slot === 1 ? day.slot1_start : day.slot2_start) ?? "";
    const end = (slot === 1 ? day.slot1_end : day.slot2_end) ?? "";
    setSlotModal({
      visible: true,
      dayKey,
      slot,
      start: start ? start.slice(0, 5) : "",
      end: end ? end.slice(0, 5) : "",
    });
  };

  const saveSlotFromModal = () => {
    if (!local || !slotModal) return;
    const startDb = toDbTime(slotModal.start);
    const endDb = toDbTime(slotModal.end);
    if (!startDb || !endDb) {
      Alert.alert("Invalid time", "Please enter times in HH:MM (24h) format.");
      return;
    }
    if (endDb <= startDb) {
      Alert.alert("Invalid range", "End time must be after start time.");
      return;
    }
    const { dayKey, slot } = slotModal;
    const day = local.days[dayKey];
    const updated: LocalDay = { ...day, open: true };
    if (slot === 1) {
      updated.slot1_start = startDb;
      updated.slot1_end = endDb;
    } else {
      updated.hasSecond = true;
      updated.slot2_start = startDb;
      updated.slot2_end = endDb;
    }
    const next: LocalState = {
      ...local,
      days: {
        ...local.days,
        [dayKey]: updated,
      },
    };
    setSlotModal(null);
    syncToBackend(next, true);
  };

  const removeSlot = (dayKey: DayKey, slot: 1 | 2) => {
    if (!local) return;
    const day = local.days[dayKey];
    const updated: LocalDay = { ...day };
    if (slot === 1) {
      updated.slot1_start = null;
      updated.slot1_end = null;
    } else {
      updated.hasSecond = false;
      updated.slot2_start = null;
      updated.slot2_end = null;
    }
    const next: LocalState = {
      ...local,
      days: {
        ...local.days,
        [dayKey]: updated,
      },
    };
    syncToBackend(next, true);
  };

  const toggle24Hours = () => {
    if (!local) return;
    const next: LocalState = { ...local, is_24_hours: !local.is_24_hours };
    syncToBackend(next, true);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
        <Text style={styles.loadingText}>Loading business hours…</Text>
      </View>
    );
  }

  if (error || !local) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={GatiMitraMerchant.textTertiary} />
        <Text style={styles.errorText}>{error ?? "Unable to load hours"}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={18} color={GatiMitraMerchant.textSecondary} />
          <Text style={styles.infoText}>Configure when your store accepts online orders.</Text>
        </View>

        <View style={styles.twentyFourCard}>
          <View style={styles.twentyFourLeft}>
            <Text style={styles.twentyFourTitle}>Open 24/7</Text>
            <Text style={styles.twentyFourSubtitle}>
              If enabled, your store will appear as always open. Day-wise slots are ignored.
            </Text>
          </View>
          <Pressable
            onPress={toggle24Hours}
            style={({ pressed }) => [
              styles.openToggle,
              local.is_24_hours ? styles.openToggleOn : styles.openToggleOff,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.openToggleThumb, local.is_24_hours && styles.openToggleThumbOn]} />
          </Pressable>
        </View>

        {DAY_KEYS.map((d) => {
          const day = local.days[d.key as DayKey] ?? makeEmptyDay();
          const isOpen = !!day.open;
          const slot1Duration = durationLabel(day.slot1_start, day.slot1_end);
          const slot2Duration = durationLabel(day.slot2_start, day.slot2_end);
          return (
            <View key={d.key} style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <View>
                  <Text style={styles.dayLabel}>{d.label}</Text>
                  <Text style={styles.daySubtitle}>{isOpen ? "Open" : "Closed"}</Text>
                </View>
                <Pressable
                  onPress={() => requestToggleOpen(d.key as DayKey)}
                  style={({ pressed }) => [
                    styles.openToggle,
                    isOpen ? styles.openToggleOn : styles.openToggleOff,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.openToggleThumb, isOpen && styles.openToggleThumbOn]} />
                </Pressable>
              </View>

              {isOpen && !local.is_24_hours && (
                <View style={styles.slotsWrap}>
                  {/* Slot 1 */}
                  <View style={styles.slotRow}>
                    <View style={styles.slotLeft}>
                      <Text style={styles.slotLabel}>Slot 1</Text>
                      <Text style={styles.slotTime}>{formatRange(day.slot1_start, day.slot1_end)}</Text>
                      {!!slot1Duration && <Text style={styles.slotDuration}>{slot1Duration}</Text>}
                    </View>
                    <View style={styles.slotActions}>
                      <Pressable
                        style={({ pressed }) => [styles.slotActionBtn, pressed && styles.pressed]}
                        onPress={() => openSlotEditor(d.key as DayKey, 1)}
                      >
                        <Text style={styles.slotActionText}>
                          {day.slot1_start || day.slot1_end ? "Edit" : "Add"}
                        </Text>
                      </Pressable>
                      {day.slot1_start || day.slot1_end ? (
                        <Pressable
                          style={({ pressed }) => [styles.slotActionBtn, pressed && styles.pressed]}
                          onPress={() => removeSlot(d.key as DayKey, 1)}
                        >
                          <Text style={styles.slotActionTextSecondary}>Remove</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.divider} />

                  {/* Slot 2 */}
                  <View style={styles.slotRow}>
                    <View style={styles.slotLeft}>
                      <Text style={styles.slotLabel}>Slot 2 (optional)</Text>
                      <Text style={styles.slotTime}>
                        {day.hasSecond ? formatRange(day.slot2_start, day.slot2_end) : "Not added"}
                      </Text>
                      {day.hasSecond && !!slot2Duration && (
                        <Text style={styles.slotDuration}>{slot2Duration}</Text>
                      )}
                    </View>
                    <View style={styles.slotActions}>
                      <Pressable
                        style={({ pressed }) => [styles.slotActionBtn, pressed && styles.pressed]}
                        onPress={() => openSlotEditor(d.key as DayKey, 2)}
                      >
                        <Text style={styles.slotActionText}>
                          {day.hasSecond ? "Edit" : "Add"}
                        </Text>
                      </Pressable>
                      {day.hasSecond && (
                        <Pressable
                          style={({ pressed }) => [styles.slotActionBtn, pressed && styles.pressed]}
                          onPress={() => removeSlot(d.key as DayKey, 2)}
                        >
                          <Text style={styles.slotActionTextSecondary}>Remove</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Warning modal for closing a day */}
      <Modal
        visible={!!closeWarning?.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setCloseWarning(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCloseWarning(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Close this day?</Text>
            <Text style={styles.modalMessage}>
              Customers will not be able to place orders on this day when it is closed.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, styles.modalBtnSecondary, pressed && styles.pressed]}
                onPress={() => setCloseWarning(null)}
              >
                <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, styles.modalBtnPrimary, pressed && styles.pressed]}
                onPress={confirmCloseDay}
              >
                <Text style={styles.modalBtnPrimaryText}>Yes, close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Slot edit modal */}
      <Modal
        visible={!!slotModal?.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setSlotModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSlotModal(null)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalKeyboard}
          >
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>
                {slotModal?.slot === 1 ? "Edit Slot 1" : "Edit Slot 2"} –{" "}
                {slotModal ? DAY_KEYS.find((d) => d.key === slotModal.dayKey)?.label : ""}
              </Text>
              <Text style={styles.modalMessageSmall}>Enter times in 24-hour HH:MM format.</Text>
              <View style={styles.timeInputsRow}>
                <View style={styles.timeInputWrap}>
                  <Text style={styles.timeInputLabel}>Start</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={slotModal?.start ?? ""}
                    onChangeText={(t) => setSlotModal((prev) => (prev ? { ...prev, start: t } : prev))}
                    keyboardType="number-pad"
                    placeholder="10:00"
                    placeholderTextColor={GatiMitraMerchant.textTertiary}
                  />
                </View>
                <View style={styles.timeInputWrap}>
                  <Text style={styles.timeInputLabel}>End</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={slotModal?.end ?? ""}
                    onChangeText={(t) => setSlotModal((prev) => (prev ? { ...prev, end: t } : prev))}
                    keyboardType="number-pad"
                    placeholder="22:30"
                    placeholderTextColor={GatiMitraMerchant.textTertiary}
                  />
                </View>
              </View>
              <View style={styles.modalActions}>
                <Pressable
                  style={({ pressed }) => [styles.modalBtn, styles.modalBtnSecondary, pressed && styles.pressed]}
                  onPress={() => setSlotModal(null)}
                >
                  <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.modalBtn, styles.modalBtnPrimary, pressed && styles.pressed]}
                  onPress={saveSlotFromModal}
                >
                  <Text style={styles.modalBtnPrimaryText}>Save</Text>
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: H_PADDING },
  loadingText: { marginTop: 12, fontSize: 14, color: GatiMitraMerchant.textSecondary },
  errorText: { marginTop: 12, fontSize: 15, color: GatiMitraMerchant.textSecondary, textAlign: "center" },

  scroll: { flex: 1 },
  scrollContent: { padding: H_PADDING, paddingBottom: 40 },

  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  infoText: { fontSize: 13, color: GatiMitraMerchant.textSecondary, flex: 1 },

  twentyFourCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 14,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  twentyFourLeft: { flex: 1, marginRight: 10 },
  twentyFourTitle: { fontSize: 14, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  twentyFourSubtitle: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },

  dayCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    marginBottom: 10,
  },
  dayHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayLabel: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  daySubtitle: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },

  openToggle: {
    width: 46,
    height: 26,
    borderRadius: 13,
    padding: 3,
    justifyContent: "center",
  },
  openToggleOn: { backgroundColor: GatiMitraMerchant.primary },
  openToggleOff: { backgroundColor: GatiMitraMerchant.border },
  openToggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#fff",
    alignSelf: "flex-start",
  },
  openToggleThumbOn: { alignSelf: "flex-end" },

  slotsWrap: { marginTop: 10 },
  slotRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  slotLeft: { flex: 1, marginRight: 10 },
  slotLabel: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  slotTime: { fontSize: 13, color: GatiMitraMerchant.textPrimary, marginTop: 2 },
  slotDuration: { fontSize: 11, color: GatiMitraMerchant.textTertiary, marginTop: 2 },
  slotActions: { alignItems: "flex-end", gap: 4 },
  slotActionBtn: { paddingVertical: 4, paddingHorizontal: 6 },
  slotActionText: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.primary },
  slotActionTextSecondary: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.error },

  divider: { height: 1, backgroundColor: GatiMitraMerchant.divider, marginVertical: 8 },

  twentyFourHint: { marginTop: 10 },
  twentyFourHintText: { fontSize: 12, color: GatiMitraMerchant.textSecondary },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalKeyboard: { width: "100%", maxWidth: 400 },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 18,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: GatiMitraMerchant.textPrimary, marginBottom: 8 },
  modalMessage: { fontSize: 14, color: GatiMitraMerchant.textSecondary, marginBottom: 14 },
  modalMessageSmall: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginBottom: 10 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 10 },
  modalBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: BUTTON_RADIUS,
    minWidth: 90,
    alignItems: "center",
  },
  modalBtnPrimary: { backgroundColor: GatiMitraMerchant.primary },
  modalBtnSecondary: { backgroundColor: GatiMitraMerchant.surfaceSubtle },
  modalBtnPrimaryText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  modalBtnSecondaryText: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textSecondary },

  timeInputsRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  timeInputWrap: { flex: 1 },
  timeInputLabel: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  timeInput: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
  },

  pressed: { opacity: 0.8 },
});

