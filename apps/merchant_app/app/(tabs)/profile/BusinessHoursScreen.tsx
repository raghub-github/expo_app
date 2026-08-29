import { useEffect, useMemo, useState, type ComponentType } from "react";
import { AppText as Text } from "@/components/AppText";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS, BUTTON_RADIUS } from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import {
  getOperatingHours,
  getOperatingHoursFresh,
  peekOperatingHoursCache,
  updateOperatingHours,
  type OperatingHours,
  type DaySlots,
} from "@/services/outletApi";

let NativeDateTimePicker: ComponentType<any> | null = null;
try {
  NativeDateTimePicker = require("@react-native-community/datetimepicker").default;
} catch {
  NativeDateTimePicker = null;
}

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
  return ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].includes(
    key as string
  );
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

function hhmmssFromDate(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
}

function dateFromTimeString(raw: string | null | undefined, fallbackH = 10, fallbackM = 0): Date {
  const d = new Date();
  const t = (raw ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (m) {
    d.setHours(Number(m[1]) || 0, Number(m[2]) || 0, 0, 0);
  } else {
    d.setHours(fallbackH, fallbackM, 0, 0);
  }
  return d;
}

type LocalDay = DaySlots & { hasSecond: boolean };

type LocalState = {
  is_24_hours: boolean;
  same_for_all_days: boolean;
  days: Record<DayKey, LocalDay>;
};

type SlotModalState = {
  visible: boolean;
  dayKey: DayKey;
  slot: 1 | 2;
  start: Date;
  end: Date;
};

type CloseWarningState = {
  visible: boolean;
  dayKey: DayKey;
};

type ActivePicker = "start" | "end" | null;

function todayKey(): DayKey {
  const idx = new Date().getDay();
  return (["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][idx] ??
    "monday") as DayKey;
}

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
  if (!hours) return { is_24_hours: false, same_for_all_days: false, days };
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
  return {
    is_24_hours: !!hours.is_24_hours,
    same_for_all_days: !!hours.same_for_all_days,
    days,
  };
}

function dayToSlots(src: LocalDay): DaySlots {
  return {
    open: src.open,
    slot1_start: src.slot1_start,
    slot1_end: src.slot1_end,
    slot2_start: src.hasSecond ? src.slot2_start : null,
    slot2_end: src.hasSecond ? src.slot2_end : null,
  };
}

export default function BusinessHoursScreen() {
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();
  const { refresh: refreshStoreStatus } = useStoreStatus();
  const storeId = selectedStore?.id ?? null;

  const [local, setLocal] = useState<LocalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotModal, setSlotModal] = useState<SlotModalState | null>(null);
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [closeWarning, setCloseWarning] = useState<CloseWarningState | null>(null);
  const [savedModal, setSavedModal] = useState<{ visible: boolean; message: string } | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<DayKey>>(
    () => new Set<DayKey>([todayKey()])
  );

  useEffect(() => {
    if (!storeId || !token) {
      setLoading(false);
      if (!token) setError("Not signed in.");
      else if (!storeId) setError("No store selected.");
      return;
    }
    setExpandedDays(new Set<DayKey>([todayKey()]));
    const cached = peekOperatingHoursCache(storeId);
    if (cached !== undefined) {
      setLocal(fromApi(cached));
      setLoading(false);
    } else {
      setLoading(true);
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

  /** Partnersite parity: PATCH only the day(s) that changed; backend merges the rest. */
  const syncDayToBackend = async (
    next: LocalState,
    dayKeysToSave: DayKey[],
    showToast: boolean
  ) => {
    if (!storeId || !token) {
      setLocal(next);
      return;
    }
    setSaving(true);
    setLocal(next);
    try {
      const days: Record<string, DaySlots> = {};
      for (const key of dayKeysToSave) {
        days[key] = dayToSlots(next.days[key]);
      }
      await updateOperatingHours(
        storeId,
        {
          is_24_hours: next.is_24_hours,
          same_for_all_days: next.same_for_all_days,
          days,
        },
        token
      );
      const fresh = await getOperatingHoursFresh(storeId, token);
      setLocal(fromApi(fresh));
      void refreshStoreStatus();
      if (showToast) {
        const label =
          dayKeysToSave.length === 1
            ? DAY_KEYS.find((d) => d.key === dayKeysToSave[0])?.label ?? "Day"
            : "Timings";
        setSavedModal({ visible: true, message: `${label} updated.` });
      }
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Could not update business hours.");
      try {
        const fresh = await getOperatingHoursFresh(storeId, token);
        setLocal(fromApi(fresh));
      } catch {
        /* keep optimistic local */
      }
    } finally {
      setSaving(false);
    }
  };

  const requestToggleOpen = (dayKey: DayKey) => {
    if (!local) return;
    const day = local.days[dayKey];
    if (day.open) {
      setCloseWarning({ visible: true, dayKey });
    } else {
      const next: LocalState = {
        ...local,
        same_for_all_days: false,
        days: {
          ...local.days,
          [dayKey]: { ...day, open: true },
        },
      };
      setExpandedDays((prev) => new Set<DayKey>([...prev, dayKey]));
      void syncDayToBackend(next, [dayKey], false);
    }
  };

  const confirmCloseDay = () => {
    if (!local || !closeWarning) return;
    const { dayKey } = closeWarning;
    const cur = local.days[dayKey];
    const next: LocalState = {
      ...local,
      is_24_hours: false,
      same_for_all_days: false,
      days: {
        ...local.days,
        [dayKey]: { ...cur, open: false },
      },
    };
    setCloseWarning(null);
    void syncDayToBackend(next, [dayKey], false);
  };

  const openSlotEditor = (dayKey: DayKey, slot: 1 | 2) => {
    if (!local) return;
    const day = local.days[dayKey];
    const startRaw = slot === 1 ? day.slot1_start : day.slot2_start;
    const endRaw = slot === 1 ? day.slot1_end : day.slot2_end;
    setActivePicker(null);
    setSlotModal({
      visible: true,
      dayKey,
      slot,
      start: dateFromTimeString(startRaw, 10, 0),
      end: dateFromTimeString(endRaw, 22, 0),
    });
  };

  const saveSlotFromModal = () => {
    if (!local || !slotModal) return;
    const startDb = hhmmssFromDate(slotModal.start);
    const endDb = hhmmssFromDate(slotModal.end);
    const startMin = slotModal.start.getHours() * 60 + slotModal.start.getMinutes();
    const endMin = slotModal.end.getHours() * 60 + slotModal.end.getMinutes();
    if (endMin <= startMin) {
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
    if (slot === 2 && updated.slot1_end) {
      const [h, m] = updated.slot1_end.split(":").map(Number);
      const slot1EndMin = h * 60 + m;
      if (startMin <= slot1EndMin) {
        Alert.alert("Invalid range", "Slot 2 must start after Slot 1 ends.");
        return;
      }
    }
    const next: LocalState = {
      ...local,
      is_24_hours: false,
      same_for_all_days: false,
      days: {
        ...local.days,
        [dayKey]: updated,
      },
    };
    setSlotModal(null);
    setActivePicker(null);
    void syncDayToBackend(next, [dayKey], true);
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
      same_for_all_days: false,
      days: {
        ...local.days,
        [dayKey]: updated,
      },
    };
    void syncDayToBackend(next, [dayKey], true);
  };

  const toggle24Hours = () => {
    if (!local) return;
    const turningOn = !local.is_24_hours;
    const next: LocalState = {
      ...local,
      is_24_hours: turningOn,
      same_for_all_days: turningOn ? false : local.same_for_all_days,
    };
    // 24/7 touches all day columns on the backend — send full week flags via is_24_hours only.
    void syncDayToBackend(next, turningOn ? [] : (Object.keys(next.days) as DayKey[]), true);
  };

  const dayLabel = useMemo(() => {
    if (!slotModal) return "";
    return DAY_KEYS.find((d) => d.key === slotModal.dayKey)?.label ?? "";
  }, [slotModal]);

  const onNativeTimeChange = ( whichtime: "start" | "end", event: { type?: string }, date?: Date) => {
    if (Platform.OS === "android") {
      setActivePicker(null);
      if (event?.type === "dismissed" || !date) return;
    }
    if (!date) return;
    setSlotModal((prev) => {
      if (!prev) return prev;
      return whichtime === "start" ? { ...prev, start: date } : { ...prev, end: date };
    });
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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
            disabled={saving}
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
          const key = d.key as DayKey;
          const isExpanded = expandedDays.has(key);
          const slot1Summary = formatRange(day.slot1_start, day.slot1_end);
          const slot2Summary = day.hasSecond ? formatRange(day.slot2_start, day.slot2_end) : null;
          const hasAnySlot = !!(
            day.slot1_start ||
            day.slot1_end ||
            (day.hasSecond && (day.slot2_start || day.slot2_end))
          );
          return (
            <View key={d.key} style={styles.dayCard}>
              <View style={styles.dayHeaderRow}>
                <Pressable
                  onPress={() =>
                    setExpandedDays((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  style={({ pressed }) => [
                    styles.dayHeaderLeft,
                    pressed && styles.pressed,
                    GatiMitraMerchant.cursorPointer,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Toggle ${d.label} time slots`}
                >
                  <View style={styles.dayTitleCol}>
                    <Text style={styles.dayLabel}>{d.label}</Text>
                    <Text style={styles.daySubtitle}>
                      {isOpen ? "Open" : "Closed"}
                      {hasAnySlot
                        ? ` • ${slot1Summary}${slot2Summary ? `, ${slot2Summary}` : ""}`
                        : ""}
                    </Text>
                  </View>
                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={GatiMitraMerchant.textTertiary}
                  />
                </Pressable>

                <View style={styles.dayHeaderRight}>
                  <Text
                    style={[
                      styles.openPillText,
                      isOpen ? styles.openPillTextOn : styles.openPillTextOff,
                    ]}
                  >
                    {isOpen ? "Open" : "Closed"}
                  </Text>
                  <Pressable
                    onPress={() => requestToggleOpen(key)}
                    disabled={saving}
                    style={({ pressed }) => [
                      styles.openToggle,
                      isOpen ? styles.openToggleOn : styles.openToggleOff,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.openToggleThumb, isOpen && styles.openToggleThumbOn]} />
                  </Pressable>
                </View>
              </View>

              {isExpanded && isOpen && !local.is_24_hours && (
                <View style={styles.slotsWrapZomato}>
                  <View style={styles.slotRowZ}>
                    <View style={styles.slotLeft}>
                      <Text style={styles.slotLabel}>Slot 1</Text>
                      <Text style={styles.slotTimeZ}>
                        {formatRange(day.slot1_start, day.slot1_end)}
                      </Text>
                      {!!slot1Duration && <Text style={styles.slotDuration}>{slot1Duration}</Text>}
                    </View>
                    <View style={styles.slotActions}>
                      <Pressable
                        style={({ pressed }) => [styles.slotActionBtn, pressed && styles.pressed]}
                        onPress={() => openSlotEditor(key, 1)}
                      >
                        <Text style={styles.slotActionText}>
                          {day.slot1_start || day.slot1_end ? "Edit" : "Add"}
                        </Text>
                      </Pressable>
                      {day.slot1_start || day.slot1_end ? (
                        <Pressable
                          style={({ pressed }) => [styles.slotActionBtn, pressed && styles.pressed]}
                          onPress={() => removeSlot(key, 1)}
                        >
                          <Text style={styles.slotActionTextSecondary}>Remove</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.slotRowZ}>
                    <View style={styles.slotLeft}>
                      <Text style={styles.slotLabel}>Slot 2 (optional)</Text>
                      <Text style={styles.slotTimeZ}>
                        {day.hasSecond ? formatRange(day.slot2_start, day.slot2_end) : "Not added"}
                      </Text>
                      {day.hasSecond && !!slot2Duration && (
                        <Text style={styles.slotDuration}>{slot2Duration}</Text>
                      )}
                    </View>
                    <View style={styles.slotActions}>
                      <Pressable
                        style={({ pressed }) => [styles.slotActionBtn, pressed && styles.pressed]}
                        onPress={() => openSlotEditor(key, 2)}
                      >
                        <Text style={styles.slotActionText}>
                          {day.hasSecond ? "Edit" : "Add"}
                        </Text>
                      </Pressable>
                      {day.hasSecond && (
                        <Pressable
                          style={({ pressed }) => [styles.slotActionBtn, pressed && styles.pressed]}
                          onPress={() => removeSlot(key, 2)}
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
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnSecondary,
                  pressed && styles.pressed,
                ]}
                onPress={() => setCloseWarning(null)}
              >
                <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnPrimary,
                  pressed && styles.pressed,
                ]}
                onPress={confirmCloseDay}
              >
                <Text style={styles.modalBtnPrimaryText}>Yes, close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Saved confirmation (custom modal — not system Alert) */}
      <Modal
        visible={!!savedModal?.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setSavedModal(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSavedModal(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Saved</Text>
            <Text style={styles.modalMessage}>{savedModal?.message ?? "Timings updated."}</Text>
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnPrimary,
                  pressed && styles.pressed,
                ]}
                onPress={() => setSavedModal(null)}
              >
                <Text style={styles.modalBtnPrimaryText}>OK</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Slot editor — pick times with native clock, not HH:MM text fields */}
      <Modal
        visible={!!slotModal?.visible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSlotModal(null);
          setActivePicker(null);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setSlotModal(null);
            setActivePicker(null);
          }}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {slotModal?.slot === 1 ? "Edit Slot 1" : "Edit Slot 2"} – {dayLabel}
            </Text>
            <Text style={styles.modalMessageSmall}>Tap a time to open the clock picker.</Text>

            <View style={styles.timeInputsRow}>
              <View style={styles.timeInputWrap}>
                <Text style={styles.timeInputLabel}>Start</Text>
                <Pressable
                  style={({ pressed }) => [styles.timePickerBtn, pressed && styles.pressed]}
                  onPress={() => setActivePicker("start")}
                  disabled={NativeDateTimePicker == null}
                >
                  <Ionicons name="time-outline" size={18} color={GatiMitraMerchant.primary} />
                  <Text style={styles.timePickerBtnText}>
                    {slotModal ? formatTime(hhmmssFromDate(slotModal.start)) : "--"}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.timeInputWrap}>
                <Text style={styles.timeInputLabel}>End</Text>
                <Pressable
                  style={({ pressed }) => [styles.timePickerBtn, pressed && styles.pressed]}
                  onPress={() => setActivePicker("end")}
                  disabled={NativeDateTimePicker == null}
                >
                  <Ionicons name="time-outline" size={18} color={GatiMitraMerchant.primary} />
                  <Text style={styles.timePickerBtnText}>
                    {slotModal ? formatTime(hhmmssFromDate(slotModal.end)) : "--"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {NativeDateTimePicker == null ? (
              <Text style={styles.pickerUnavailable}>
                Time picker is not available on this device.
              </Text>
            ) : null}

            {/* iOS: spinner inside the sheet */}
            {Platform.OS === "ios" && NativeDateTimePicker && activePicker && slotModal ? (
              <View style={styles.iosPickerWrap}>
                <NativeDateTimePicker
                  value={activePicker === "start" ? slotModal.start : slotModal.end}
                  mode="time"
                  display="spinner"
                  onChange={(event: { type?: string }, date?: Date) =>
                    onNativeTimeChange(activePicker, event, date)
                  }
                />
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnSecondary,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  setSlotModal(null);
                  setActivePicker(null);
                }}
              >
                <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnPrimary,
                  pressed && styles.pressed,
                ]}
                onPress={saveSlotFromModal}
              >
                <Text style={styles.modalBtnPrimaryText}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Android: system time dialog */}
      {Platform.OS === "android" &&
        NativeDateTimePicker &&
        activePicker &&
        slotModal && (
          <NativeDateTimePicker
            value={activePicker === "start" ? slotModal.start : slotModal.end}
            mode="time"
            display="default"
            is24Hour={false}
            onChange={(event: { type?: string }, date?: Date) =>
              onNativeTimeChange(activePicker, event, date)
            }
          />
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: H_PADDING,
  },
  loadingText: { marginTop: 12, fontSize: 14, color: GatiMitraMerchant.textSecondary },
  errorText: {
    marginTop: 12,
    fontSize: 15,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },

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
  dayHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  dayHeaderLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  dayTitleCol: { flexDirection: "column" },
  dayHeaderRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  dayLabel: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  daySubtitle: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  openPillText: { fontSize: 12, fontWeight: "700" },
  openPillTextOn: { color: GatiMitraMerchant.statusCompleted },
  openPillTextOff: { color: GatiMitraMerchant.textTertiary },

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

  slotsWrapZomato: { marginTop: 10 },
  slotRowZ: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  slotLeft: { flex: 1, marginRight: 10 },
  slotLabel: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  slotTimeZ: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginTop: 2,
  },
  slotDuration: { fontSize: 11, color: GatiMitraMerchant.textTertiary, marginTop: 2 },
  slotActions: { alignItems: "flex-end", gap: 4 },
  slotActionBtn: { paddingVertical: 4, paddingHorizontal: 6 },
  slotActionText: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.primary },
  slotActionTextSecondary: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.error },

  divider: { height: 1, backgroundColor: GatiMitraMerchant.divider, marginVertical: 8 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 18,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 8,
  },
  modalMessage: { fontSize: 14, color: GatiMitraMerchant.textSecondary, marginBottom: 14 },
  modalMessageSmall: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 10,
  },
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
  modalBtnSecondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },

  timeInputsRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  timeInputWrap: { flex: 1 },
  timeInputLabel: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  timePickerBtn: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  timePickerBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  pickerUnavailable: {
    marginTop: 8,
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
  },
  iosPickerWrap: {
    marginTop: 8,
    alignItems: "center",
  },

  pressed: { opacity: 0.8 },
});
