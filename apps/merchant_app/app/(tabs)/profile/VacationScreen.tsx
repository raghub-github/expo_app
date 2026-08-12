import { useState, useCallback, useEffect, useRef } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert, Modal, Platform, TextInput, KeyboardAvoidingView, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  GatiMitraMerchant,
  H_PADDING,
  CARD_RADIUS,
  BUTTON_RADIUS,
  CARD_PADDING,
  SECTION_GAP,
  FONT_PAGE_TITLE,
  FONT_LABEL,
  TAB_BAR_SCROLL_CONTENT_PADDING,
  FONT_LORA,
  FONT_LORA_BOLD,
  FONT_POPPINS,
} from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { useProfileNav } from "@/context/ProfileNavContext";
import { cancelScheduledOff, scheduleStoreOff } from "@/services/storeVacationApi";
import { getScheduledOffHolidays, type StoreHoliday } from "@/services/storeHolidaysApi";
import { formatStoreActionSourceLabel } from "@/lib/storeActionSource";
import { TimePickerModal } from "@/components/TimePickerModal";

// Optional: native module may be missing in some environments (Expo Go / web),
// so guard the import and render a graceful fallback when unavailable.
let NativeDateTimePicker: React.ComponentType<any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  NativeDateTimePicker = require("@react-native-community/datetimepicker").default;
} catch {
  NativeDateTimePicker = null;
}

const REASONS = [
  "Renovation or relocation of restaurant",
  "Closed due to festival",
  "Permanently shut",
  "Staff availability issues",
  "Going out of station",
  "Other",
] as const;

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

/** Format API date/time for banner. Handles ISO, timestamp number, "YYYY-MM-DD HH:mm:ss", and parses manually if needed. */
function formatScheduledOffDateAndTime(value: string | null | undefined): string {
  if (value == null || value === "") return "scheduled date";
  const str = typeof value === "number" ? String(value) : String(value).trim();
  if (!str) return "scheduled date";
  let d = new Date(str);
  if (Number.isNaN(d.getTime())) {
    d = new Date(str.replace(" ", "T"));
  }
  if (Number.isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(str) && !/[Z+-]\d{2}/.test(str)) {
    d = new Date(str.trim().replace(" ", "T") + "Z");
  }
  if (Number.isNaN(d.getTime()) && /^\d+$/.test(str)) {
    d = new Date(Number(str));
  }
  if (Number.isNaN(d.getTime())) {
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      const [, y, mo, day, h, mi, s] = match;
      d = new Date(Number(y), Number(mo) - 1, Number(day), Number(h), Number(mi), Number(s || 0), 0);
    }
  }
  if (Number.isNaN(d.getTime())) return "scheduled date";
  const day = d.getDate();
  const month = d.toLocaleString("en-IN", { month: "short" });
  const year = d.getFullYear();
  const h = d.getHours();
  const m = d.getMinutes();
  const am = h < 12;
  const h12 = h % 12 || 12;
  const min = Number.isNaN(m) ? "00" : m < 10 ? `0${m}` : String(m);
  return `${day} ${month} ${year} till ${h12}:${min} ${am ? "AM" : "PM"}`;
}

export default function VacationScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();
  const { isOnline, manualCloseUntil, restrictionType, scheduledClosure, upcomingScheduledClosure, refresh } =
    useStoreStatus();
  const { setVacationHeader } = useProfileNav();
  const footerBottomPadding = TAB_BAR_SCROLL_CONTENT_PADDING;

  const initialTab =
    (Array.isArray(params.tab) ? params.tab[0] : params.tab) === "slots" ? "slots" : "schedule";
  const [activeTab, setActiveTab] = useState<"schedule" | "slots">(initialTab);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [otherReason, setOtherReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedUntil, setSelectedUntil] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [summaryModalVisible, setSummaryModalVisible] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const successModalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [upcomingHolidays, setUpcomingHolidays] = useState<StoreHoliday[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const canContinue =
    !!selectedReason &&
    (selectedReason !== "Other" || (otherReason != null && otherReason.trim().length > 0)) &&
    !saving;

  useEffect(() => {
    if (successModalVisible) {
      successModalTimer.current = setTimeout(() => {
        setSuccessModalVisible(false);
        successModalTimer.current = null;
      }, 2000);
    }
    return () => {
      if (successModalTimer.current) {
        clearTimeout(successModalTimer.current);
        successModalTimer.current = null;
      }
    };
  }, [successModalVisible]);
  // Temporary date (date-only) and time for building selectedUntil
  const [tempDate, setTempDate] = useState<Date | null>(null);
  const [tempTime, setTempTime] = useState<Date>(() => {
    const t = new Date();
    t.setHours(18, 0, 0, 0);
    return t;
  });

  const hasStore = !!selectedStore?.id;
  const isPermanent = selectedReason === "Permanently shut";

  const reloadStatusAndHolidays = useCallback(async () => {
    await refresh();
    if (!selectedStore?.id || !token) {
      setUpcomingHolidays([]);
      return;
    }
    try {
      const holidays = await getScheduledOffHolidays(selectedStore.id, token);
      setUpcomingHolidays(holidays);
    } catch {
      setUpcomingHolidays([]);
    }
  }, [refresh, selectedStore?.id, token]);

  useFocusEffect(
    useCallback(() => {
      void reloadStatusAndHolidays();
    }, [reloadStatusAndHolidays])
  );

  useEffect(() => {
    const t = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    if (t === "slots") setActiveTab("slots");
    if (t === "schedule") setActiveTab("schedule");
  }, [params.tab]);

  useEffect(() => {
    if (activeTab === "slots") {
      setVacationHeader({
        title: "Scheduled slots",
        subtitle: "Active and upcoming closures for this outlet.",
      });
    } else {
      setVacationHeader({
        title: "Schedule time off",
        subtitle: "Choose a reason and when the store will reopen.",
      });
    }
    return () => setVacationHeader(null);
  }, [activeTab, setVacationHeader]);

  const isScheduledOffActive =
    scheduledClosure != null ||
    restrictionType === "PERMANENT_SHUT" ||
    (manualCloseUntil != null &&
      manualCloseUntil !== "" &&
      new Date(manualCloseUntil).getTime() > Date.now());

  const isScheduledOffUpcoming = upcomingScheduledClosure != null;

  const upcomingStartsAt = upcomingScheduledClosure?.from ? new Date(upcomingScheduledClosure.from) : null;
  const upcomingActivatesInMs =
    upcomingStartsAt && !Number.isNaN(upcomingStartsAt.getTime())
      ? Math.max(0, upcomingStartsAt.getTime() - Date.now())
      : null;

  const formatDuration = (ms: number) => {
    const totalMins = Math.ceil(ms / 60000);
    const days = Math.floor(totalMins / (60 * 24));
    const hours = Math.floor((totalMins - days * 60 * 24) / 60);
    const mins = totalMins - days * 60 * 24 - hours * 60;
    if (days > 0) return `${days} day${days !== 1 ? "s" : ""} ${hours} hour${hours !== 1 ? "s" : ""}`;
    if (hours > 0) return `${hours} hour${hours !== 1 ? "s" : ""} ${mins} min`;
    return `${mins} min`;
  };

  const onMainContinue = () => {
    if (!hasStore || !token) {
      Alert.alert("Select store", "Please select a store on the Partner Home screen first.");
      return;
    }
    if (!selectedReason) {
      Alert.alert("Select a reason", "Please choose a reason for scheduling time off.");
      return;
    }
    if (selectedReason === "Other" && !otherReason.trim()) {
      Alert.alert("Specify reason", "Please describe the reason for time off in the box below.");
      return;
    }
    if (isPermanent) {
      setSummaryModalVisible(true);
      return;
    }
    if (!selectedUntil) {
      setTempDate(new Date());
      setTempTime((prev) => {
        const next = new Date(prev);
        next.setHours(18, 0, 0, 0);
        return next;
      });
      setShowDatePicker(true);
      return;
    }
    setSummaryModalVisible(true);
  };

  const onDateNext = () => {
    if (!tempDate) return;
    setShowDatePicker(false);
    setShowTimePicker(true);
  };

  const onTimeNext = () => {
    if (!tempDate) return;
    const until = new Date(tempDate);
    until.setHours(tempTime.getHours(), tempTime.getMinutes(), 0, 0);
    setSelectedUntil(until);
    setShowTimePicker(false);
    setSummaryModalVisible(true);
  };

  const closePickersAndReturnToReason = () => {
    setShowDatePicker(false);
    setShowTimePicker(false);
    setTempDate(null);
  };

  const submitScheduleOff = async () => {
    const reasonText = selectedReason === "Other" ? (otherReason.trim() || "Other") : (selectedReason ?? "");
    if (!hasStore || !token || !reasonText) return;
    setSaving(true);
    try {
      const permanent = selectedReason === "Permanently shut";
      const startOfSelectedDay =
        !permanent && selectedUntil
          ? (() => {
              const d = new Date(selectedUntil);
              d.setHours(0, 0, 0, 0);
              return d;
            })()
          : null;
      await scheduleStoreOff(selectedStore!.id, token, {
        reason: reasonText,
        // Schedule off for the selected date (upcoming if date is in future).
        // Starts at 12:00 AM of the selected date and ends at the selected time.
        starts_at: permanent ? null : (startOfSelectedDay ? startOfSelectedDay.toISOString() : null),
        ends_at: permanent ? null : (selectedUntil?.toISOString() ?? null),
        close_until: undefined,
        permanent,
      });
      await refresh();
      setSummaryModalVisible(false);
      setSelectedUntil(null);
      setSelectedReason(null);
      setOtherReason("");
      const title = permanent ? "Store marked permanently closed" : "Scheduled closure created";
      const msg = permanent
        ? "Your store has been marked as permanently shut. To reopen, please contact support or update from the web dashboard."
        : "Your store closure schedule has been set successfully. It will activate at the scheduled start time.";
      setSuccessMessage(`${title}\n\n${msg}`);
      setSuccessModalVisible(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not schedule time off. Please try again.";
      Alert.alert("Failed", msg);
    } finally {
      setSaving(false);
    }
  };

  const onPullToRefresh = async () => {
    setRefreshing(true);
    try {
      await reloadStatusAndHolidays();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={styles.container}>
      {!isOnline ? (
        <View style={styles.closedHeroBanner}>
          <Ionicons name="storefront-outline" size={18} color="#FFFFFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.closedHeroTitle}>Store is closed</Text>
            <Text style={styles.closedHeroSub} numberOfLines={2}>
              {restrictionType === "PERMANENT_SHUT"
                ? "Marked permanently shut"
                : scheduledClosure
                  ? `Scheduled off · ${formatScheduledOffDateAndTime(scheduledClosure.from)} – ${formatScheduledOffDateAndTime(scheduledClosure.to)}`
                  : "Not receiving new orders right now"}
            </Text>
          </View>
        </View>
      ) : null}
      <View style={styles.header}>
        <View style={styles.tabsRow}>
          <Pressable
            onPress={() => setActiveTab("schedule")}
            style={({ pressed }) => [
              styles.tabChip,
              activeTab === "schedule" && styles.tabChipOn,
              pressed && styles.tabChipPressed,
            ]}
          >
            <Ionicons
              name="calendar-outline"
              size={15}
              color={activeTab === "schedule" ? "#FFFFFF" : GatiMitraMerchant.textSecondary}
            />
            <Text style={[styles.tabChipLabel, activeTab === "schedule" && styles.tabChipLabelActive]}>
              Schedule time off
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("slots")}
            style={({ pressed }) => [
              styles.tabChip,
              activeTab === "slots" && styles.tabChipOn,
              pressed && styles.tabChipPressed,
            ]}
          >
            <Ionicons
              name="list-outline"
              size={15}
              color={activeTab === "slots" ? "#FFFFFF" : GatiMitraMerchant.textSecondary}
            />
            <Text style={[styles.tabChipLabel, activeTab === "slots" && styles.tabChipLabelActive]}>
              Scheduled slots
            </Text>
          </Pressable>
        </View>
      </View>
      {activeTab === "slots" && isScheduledOffActive && (
        <View style={styles.currentOffBanner}>
          <View style={styles.currentOffIconWrap}>
            <Ionicons name="calendar" size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.currentOffEyebrow}>Active now</Text>
            <Text style={styles.currentOffText}>
              {restrictionType === "PERMANENT_SHUT"
                ? "Store is marked permanently closed."
                : scheduledClosure
                  ? `Closed from ${formatScheduledOffDateAndTime(scheduledClosure.from)} to ${formatScheduledOffDateAndTime(scheduledClosure.to)}.\nReason: ${scheduledClosure.reason}`
                  : manualCloseUntil
                    ? `Store closed until ${formatScheduledOffDateAndTime(manualCloseUntil)}`
                    : "Store is currently scheduled off."}
            </Text>

            {restrictionType !== "PERMANENT_SHUT" && (scheduledClosure != null || upcomingScheduledClosure != null) && (
              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                <Pressable
                  onPress={() => {
                    if (!selectedStore?.id || !token) return;
                    Alert.alert(
                      "Remove scheduled off?",
                      "This will deactivate the scheduled off and remove it from the system.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: async () => {
                            try {
                              setSaving(true);
                              await cancelScheduledOff(selectedStore.id, token);
                              await refresh();
                              Alert.alert("Removed", "Scheduled off has been removed.");
                            } catch (e) {
                              const msg = e instanceof Error ? e.message : "Failed to remove scheduled off";
                              Alert.alert("Failed", msg);
                            } finally {
                              setSaving(false);
                            }
                          },
                        },
                      ]
                    );
                  }}
                  style={({ pressed }) => [
                    styles.modalSecondaryBtn,
                    {
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.45)",
                      backgroundColor: "rgba(255,255,255,0.12)",
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.modalSecondaryText, { color: "#FFFFFF" }]}>
                    Remove scheduled off
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      )}
      {activeTab === "slots" && upcomingHolidays.length > 0 && (
        <View style={styles.currentOffBanner}>
          <View style={styles.currentOffIconWrap}>
            <Ionicons name="calendar-clear" size={20} color={GatiMitraMerchant.warning} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.currentOffText}>Upcoming scheduled off days</Text>
            {upcomingHolidays.map((h) => {
              const date = h.holiday_date;
              const startTime = h.closed_from?.slice(0, 5) ?? "00:00";
              const endTime = h.closed_till?.slice(0, 5) ?? "23:59";
              return (
                <Text key={h.id} style={[styles.currentOffText, { fontWeight: "500", color: GatiMitraMerchant.textSecondary }]}>
                  {date} • {startTime}–{endTime} — {h.closure_reason ?? "Scheduled off"}
                </Text>
              );
            })}
          </View>
        </View>
      )}
      {activeTab === "slots" && isScheduledOffUpcoming && upcomingScheduledClosure && (
        <View style={styles.currentOffBanner}>
          <View style={styles.currentOffIconWrap}>
            <Ionicons name="time" size={20} color={GatiMitraMerchant.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.currentOffText}>
              Upcoming closure: {formatScheduledOffDateAndTime(upcomingScheduledClosure.from)} to {formatScheduledOffDateAndTime(upcomingScheduledClosure.to)}.
              {"\n"}Reason: {upcomingScheduledClosure.reason}
              {upcomingScheduledClosure.marked_from
                ? `\nSet via ${formatStoreActionSourceLabel(upcomingScheduledClosure.marked_from) ?? upcomingScheduledClosure.marked_from}`
                : ""}
            </Text>
            {upcomingActivatesInMs != null && (
              <Text style={[styles.currentOffText, { marginTop: 6, fontWeight: "500", color: GatiMitraMerchant.textSecondary }]}>
                This scheduled closure will activate in {formatDuration(upcomingActivatesInMs)}.
              </Text>
            )}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <Pressable
                onPress={async () => {
                  if (!selectedStore?.id || !token) return;
                  Alert.alert(
                    "Cancel scheduled off?",
                    "This will remove the upcoming scheduled off and your store will continue to operate normally.",
                    [
                      { text: "No", style: "cancel" },
                      {
                        text: "Yes, cancel",
                        style: "destructive",
                        onPress: async () => {
                          try {
                            setSaving(true);
                            await cancelScheduledOff(selectedStore.id, token);
                            await refresh();
                            Alert.alert("Cancelled", "Your scheduled closure has been cancelled.");
                          } catch (e) {
                            const msg = e instanceof Error ? e.message : "Failed to cancel scheduled closure";
                            Alert.alert("Failed", msg);
                          } finally {
                            setSaving(false);
                          }
                        },
                      },
                    ]
                  );
                }}
                style={({ pressed }) => [
                  styles.modalSecondaryBtn,
                  { borderWidth: 1, borderColor: GatiMitraMerchant.border },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.modalSecondaryText}>Cancel schedule</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!selectedStore?.id || !token) return;
                  Alert.alert(
                    "Activate scheduled off now?",
                    "Your store will go into Scheduled Off immediately and remain closed until the scheduled end time.",
                    [
                      { text: "No", style: "cancel" },
                      {
                        text: "Yes, activate now",
                        style: "destructive",
                        onPress: async () => {
                          try {
                            setSaving(true);
                            await scheduleStoreOff(selectedStore.id, token, {
                              reason: upcomingScheduledClosure.reason,
                              starts_at: new Date().toISOString(),
                              ends_at: upcomingScheduledClosure.to,
                              permanent: false,
                            });
                            await refresh();
                            Alert.alert("Activated", "Scheduled closure activated now.");
                          } catch (e) {
                            const msg = e instanceof Error ? e.message : "Failed to activate scheduled closure";
                            Alert.alert("Failed", msg);
                          } finally {
                            setSaving(false);
                          }
                        },
                      },
                    ]
                  );
                }}
                style={({ pressed }) => [
                  styles.modalPrimaryBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.modalPrimaryText}>Activate now</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {activeTab === "schedule" ? (
          <>
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onPullToRefresh}
                  colors={[GatiMitraMerchant.primary]}
                  tintColor={GatiMitraMerchant.primary}
                />
              }
            >
              <Text style={styles.sectionLabel}>Reason for time off</Text>
              <Text style={styles.sectionHint}>
                Choose why you need to pause orders — date and time come next.
              </Text>
              <View style={styles.reasonCard}>
                {REASONS.map((label) => {
                  const active = selectedReason === label;
                  return (
                    <Pressable
                      key={label}
                      style={({ pressed }) => [
                        styles.reasonRow,
                        pressed && styles.pressed,
                        active && styles.reasonRowActive,
                        GatiMitraMerchant.cursorPointer,
                      ]}
                      onPress={() => {
                        setSelectedReason(label);
                        if (label !== "Other") setOtherReason("");
                      }}
                    >
                      <View
                        style={[
                          styles.reasonRadioOuter,
                          active && styles.reasonRadioOuterActive,
                        ]}
                      >
                        {active && <View style={styles.reasonRadioInner} />}
                      </View>
                      <Text
                        style={[styles.reasonLabel, active && styles.reasonLabelActive]}
                        numberOfLines={2}
                      >
                        {label}
                      </Text>
                      {active ? (
                        <Ionicons name="checkmark-circle" size={20} color={GatiMitraMerchant.primary} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              {selectedReason === "Other" && (
                <View style={styles.otherReasonWrap}>
                  <Text style={styles.otherReasonLabel}>Describe the reason</Text>
                  <TextInput
                    style={styles.otherReasonInput}
                    placeholder="e.g. family function, maintenance..."
                    placeholderTextColor={GatiMitraMerchant.textTertiary}
                    value={otherReason}
                    onChangeText={setOtherReason}
                    maxLength={200}
                  />
                </View>
              )}
              {selectedReason && !isPermanent && (
                <Text style={styles.nextStepHint}>Tap Continue to choose date & time.</Text>
              )}
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: footerBottomPadding }]}>
              {!canContinue && selectedReason !== "Other" ? (
                <Text style={styles.footerHint}>Select a reason above to continue</Text>
              ) : selectedReason === "Other" && !otherReason.trim() ? (
                <Text style={styles.footerHint}>Enter the reason above to continue</Text>
              ) : null}
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  styles.primaryBtnFull,
                  !canContinue && styles.primaryBtnInactive,
                  !canContinue && styles.primaryBtnDisabled,
                  pressed && canContinue && styles.pressed,
                  GatiMitraMerchant.cursorPointer,
                ]}
                disabled={!canContinue}
                onPress={onMainContinue}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.primaryBtnText,
                      !canContinue && styles.primaryBtnTextDisabled,
                    ]}
                  >
                    Continue
                  </Text>
                )}
              </Pressable>
            </View>
          </>
        ) : (
          <ScrollView
            style={styles.body}
            contentContainerStyle={[styles.bodyContent, { paddingBottom: footerBottomPadding }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onPullToRefresh}
                colors={[GatiMitraMerchant.primary]}
                tintColor={GatiMitraMerchant.primary}
              />
            }
          >
            {!isScheduledOffActive &&
              upcomingHolidays.length === 0 &&
              !(isScheduledOffUpcoming && upcomingScheduledClosure) && (
                <View style={styles.emptySlotsCard}>
                  <Ionicons
                    name="calendar-outline"
                    size={32}
                    color={GatiMitraMerchant.textTertiary}
                    style={{ marginBottom: 8 }}
                  />
                  <Text style={styles.emptySlotsTitle}>No scheduled time off</Text>
                  <Text style={styles.emptySlotsSubtitle}>
                    You don&apos;t have any active or upcoming scheduled closures. Use the
                    "Schedule time off" tab to create one.
                  </Text>
                </View>
              )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* Android: native date picker only — no intermediate modal */}
      {Platform.OS === "android" && showDatePicker && NativeDateTimePicker && (
        <NativeDateTimePicker
          value={tempDate ?? new Date()}
          mode="date"
          display="default"
          onChange={(event: { type?: string }, date?: Date) => {
            if ((event as { type?: string })?.type === "dismissed") {
              closePickersAndReturnToReason();
              return;
            }
            if (date) {
              setTempDate(date);
              setShowDatePicker(false);
              setShowTimePicker(true);
            }
          }}
          minimumDate={new Date()}
        />
      )}

      {/* Time picker (Android & iOS): editable time + clock */}
      {showTimePicker && (
        <TimePickerModal
          visible={showTimePicker}
          value={tempTime}
          title="Reopen time"
          onConfirm={(date) => {
            setTempTime(date);
            const until = new Date(tempDate ?? new Date());
            until.setHours(date.getHours(), date.getMinutes(), 0, 0);
            setSelectedUntil(until);
            setShowTimePicker(false);
            setSummaryModalVisible(true);
          }}
          onCancel={() => setShowTimePicker(false)}
        />
      )}

      {/* iOS: minimal picker overlay (spinner needs a container + Next) */}
      {Platform.OS === "ios" && showDatePicker && (
        <Modal visible transparent animationType="slide" onRequestClose={closePickersAndReturnToReason}>
          <Pressable style={[styles.modalBackdrop, styles.modalBackdropBottom]} onPress={closePickersAndReturnToReason}>
            <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
              {NativeDateTimePicker && (
                <NativeDateTimePicker
                  value={tempDate ?? new Date()}
                  mode="date"
                  display="spinner"
                  onChange={(_: unknown, date?: Date) => date && setTempDate(date)}
                  minimumDate={new Date()}
                />
              )}
              <View style={styles.modalActions}>
                <Pressable style={({ pressed }) => [styles.modalSecondaryBtn, pressed && styles.pressed]} onPress={closePickersAndReturnToReason}>
                  <Text style={styles.modalSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable style={({ pressed }) => [styles.modalPrimaryBtn, pressed && styles.pressed]} onPress={onDateNext}>
                  <Text style={styles.modalPrimaryText}>Next</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}


      {/* Final confirmation modal — only one, after date and time are chosen */}
      <Modal visible={summaryModalVisible} transparent animationType="fade" onRequestClose={() => setSummaryModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm schedule off</Text>
            <Text style={styles.summaryMessage}>
              {isPermanent
                ? `You have selected 'Permanently shut'. Your store will be marked as permanently closed. Tap Continue to confirm or Cancel to go back.`
                : selectedUntil
                  ? `You have selected:\n• Reason: ${selectedReason === "Other" ? otherReason.trim() || "Other" : selectedReason}\n• Date: ${formatDate(selectedUntil)}\n• Time: ${formatTime(selectedUntil)}\n\nYour store will remain closed until this date and time. Tap Continue to confirm or Cancel to go back.`
                  : "Your store will remain closed. Tap Continue to confirm or Cancel to go back."}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.modalSecondaryBtn, pressed && styles.pressed]}
                onPress={() => setSummaryModalVisible(false)}
              >
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalPrimaryBtn, (saving || (!isPermanent && !selectedUntil)) && styles.primaryBtnDisabled, pressed && !saving && styles.pressed]}
                disabled={saving || (!isPermanent && !selectedUntil)}
                onPress={submitScheduleOff}
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalPrimaryText}>Continue</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 4. Success modal — shows instantly after schedule-off without page refresh; banner is already updated */}
      <Modal visible={successModalVisible} transparent animationType="fade" onRequestClose={() => setSuccessModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle" size={48} color={GatiMitraMerchant.primary} />
            </View>
            <Text style={styles.modalTitle}>Scheduled off</Text>
            <Text style={styles.summaryMessage}>{successMessage}</Text>
            {scheduledClosure && (
              <View style={styles.successBannerWrap}>
                <Text style={styles.successBannerText}>
                  Store is closed from {formatScheduledOffDateAndTime(scheduledClosure.from)} to {formatScheduledOffDateAndTime(scheduledClosure.to)}. Reason: {scheduledClosure.reason}
                </Text>
              </View>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.successOkBtn,
                pressed && styles.pressed,
                GatiMitraMerchant.cursorPointer,
              ]}
              onPress={() => {
                if (successModalTimer.current) {
                  clearTimeout(successModalTimer.current);
                  successModalTimer.current = null;
                }
                setSuccessModalVisible(false);
              }}
            >
              <Text style={styles.successOkBtnText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
  },
  header: {
    paddingTop: 16,
    paddingHorizontal: H_PADDING,
    paddingBottom: 8,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    position: "relative",
    overflow: "hidden",
  },
  headerAccent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: GatiMitraMerchant.primary,
    opacity: 0.35,
  },
  closedHeroBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: H_PADDING,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: CARD_RADIUS,
    backgroundColor: "#991B1B",
  },
  closedHeroTitle: {
    fontFamily: FONT_LORA_BOLD,
    fontSize: 14,
    color: "#FFFFFF",
  },
  closedHeroSub: {
    fontFamily: FONT_POPPINS,
    fontSize: 11,
    color: "rgba(255,255,255,0.88)",
    marginTop: 2,
    lineHeight: 15,
  },
  pageIntroTitle: {
    fontFamily: FONT_LORA_BOLD,
    fontSize: 18,
    color: GatiMitraMerchant.navy,
    letterSpacing: -0.2,
  },
  pageIntroSub: {
    fontFamily: FONT_POPPINS,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 4,
    lineHeight: 17,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: GatiMitraMerchant.navy,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  tabsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF2F7",
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tabChip: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  tabChipOn: {
    backgroundColor: GatiMitraMerchant.navy,
  },
  tabChipPressed: {
    opacity: 0.9,
  },
  tabChipInner: {
    width: "100%",
    borderRadius: 999,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  tabChipGradient: {
    width: "100%",
    borderRadius: 999,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  tabChipLabel: {
    fontFamily: FONT_POPPINS,
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  tabChipLabelActive: {
    fontWeight: "700",
    color: "#FFFFFF",
  },
  currentOffBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexShrink: 1,
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: H_PADDING,
    marginHorizontal: H_PADDING,
    marginTop: 10,
    marginBottom: 10,
    backgroundColor: "#991B1B",
    borderRadius: CARD_RADIUS,
  },
  currentOffIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  currentOffEyebrow: {
    fontFamily: FONT_POPPINS,
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.75)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  currentOffText: {
    fontFamily: FONT_LORA,
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
    lineHeight: 19,
  },
  keyboardWrap: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 14,
    paddingBottom: 12,
  },
  stepBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: GatiMitraMerchant.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 10,
    ...GatiMitraMerchant.shadowSm,
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.textTertiary,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionHint: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 10,
    lineHeight: 18,
  },
  reasonCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    paddingVertical: 4,
    paddingHorizontal: 2,
    ...GatiMitraMerchant.shadowCard,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.8)",
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginVertical: 3,
    gap: 12,
    borderWidth: 1.5,
    borderColor: "#E8EEF5",
    backgroundColor: "#FAFBFC",
  },
  reasonRowActive: {
    backgroundColor: "rgba(62, 180, 137, 0.1)",
    borderColor: GatiMitraMerchant.primary,
  },
  reasonRadioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
    justifyContent: "center",
  },
  reasonRadioOuterActive: {
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: "rgba(62, 180, 137, 0.15)",
  },
  reasonRadioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GatiMitraMerchant.primary,
  },
  reasonLabel: {
    flex: 1,
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 18,
  },
  reasonLabelActive: {
    fontWeight: "700",
    color: GatiMitraMerchant.navy,
  },
  reasonCheckWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  otherReasonWrap: {
    marginTop: 8,
    marginBottom: 4,
  },
  otherReasonLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.navy,
    marginBottom: 6,
  },
  otherReasonInput: {
    backgroundColor: GatiMitraMerchant.background,
    borderWidth: 2,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    minHeight: 44,
  },
  nextStepHint: {
    fontSize: 13,
    color: GatiMitraMerchant.primaryDark,
    marginTop: 6,
    fontWeight: "500",
  },
  footer: {
    flexDirection: "column",
    alignItems: "stretch",
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    paddingBottom: 0,
    gap: 8,
    backgroundColor: GatiMitraMerchant.background,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  footerHint: {
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
    textAlign: "center",
  },
  backBtn: {
    flex: 1,
    height: 48,
    borderRadius: BUTTON_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.background,
  },
  backText: {
    fontSize: 15,
    fontWeight: "500",
    color: GatiMitraMerchant.textPrimary,
  },
  primaryBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.primary,
    alignSelf: "stretch",
    ...GatiMitraMerchant.shadowSm,
  },
  primaryBtnFull: {
    width: "100%",
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  primaryBtnTextDisabled: {
    color: GatiMitraMerchant.textTertiary,
    fontWeight: "600",
  },
  primaryBtnInactive: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 2,
    borderColor: GatiMitraMerchant.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryBtnDisabled: {
    opacity: 1,
  },
  pressed: {
    opacity: 0.88,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdropBottom: {
    justifyContent: "flex-end",
  },
  pickerSheet: {
    width: "100%",
    backgroundColor: GatiMitraMerchant.background,
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    padding: 16,
    paddingBottom: 24,
  },
  modalCard: {
    width: "90%",
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.background,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 12,
  },
  summaryMessage: {
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 22,
    marginBottom: 20,
  },
  successIconWrap: {
    alignItems: "center",
    marginBottom: 12,
  },
  successBannerWrap: {
    padding: 12,
    marginBottom: 16,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  successBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  successOkBtn: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: BUTTON_RADIUS,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  successOkBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  modalPickerWrap: {
    borderRadius: BUTTON_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  placeholderText: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    paddingVertical: 8,
  },
  emptySlotsCard: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: CARD_PADDING,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  emptySlotsTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 6,
    textAlign: "center",
  },
  emptySlotsSubtitle: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalSecondaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BUTTON_RADIUS,
  },
  modalSecondaryText: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
  },
  modalPrimaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BUTTON_RADIUS,
    backgroundColor: GatiMitraMerchant.primary,
  },
  modalPrimaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});

