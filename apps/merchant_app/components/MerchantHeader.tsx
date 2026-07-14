/**
 * GatiMitra Merchant — Premium multi-layer header.
 * Layout: [Logo + Store selector] ---- [Radar] ---- [Share Restaurant]
 * Left = Identity, center-right = Live radar, far right = Share store link.
 */

import { useEffect, useState, useMemo } from "react";
import { View, Image, Pressable, Text, StyleSheet, Platform, LayoutAnimation, Modal, ScrollView, Share, Alert, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSegments, usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, HEADER_RIGHT_EDGE, CARD_RADIUS, CARD_PADDING, BUTTON_RADIUS, SAFE_AREA_TOP_MIN } from "@/constants/theme";
import { getConfig } from "@/config/env";
import { OnlineOfflineToggle } from "@/components/OnlineOfflineToggle";
import { ManageOrdersStoresSheet } from "@/components/ManageOrdersStoresSheet";
import { RadarLiveIndicator } from "@/components/RadarLiveIndicator";
import { TimePickerModal } from "@/components/TimePickerModal";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useActiveTab } from "@/context/ActiveTabContext";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { AppAssetImage } from "@/components/AppAssetImage";
import { MX } from "@/lib/appAssetKeys";
import { getOperatingHours, type OperatingHours, type DaySlots } from "@/services/outletApi";
import {
  getNextOpenDayStartIso,
  getNextOpenIsoAfterIstCalendarDay,
  isWithinOperatingHours,
  nowInStoreTz,
  operatingHoursToFlatRow,
} from "@/lib/merchantStoreNextOpenIso";
import { formatCloseReasonForCard } from "@/lib/formatCloseReasonForCard";
import { formatStoreActionSourceLabel } from "@/lib/storeActionSource";
import type { ChildStore } from "@/context/AuthContext";

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
type DayKey = (typeof DAY_KEYS)[number];

/** Header title: max visible characters before ellipsis (Unicode-safe). */
const HEADER_STORE_NAME_MAX_CHARS = 25;

function truncateStoreNameForHeader(text: string, maxChars: number): string {
  const chars = Array.from(text.trim());
  if (chars.length <= maxChars) return chars.join("");
  return `${chars.slice(0, maxChars).join("")}…`;
}

function formatSlotTime(t: string | null): string {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr ?? "0");
  if (!Number.isFinite(h)) return t;
  const isPM = h >= 12;
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const displayM = m.toString().padStart(2, "0");
  const suffix = isPM ? "PM" : "AM";
  return `${displayH}:${displayM} ${suffix}`;
}

function getTodayHoursLabel(hours: OperatingHours | null): string | null {
  if (!hours) return null;
  if (hours.is_24_hours) return "Today: 24 hours";
  const now = new Date();
  const dayIndex = now.getDay();
  const dayKey: DayKey = DAY_KEYS[dayIndex];
  const closed = Array.isArray(hours.closed_days) && hours.closed_days.includes(dayKey);
  if (closed) return "Today: Closed";
  const sourceKey = hours.same_for_all_days ? "monday" : dayKey;
  const daySlots = hours[sourceKey] as DaySlots | undefined;
  if (!daySlots?.open) return "Today: Closed";
  const s1 = daySlots.slot1_start && daySlots.slot1_end
    ? `${formatSlotTime(daySlots.slot1_start)} – ${formatSlotTime(daySlots.slot1_end)}`
    : "";
  const s2 = daySlots.slot2_start && daySlots.slot2_end
    ? `${formatSlotTime(daySlots.slot2_start)} – ${formatSlotTime(daySlots.slot2_end)}`
    : "";
  const parts = [s1, s2].filter(Boolean);
  if (parts.length === 0) return "Today: Closed";
  return `Today: ${parts.join(", ")}`;
}

// Optional native date/time picker for close-store modal.
let NativeDateTimePicker: React.ComponentType<any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  NativeDateTimePicker = require("@react-native-community/datetimepicker").default;
} catch {
  NativeDateTimePicker = null;
}

const LOGO_SIZE = 32;
const LOGO_TO_GREETING_GAP = 8;
const RADAR_TO_BELL_GAP = 12;
const RADAR_LEFT_MARGIN = 12;
const BELL_SIZE = 23;
const DEVICES_GAP = 12;

const PAGE_TITLES: Record<string, string> = {
  index: "Dashboard",
  orders: "Orders",
  menu: "Catalog",
  earnings: "Earnings",
  growth: "Growth",
  reviews: "Reviews",
  profile: "Profile",
};

function resolveProfileSubPage(pathname: string | undefined): string | null {
  if (!pathname) return null;
  if (pathname.includes("offer-insights")) return "Detailed performance";
  if (pathname.includes("order-history")) return "Order history";
  if (pathname.includes("/offers")) return "Offers";
  return null;
}

function resolveEarningsSubPage(pathname: string | undefined): string | null {
  if (!pathname) return null;
  if (pathname.includes("/earnings/payout")) return "Payout details";
  return null;
}

/** Catalog item screens render their own minimal header (back + title). */
function isMenuStandaloneHeaderRoute(pathname: string | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname.includes("/menu/item-details") || pathname.includes("/menu/add-edit-item")
  );
}

function MainHeader({
  compact,
  pickerVisible,
  setPickerVisible,
  onRequestSwitchStore,
  pathname,
}: {
  compact?: boolean;
  pickerVisible: boolean;
  setPickerVisible: (v: boolean) => void;
  onRequestSwitchStore: (store: ChildStore) => void;
  pathname?: string;
}) {
  const { isOnline, scheduledClosure, manualCloseUntil, restrictionType } = useStoreStatus();
  const { selectedStore, managedStores, setManagedStores } = useSelectedStore();
  const { unreadCount } = useNotifications();
  const hasScheduledClosure =
    scheduledClosure != null ||
    restrictionType === "PERMANENT_SHUT" ||
    restrictionType === "VACATION" ||
    (manualCloseUntil != null &&
      manualCloseUntil !== "" &&
      new Date(manualCloseUntil).getTime() > Date.now());
  const { partner } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const tab = segments[segments.length - 1] ?? "index";
  const isProfileSection = segments.includes("profile");
  const profileSubPageTitle = isProfileSection ? resolveProfileSubPage(pathname) : null;
  const isEarningsSection = segments.includes("earnings");
  const earningsSubPageTitle = isEarningsSection ? resolveEarningsSubPage(pathname) : null;
  const subPageTitle = profileSubPageTitle ?? earningsSubPageTitle;
  const pageTitle = PAGE_TITLES[String(tab)] ?? "Dashboard";
  const stores = partner?.childStores ?? [];
  const isMultiStoreMode = managedStores.length > 1;
  const headerTitle = isMultiStoreMode
    ? `All Restaurants (${managedStores.length})`
    : truncateStoreNameForHeader(
        selectedStore?.store_name ?? "Select a store",
        HEADER_STORE_NAME_MAX_CHARS
      );

  useEffect(() => {
    if (Platform.OS !== "web") {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
  }, [isOnline]);


  return (
    <View style={[styles.mainHeader, compact && styles.mainHeaderCompact]}>
      <View style={styles.mainHeaderInner}>
        <View style={styles.leftSection}>
          {subPageTitle ? (
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={26} color={GatiMitraMerchant.textPrimary} />
            </Pressable>
          ) : (
            <AppAssetImage
              assetKey={MX.auth.logo}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="GatiMitra"
            />
          )}
          <Pressable
            disabled={subPageTitle ? false : stores.length === 0}
            onPress={() => {
              if (subPageTitle) router.back();
              else if (stores.length > 0) setPickerVisible(true);
            }}
            style={({ pressed }) => [
              styles.greetingBlock,
              pressed && styles.pressed,
              GatiMitraMerchant.cursorPointer,
            ]}
          >
            <View style={styles.greetingRow}>
              <Text style={styles.greeting} numberOfLines={1} ellipsizeMode="clip">
                {subPageTitle ?? headerTitle}
              </Text>
              {!subPageTitle && stores.length > 0 && (
                <Ionicons
                  name={pickerVisible ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={GatiMitraMerchant.textSecondary}
                />
              )}
            </View>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subPageTitle
                ? ""
                : isMultiStoreMode
                  ? `${managedStores.length} restaurants selected`
                  : selectedStore
                    ? `Store ID: ${selectedStore.store_id}`
                    : pageTitle}
            </Text>
          </Pressable>
        </View>
        <View style={styles.rightSection}>
          {isOnline && (
            <View style={styles.radarWrap}>
              <RadarLiveIndicator />
            </View>
          )}
          {isProfileSection && !profileSubPageTitle ? (
            <Pressable
              onPress={async () => {
                const store = selectedStore;
                if (!store) return;
                const base = getConfig().storeWebBaseUrl;
                const url = `${base}/home/merchant/${store.id}`;
                const message = `${store.store_name}\n${store.full_address || ""}\n${url}`;
                try {
                  await Share.share({ url, message, title: "Share Restaurant" });
                } catch {
                  // user cancelled or share not available
                }
              }}
              style={({ pressed }) => [
                styles.bellWrap,
                pressed && styles.pressed,
                GatiMitraMerchant.cursorPointer,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Share Restaurant"
            >
              <Ionicons
                name="share-social"
                size={BELL_SIZE}
                color={GatiMitraMerchant.textPrimary}
              />
            </Pressable>
          ) : !isProfileSection && !isEarningsSection ? (
            <View style={styles.bellWrap}>
              <Pressable
                onPress={() => router.push("/notifications")}
                style={({ pressed }) => [
                  styles.bellPressable,
                  pressed && styles.pressed,
                  GatiMitraMerchant.cursorPointer,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
              >
                <Ionicons
                  name="notifications-outline"
                  size={BELL_SIZE}
                  color={GatiMitraMerchant.textPrimary}
                />
                {unreadCount > 0 ? (
                  <View style={styles.notificationCountBadge}>
                    <Text style={styles.notificationCountText}>
                      {unreadCount > 99 ? "99+" : String(unreadCount)}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      <ManageOrdersStoresSheet
        visible={pickerVisible}
        stores={stores}
        selectedStore={selectedStore}
        managedStores={managedStores}
        activeStoreOnline={isOnline}
        onClose={() => setPickerVisible(false)}
        onConfirm={(selected) => {
          setPickerVisible(false);
          setManagedStores(selected);
        }}
        onSingleStoreSelected={(store) => {
          setManagedStores([store]);
          if (store.id !== selectedStore?.id) {
            onRequestSwitchStore(store);
          }
        }}
      />
    </View>
  );
}

/** Parse API / schedule ISO; bare calendar times are IST (same as backend schedule), not device-local. */
function parseCountdownTarget(isoStr: string): Date {
  let normalized = isoStr.replace(" ", "T");
  if (!/[zZ]$/.test(normalized)) {
    normalized = normalized.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"); // +hhmm -> +hh:mm
    normalized = normalized.replace(/([+-]\d{2})$/, "$1:00"); // +hh -> +hh:00
  }
  if (!/[zZ]$/.test(normalized) && !/[+-]\d{2}:\d{2}$/.test(normalized) && /^\d{4}-\d{2}-\d{2}T/.test(normalized)) {
    return new Date(`${normalized}+05:30`);
  }
  return new Date(normalized);
}

/** Same segment format as dashboard / Partner Site: `{h}h {m}m {s}s` (updates every second). */
function formatNextReopenCountdown(iso: string | Date | null | undefined): string | null {
  if (iso == null) return null;
  const isoStr = typeof iso === "string" ? iso.trim() : iso instanceof Date ? iso.toISOString() : String(iso).trim();
  if (!isoStr || isoStr.length === 0) return null;
  const target = parseCountdownTarget(isoStr);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  const s = Math.floor((diffMs % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

function formatReopenAtLabel(iso: string | null | undefined): string | null {
  if (iso == null || String(iso).trim() === "") return null;
  const s = String(iso).trim();
  const d = parseCountdownTarget(s);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Calcutta",
  }).format(d);
}

function normalizeIso(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function StoreStatusCard({
  onToggleRequest,
  offlineSubtitle,
  autoReopenLabel,
  scheduleLabel,
  showAutoOpenTag,
  todayHoursLabel,
  reopenAtIso: reopenAtIsoProp,
  reopenAtFormatted,
  reopenCountdownLabelPrefix,
  lastOpenedLine,
  lastClosedLine,
  scheduledTimeOffLines,
  activeRushLine,
}: {
  onToggleRequest: () => void;
  offlineSubtitle?: string;
  autoReopenLabel?: string | null;
  scheduleLabel?: string | null;
  showAutoOpenTag?: boolean;
  todayHoursLabel?: string | null;
  reopenAtIso?: string | null;
  reopenAtFormatted?: string | null;
  /** When temp close: "Opens in" else "Reopen at:" */
  reopenCountdownLabelPrefix?: string;
  /** "Last: Opened by ..." when store is online */
  lastOpenedLine?: string | null;
  /** "Last: Closed by Name (ID: id) · 11:56:12 am" when temp close */
  lastClosedLine?: string | null;
  scheduledTimeOffLines?: Array<{
    phase: "active" | "upcoming";
    windowText: string;
    reason?: string | null;
    sourceLabel: string | null;
  }>;
  activeRushLine?: { remainingMinutes: number; sourceLabel: string | null } | null;
}) {
  const { isOnline } = useStoreStatus();
  const countdownPrefix = reopenCountdownLabelPrefix ?? "Reopen at:";
  const reopenAtIso = normalizeIso(reopenAtIsoProp);
  const [countdownTime, setCountdownTime] = useState<string | null>(() =>
    reopenAtIso ? formatNextReopenCountdown(reopenAtIso) : null
  );
  const reopenLabel = reopenAtFormatted ?? (reopenAtIso ? formatReopenAtLabel(reopenAtIso) : null);

  useEffect(() => {
    if (Platform.OS !== "web") {
      const { LayoutAnimation } = require("react-native");
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
  }, [isOnline]);

  // Dynamic countdown updating every second (server-synced reopen time).
  useEffect(() => {
    if (!reopenAtIso) {
      setCountdownTime(null);
      return;
    }
    const update = () => setCountdownTime(formatNextReopenCountdown(reopenAtIso));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [reopenAtIso]);

  return (
    <View style={[styles.statusCard, isOnline ? styles.statusCardOnline : styles.statusCardOffline]}>
      {scheduledTimeOffLines && scheduledTimeOffLines.length > 0 ? (
        <View style={styles.scheduleOffBanner}>
          <Text style={styles.scheduleOffBannerTitle}>Scheduled time-off</Text>
          {scheduledTimeOffLines.map((row, idx) => (
            <Text key={`sched-${idx}`} style={styles.scheduleOffBannerLine} numberOfLines={3}>
              <Text style={row.phase === "active" ? styles.scheduleOffPhaseActive : styles.scheduleOffPhaseUpcoming}>
                {row.phase === "active" ? "Active" : "Upcoming"}
              </Text>
              {" · "}
              {row.windowText}
              {row.reason ? ` · ${row.reason}` : ""}
              {row.sourceLabel ? ` · via ${row.sourceLabel}` : ""}
            </Text>
          ))}
        </View>
      ) : null}
      {activeRushLine && activeRushLine.remainingMinutes > 0 ? (
        <View style={styles.rushBanner}>
          <Text style={styles.rushBannerTitle}>Rush hour</Text>
          <Text style={styles.rushBannerLine} numberOfLines={2}>
            <Text style={styles.rushBannerActive}>Active</Text>
            {" · ~"}
            {activeRushLine.remainingMinutes}
            {" min left"}
            {activeRushLine.sourceLabel ? ` · via ${activeRushLine.sourceLabel}` : ""}
          </Text>
        </View>
      ) : null}
      <View style={styles.statusCardInner}>
        <View style={styles.statusCardLeft}>
          <View style={styles.statusCardTitleRow}>
            <Text style={styles.statusCardTitle}>Store Status</Text>
            {showAutoOpenTag && (
              <View style={styles.autoOpenTag}>
                <Ionicons name="time-outline" size={10} color={GatiMitraMerchant.primary} />
                <Text style={styles.autoOpenTagText}>Auto open</Text>
              </View>
            )}
          </View>
          <Text style={styles.statusCardSubtitle} numberOfLines={2}>
            {isOnline ? "You are receiving orders" : (offlineSubtitle ?? "Closed: Manual close")}
          </Text>
          {isOnline && lastOpenedLine && (
            <Text style={styles.statusCardMeta} numberOfLines={1}>
              {lastOpenedLine}
            </Text>
          )}
          {!isOnline && lastClosedLine && (
            <Text style={styles.statusCardMeta} numberOfLines={1}>
              {lastClosedLine}
            </Text>
          )}
          {!isOnline && autoReopenLabel && (
            <Text style={styles.statusCardMeta} numberOfLines={1}>
              {autoReopenLabel}
            </Text>
          )}
          {scheduleLabel && (
            <Text style={styles.statusCardMeta} numberOfLines={1}>
              {scheduleLabel}
            </Text>
          )}
          {todayHoursLabel && (
            <Text style={styles.statusCardMeta} numberOfLines={1}>
              {todayHoursLabel}
            </Text>
          )}
        </View>
        <View style={styles.statusCardRight}>
          {!isOnline && (
            <Text style={styles.statusCardCountdownAboveToggle} numberOfLines={1}>
              {countdownPrefix}{" "}
              <Text style={styles.statusCardCountdownBold}>
                {countdownTime ?? reopenLabel ?? (reopenAtIso ? "Next open" : "When you open")}
              </Text>
            </Text>
          )}
          <OnlineOfflineToggle isOnline={isOnline} onToggle={onToggleRequest} />
        </View>
      </View>
    </View>
  );
}

type WarningModalType = "store-status" | "switch-store" | "outside-hours";

export function MerchantCustomHeader() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const segments = useSegments();

  const tab = segments[segments.length - 1] ?? "index";
  const {
    isOnline,
    toggle,
    closeStore,
    scheduledClosure,
    manualCloseUntil,
    manualCloseReason,
    restrictionType,
    autoOpenFromSchedule,
    manualActivationLock,
    upcomingScheduledClosure,
    activeRush,
    statusReason,
    unavailableReason,
    reopenAtIso: reopenAtIsoFromContext,
    nextOpenIso,
    nextOpenTime,
    nextCloseTime,
    manualCloseStartAt,
    closedBy,
    closedById,
    lastToggleType,
    lastToggledAt,
    lastToggledByName,
    lastToggledById,
    lastToggledByEmail,
  } = useStoreStatus();
  const hasScheduledClosure =
    scheduledClosure != null ||
    (manualCloseUntil != null &&
      manualCloseUntil !== "" &&
      new Date(manualCloseUntil).getTime() > Date.now()) ||
    upcomingScheduledClosure != null;
  const { setSelectedStore } = useSelectedStore();

  const [pickerVisible, setPickerVisible] = useState(false);
  const [warningModal, setWarningModal] = useState<{
    visible: boolean;
    type: WarningModalType;
    goingOffline?: boolean;
    storeToSwitch?: ChildStore;
  }>({ visible: false, type: "store-status" });
  const [closeMode, setCloseMode] = useState<"TEMP" | "TODAY" | "MANUAL">("TEMP");
  const [closeReason, setCloseReason] = useState<string | null>(null);
  const [closeReasonOtherText, setCloseReasonOtherText] = useState("");
  const [closeReasonPickerVisible, setCloseReasonPickerVisible] = useState(false);
  const [closeModePickerVisible, setCloseModePickerVisible] = useState(false);
  const [lastCloseReasonLabel, setLastCloseReasonLabel] = useState<string | null>(null);
  const [closeTempDate, setCloseTempDate] = useState<Date | null>(null);
  const [closeTempTime, setCloseTempTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(18, 0, 0, 0);
    return d;
  });
  const [showCloseDatePicker, setShowCloseDatePicker] = useState(false);
  const [showCloseTimePicker, setShowCloseTimePicker] = useState(false);
  const [todayHoursLabel, setTodayHoursLabel] = useState<string | null>(null);
  const [operatingHours, setOperatingHours] = useState<OperatingHours | null>(null);

  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { activeTab } = useActiveTab();

  const withinOperatingHoursNow = useMemo(() => {
    if (!operatingHours) return null;
    const row = operatingHoursToFlatRow(operatingHours);
    const { dayOfWeek, minutesSinceMidnight } = nowInStoreTz();
    return isWithinOperatingHours(row, dayOfWeek, minutesSinceMidnight);
  }, [operatingHours]);

  const isProfileSection = segments.includes("profile") || (typeof pathname === "string" && pathname.includes("profile"));
  const isHomeScreen =
    !isProfileSection &&
    activeTab === "index" &&
    (pathname === "/" ||
      pathname === "/(tabs)" ||
      pathname === "/(tabs)/" ||
      tab === "index");
  const topPadding = Math.max(insets.top, SAFE_AREA_TOP_MIN);

  // Refetch when store, auth, or route changes (e.g. back from profile/hours). Do not tie to status poll —
  // lastRefreshedAt updated every few seconds caused duplicate GET operating-hours + status storms.
  useEffect(() => {
    if (!selectedStore?.id || !token) {
      setTodayHoursLabel(null);
      setOperatingHours(null);
      return;
    }
    let cancelled = false;
    getOperatingHours(selectedStore.id, token)
      .then((hours) => {
        if (cancelled) return;
        const h = hours ?? null;
        setOperatingHours(h);
        setTodayHoursLabel(getTodayHoursLabel(h));
      })
      .catch(() => {
        if (!cancelled) {
          setTodayHoursLabel(null);
          setOperatingHours(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStore?.id, token, pathname]);

  const showStoreStatusWarning = () => {
    setCloseMode("TEMP");
    setCloseReason(null);
    setCloseReasonOtherText("");
    const now = new Date();
    setCloseTempDate(now);
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    setCloseTempTime(oneHourFromNow);
    if (!isOnline && withinOperatingHoursNow === false) {
      setWarningModal({
        visible: true,
        type: "outside-hours",
      });
      return;
    }
    setWarningModal({
      visible: true,
      type: "store-status",
      goingOffline: isOnline,
    });
  };

  const showSwitchStoreWarning = (store: ChildStore) => {
    setWarningModal({
      visible: true,
      type: "switch-store",
      storeToSwitch: store,
    });
  };

  const closeWarningModal = () => {
    setWarningModal((prev) => ({ ...prev, visible: false }));
  };

  const getCloseUntilIso = (): string | null => {
    if (closeMode === "MANUAL") return null;
    if (closeMode === "TODAY") {
      if (operatingHours) {
        const row = operatingHoursToFlatRow(operatingHours);
        const { dayOfWeek } = nowInStoreTz();
        const ref = new Date();
        const next =
          getNextOpenIsoAfterIstCalendarDay(row, dayOfWeek, ref) ??
          getNextOpenDayStartIso(row, dayOfWeek, ref);
        if (next) return next;
      }
      const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
      const parts = formatter.formatToParts(new Date());
      const y = parts.find((p) => p.type === "year")?.value ?? "";
      const m = parts.find((p) => p.type === "month")?.value ?? "";
      const d = parts.find((p) => p.type === "day")?.value ?? "";
      const endOfTodayIST = new Date(`${y}-${m}-${d}T23:59:59+05:30`);
      return Number.isNaN(endOfTodayIST.getTime()) ? null : endOfTodayIST.toISOString();
    }
    if (closeMode === "TEMP" && closeTempDate && closeTempTime) {
      const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
      const parts = formatter.formatToParts(closeTempDate);
      const y = parts.find((p) => p.type === "year")?.value ?? "";
      const m = parts.find((p) => p.type === "month")?.value ?? "";
      const d = parts.find((p) => p.type === "day")?.value ?? "";
      const h = String(closeTempTime.getHours()).padStart(2, "0");
      const min = String(closeTempTime.getMinutes()).padStart(2, "0");
      const reopenIST = new Date(`${y}-${m}-${d}T${h}:${min}:00+05:30`);
      return Number.isNaN(reopenIST.getTime()) ? null : reopenIST.toISOString();
    }
    return null;
  };

  const confirmWarningModal = () => {
    if (warningModal.type === "store-status") {
      // When closing, ensure a reason is selected (and "Other" is filled).
      if (warningModal.goingOffline) {
        if (!closeReason) {
          Alert.alert("Select reason", "Please select a reason for closing your store.");
          return;
        }
        if (closeReason === "Other" && !closeReasonOtherText.trim()) {
          Alert.alert("Add details", "Please enter the reason in the Other reason box.");
          return;
        }
        if (closeMode === "TEMP" && (!closeTempDate || !closeTempTime)) {
          Alert.alert("Select date & time", "Please select when to reopen for temporary closure.");
          return;
        }
        const trimmedOther = closeReasonOtherText.trim();
        const label =
          closeReason === "Other"
            ? trimmedOther || null
            : closeReason;
        setLastCloseReasonLabel(label);
      }
      const hadClosure = hasScheduledClosure;
      closeWarningModal();
      if (warningModal.goingOffline) {
        const opts = {
          manual_close_until: closeMode === "MANUAL" ? null : (getCloseUntilIso() ?? undefined),
          manual_close_reason: (closeReason === "Other" ? closeReasonOtherText.trim() : closeReason) ?? undefined,
        };
        closeStore(opts).catch(() => {});
      } else {
        toggle()
          .then(() => {
            if (hadClosure) {
              Alert.alert("Store opened", "Scheduled off cleared. Store is now open and accepting orders.");
            }
          })
          .catch((e: unknown) => {
            const code = e != null && typeof e === "object" ? String((e as { code?: string }).code ?? "") : "";
            const msg = e instanceof Error ? e.message : "";
            if (
              code === "outside_operating_hours" ||
              msg.toLowerCase().includes("outside its scheduled operating hours")
            ) {
              setWarningModal({ visible: true, type: "outside-hours" });
              return;
            }
          });
      }
    } else if (warningModal.type === "switch-store" && warningModal.storeToSwitch) {
      setSelectedStore(warningModal.storeToSwitch);
      setPickerVisible(false);
      router.replace("/(tabs)");
      closeWarningModal();
    } else {
      closeWarningModal();
    }
  };

  const formatIstTime = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Calcutta",
    }).format(d);
  };

  const formatIstDateTimeCompact = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Calcutta",
    }).format(d);
  };

  const formatRemainingShort = (targetIso: string | null | undefined): string | null => {
    if (!targetIso) return null;
    const target = new Date(targetIso);
    const now = new Date();
    const diffMs = target.getTime() - now.getTime();
    if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
    const totalMinutes = Math.round(diffMs / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes - days * 24 * 60) / 60);
    const minutes = totalMinutes - days * 24 * 60 - hours * 60;
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 && days === 0) parts.push(`${minutes}m`);
    if (parts.length === 0) return null;
    return `in ${parts.join(" ")}`;
  };

  let autoReopenLabel: string | null = null;
  let scheduleLabel: string | null = null;

  // Temp close = manual close with a future reopen time (manual_close_until).
  const isTempClose =
    !isOnline &&
    manualCloseUntil != null &&
    manualCloseUntil !== "" &&
    new Date(manualCloseUntil).getTime() > Date.now();

  /** Single source: `StoreStatusContext.reopenAtIso` (aligned with dashboard `opens_at`). */
  const primaryReopenIso = reopenAtIsoFromContext;
  // Map backend status_reason / unavailable_reason to required UI labels.
  const statusReasonToLabel: Record<string, string> = {
    manual_lock: "Store locked manually",
    forced_lock: "Store locked manually",
    manual_close: "Temporarily closed",
    schedule_closed: "Outside operating hours",
    outside_operating_hours: "Outside operating hours",
    manual_indefinite: "Closed until manually reopened",
  };
  // Priority: Manual Lock > Temporary Close > Manual Close > Schedule. Prefer exact API reason (manualCloseReason / close_reason) on card.
  const closedLabelFromApi = ((): string | null => {
    if (manualActivationLock) return "Store locked manually";
    if (isTempClose)
      return manualCloseReason && String(manualCloseReason).trim() !== ""
        ? `Temporarily closed – ${formatCloseReasonForCard(String(manualCloseReason).trim()) ?? String(manualCloseReason).trim()}`
        : "Temporarily closed";
    if (statusReason != null && statusReasonToLabel[statusReason]) return statusReasonToLabel[statusReason];
    if (unavailableReason != null && statusReasonToLabel[unavailableReason]) return statusReasonToLabel[unavailableReason];
    if (!isOnline && autoOpenFromSchedule && reopenAtIsoFromContext != null) return "Outside operating hours";
    if (unavailableReason === "manual_indefinite" || (restrictionType === "manual" && !manualCloseUntil)) return "Closed until manually reopened";
    return null;
  })();
  const closedLabelWithPrefix = closedLabelFromApi != null ? closedLabelFromApi : null;

  const rawReason =
    closedLabelFromApi != null
      ? closedLabelFromApi.replace(/^Closed:\s*/i, "").trim() || closedLabelFromApi
      : typeof lastCloseReasonLabel === "string"
        ? lastCloseReasonLabel.replace(/^Closed:\s*/i, "").trim() || lastCloseReasonLabel
        : manualCloseReason ?? scheduledClosure?.reason ?? restrictionType ?? (manualActivationLock ? "Store locked manually" : null);
  const reasonText = rawReason ?? (todayHoursLabel === "Today: Closed" ? "today (schedule)" : "Manual close");

  // Card subtitle: always "Closed: {exact reason}" – prefer API close_reason (manualCloseReason) when available
  const exactClosedReason =
    manualCloseReason != null && String(manualCloseReason).trim() !== ""
      ? formatCloseReasonForCard(String(manualCloseReason).trim())
      : isTempClose
        ? "Temporarily closed"
        : closedLabelFromApi != null
          ? formatCloseReasonForCard(closedLabelFromApi)
          : null;
  const closedReasonLine =
    exactClosedReason != null
      ? `Closed: ${exactClosedReason}`
      : closedLabelWithPrefix ??
        (isTempClose ? "Closed: Temporarily closed" : null) ??
        (typeof lastCloseReasonLabel === "string" && lastCloseReasonLabel.length > 0
          ? (lastCloseReasonLabel.startsWith("Closed:") ? lastCloseReasonLabel : `Closed: ${lastCloseReasonLabel}`)
          : null) ??
        (scheduledClosure?.reason != null && String(scheduledClosure?.reason ?? "").trim() !== "")
          ? `Closed: ${formatCloseReasonForCard(String(scheduledClosure?.reason ?? "").trim()) ?? String(scheduledClosure?.reason ?? "")}`
          : restrictionType != null
            ? `Closed: ${restrictionType}`
            : manualActivationLock
              ? "Store locked manually"
              : todayHoursLabel === "Today: Closed"
                ? "Closed today (schedule)"
                : "Closed: Manual close";

  let tempClosedDurationLabel: string | null = null;
  if (isTempClose && manualCloseStartAt) {
    const start = new Date(manualCloseStartAt).getTime();
    const now = Date.now();
    if (Number.isFinite(start) && now > start) {
      const min = Math.floor((now - start) / 60000);
      if (min < 60) tempClosedDurationLabel = `Closed for ${min} min`;
      else tempClosedDurationLabel = `Closed for ${Math.floor(min / 60)}h ${min % 60}m`;
    }
  }

  if (!isOnline) {
    if (isTempClose && primaryReopenIso) {
      const when = formatIstDateTimeCompact(primaryReopenIso);
      const remaining = formatRemainingShort(primaryReopenIso);
      if (when) {
        autoReopenLabel = `${tempClosedDurationLabel ? `${tempClosedDurationLabel} • ` : ""}Reopening at ${when}${remaining ? ` (${remaining})` : ""}`;
      }
    } else if (manualActivationLock) {
      autoReopenLabel = "Force Keep Store Closed is ON";
    }
  }

  if (scheduledClosure && isOnline) {
    const from = formatIstTime(scheduledClosure.from);
    const to = formatIstTime(scheduledClosure.to);
    if (from && to) {
      scheduleLabel = `Today: ${from} – ${to}`;
    }
  }

  const formatScheduleWindow = (fromIso: string, toIso: string) => {
    const fromLabel = formatIstDateTimeCompact(fromIso);
    const toLabel = formatIstDateTimeCompact(toIso);
    if (fromLabel && toLabel) return `${fromLabel} – ${toLabel}`;
    return fromLabel || toLabel || "";
  };

  const scheduledTimeOffLines: Array<{
    phase: "active" | "upcoming";
    windowText: string;
    reason?: string | null;
    sourceLabel: string | null;
  }> = [];
  if (upcomingScheduledClosure) {
    const w = formatScheduleWindow(upcomingScheduledClosure.from, upcomingScheduledClosure.to);
    if (w) {
      scheduledTimeOffLines.push({
        phase: "upcoming",
        windowText: w,
        reason: upcomingScheduledClosure.reason,
        sourceLabel: formatStoreActionSourceLabel(upcomingScheduledClosure.marked_from),
      });
    }
  }
  if (scheduledClosure && !isOnline) {
    const w = formatScheduleWindow(scheduledClosure.from, scheduledClosure.to);
    if (w) {
      scheduledTimeOffLines.push({
        phase: "active",
        windowText: w,
        reason: scheduledClosure.reason,
        sourceLabel: formatStoreActionSourceLabel(scheduledClosure.marked_from),
      });
    }
  }

  const activeRushLine =
    activeRush && activeRush.is_active && activeRush.remaining_minutes > 0
      ? {
          remainingMinutes: activeRush.remaining_minutes,
          sourceLabel: formatStoreActionSourceLabel(activeRush.marked_from),
        }
      : null;

  const isGatiMitraActor = (emailOrName: string | null | undefined): boolean => {
    const v = emailOrName != null ? String(emailOrName).toLowerCase() : "";
    return v.includes("gatimitra") || v.endsWith("@gatimitra.in") || v.endsWith("@gatimitra.com");
  };

  // "Last: Closed by ..." when store is offline
  let lastClosedLine: string | null = null;
  if (!isOnline && lastToggledAt) {
    const timeStr = new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: "Asia/Calcutta",
    }).format(new Date(lastToggledAt));
    const tType = lastToggleType != null ? String(lastToggleType).toUpperCase() : "";
    const storePublicId = selectedStore?.store_id ? String(selectedStore.store_id) : null;
    if (tType.startsWith("AUTO")) {
      lastClosedLine = `Last: Auto closed · ${timeStr}`;
    } else if (isGatiMitraActor(lastToggledByEmail) || isGatiMitraActor(lastToggledByName)) {
      lastClosedLine = `Last: Closed by GatiMitra (agent: ${lastToggledByEmail || "unknown"}) · ${timeStr}`;
    } else {
      const who = lastToggledByName || lastToggledById || "Owner";
      lastClosedLine = `Last: Closed by ${who}${storePublicId ? ` (ID: ${storePublicId})` : ""} · ${timeStr}`;
    }
  }

  // "Last: Opened by ..." when store is online
  let lastOpenedLine: string | null = null;
  if (isOnline && lastToggledAt) {
    const timeStr = new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: "Asia/Calcutta",
    }).format(new Date(lastToggledAt));
    const tType = lastToggleType != null ? String(lastToggleType).toUpperCase() : "";
    const storePublicId = selectedStore?.store_id ? String(selectedStore.store_id) : null;
    if (tType.startsWith("AUTO")) {
      lastOpenedLine = `Last: Auto on · ${timeStr}`;
    } else if (isGatiMitraActor(lastToggledByEmail) || isGatiMitraActor(lastToggledByName)) {
      lastOpenedLine = `Last: Opened by GatiMitra (agent: ${lastToggledByEmail || "unknown"}) · ${timeStr}`;
    } else {
      const who = lastToggledByName || lastToggledById || "Owner";
      lastOpenedLine = `Last: Opened by ${who}${storePublicId ? ` (ID: ${storePublicId})` : ""} · ${timeStr}`;
    }
  }

  if (isMenuStandaloneHeaderRoute(pathname)) {
    return null;
  }

  return (
    <View style={[styles.wrapper, { paddingTop: topPadding }]}>
      <View style={[styles.mainSection, !isHomeScreen && styles.mainSectionNoCard]}>
        <MainHeader
          compact={!isHomeScreen}
          pickerVisible={pickerVisible}
          setPickerVisible={setPickerVisible}
          onRequestSwitchStore={showSwitchStoreWarning}
          pathname={pathname}
        />
        {isHomeScreen && (
          <StoreStatusCard
            onToggleRequest={showStoreStatusWarning}
            offlineSubtitle={!isOnline ? closedReasonLine : undefined}
            autoReopenLabel={autoReopenLabel}
            scheduleLabel={scheduleLabel}
            showAutoOpenTag={!isTempClose && autoOpenFromSchedule}
            todayHoursLabel={(() => {
              if (isTempClose) return null;
              if (todayHoursLabel === "Today: Closed" && !isOnline) return null;
              if (todayHoursLabel) return todayHoursLabel;
              if (!isOnline && nextOpenTime) return `Today: Next open at ${nextOpenTime}`;
              if (!isOnline && nextCloseTime) return `Today: Next close at ${nextCloseTime}`;
              return null;
            })()}
            reopenAtIso={!isOnline ? primaryReopenIso : null}
            reopenCountdownLabelPrefix={!isOnline && primaryReopenIso ? "Opens in" : undefined}
            reopenAtFormatted={!isOnline ? formatIstDateTimeCompact(primaryReopenIso) : null}
            lastOpenedLine={isOnline ? lastOpenedLine : null}
            lastClosedLine={!isOnline ? lastClosedLine : null}
            scheduledTimeOffLines={scheduledTimeOffLines}
            activeRushLine={activeRushLine}
          />
        )}
      </View>

      <Modal
        visible={warningModal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeWarningModal}
      >
        <Pressable style={styles.warningOverlay} onPress={closeWarningModal}>
          <Pressable style={[styles.warningCard, warningModal.type === "outside-hours" && styles.outsideHoursCard]} onPress={(e) => e.stopPropagation()}>
            {warningModal.type === "outside-hours" ? (
              <>
                <View style={styles.storeOnIconWrap}>
                  <View style={[styles.storeOnIconCircle, styles.outsideHoursIconCircle]}>
                    <Ionicons name="time-outline" size={28} color="#D97706" />
                  </View>
                </View>
                <Text style={styles.storeOnTitle}>Outside Operating Hours</Text>
                <Text style={styles.storeOnBody}>
                  Your store cannot be turned ON because it is currently outside its scheduled operating hours.
                </Text>
                <Text style={[styles.storeOnBody, styles.outsideHoursBodySecondary]}>
                  To open your store now, please update your Store Schedule first.
                </Text>
                <View style={styles.warningActions}>
                  <Pressable
                    onPress={closeWarningModal}
                    style={({ pressed }) => [
                      styles.warningBtn,
                      styles.warningBtnCancel,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.warningBtnCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      closeWarningModal();
                      router.push("/(tabs)/profile/hours" as never);
                    }}
                    style={({ pressed }) => [
                      styles.warningBtn,
                      styles.outsideHoursConfirmBtn,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.outsideHoursConfirmText} numberOfLines={1}>
                      Go to Store Schedule
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : warningModal.type === "store-status" && !warningModal.goingOffline ? (
              <>
                <View style={styles.storeOnIconWrap}>
                  <View style={styles.storeOnIconCircle}>
                    <Ionicons name="power" size={28} color="#16A34A" />
                  </View>
                </View>
                <Text style={styles.storeOnTitle}>Turn store ON?</Text>
                <Text style={styles.storeOnBody}>
                  Your store will be open and customers can place orders. Make sure you&apos;re ready to accept orders.
                </Text>
                <View style={styles.storeOnAlert}>
                  <Ionicons
                    name="warning-outline"
                    size={16}
                    color={GatiMitraMerchant.warning}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.storeOnAlertText}>
                    Orders will start coming immediately. Be prepared to receive and process them.
                  </Text>
                </View>
                <View style={styles.warningActions}>
                  <Pressable
                    onPress={closeWarningModal}
                    style={({ pressed }) => [
                      styles.warningBtn,
                      styles.warningBtnCancel,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.warningBtnCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={confirmWarningModal}
                    style={({ pressed }) => [
                      styles.warningBtn,
                      styles.storeOnConfirmBtn,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.storeOnConfirmText}>Yes, turn ON</Text>
                  </Pressable>
                </View>
              </>
            ) : warningModal.type === "store-status" && warningModal.goingOffline ? (
              <ScrollView
                style={styles.storeOffScroll}
                contentContainerStyle={{ paddingBottom: 8 }}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.storeOffTitle}>How would you like to close your store?</Text>

                <Text style={styles.closeModeLabel}>Closure type</Text>
                <Pressable
                  onPress={() => setCloseModePickerVisible(true)}
                  style={({ pressed }) => [
                    styles.closeReasonSelect,
                    styles.closeModeSelect,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.closeReasonValue} numberOfLines={1}>
                    {closeMode === "TEMP"
                      ? "Temporary Closed"
                      : closeMode === "TODAY"
                      ? "Close for today"
                      : "Until I manually turn it ON"}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color={GatiMitraMerchant.textTertiary}
                  />
                </Pressable>

                {closeMode === "TEMP" && (
                  <View style={styles.closeScheduleCard}>
                    <Text style={styles.closeScheduleLabel}>Reopen on (date and time):</Text>
                    <View style={styles.closeScheduleRow}>
                      <View style={styles.closeScheduleField}>
                        <Text style={styles.closeScheduleFieldLabel}>Date</Text>
                        <Pressable
                          onPress={() => {
                            if (!NativeDateTimePicker) {
                              Alert.alert("Not available", "Date picker is not available on this device.");
                              return;
                            }
                            setShowCloseDatePicker(true);
                          }}
                          style={({ pressed }) => [
                            styles.closeScheduleFieldBox,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.closeScheduleFieldPlaceholder}>
                            {closeTempDate
                              ? closeTempDate.toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "Select date"}
                          </Text>
                          <Ionicons
                            name="calendar-outline"
                            size={16}
                            color={GatiMitraMerchant.textTertiary}
                          />
                        </Pressable>
                      </View>
                      <View style={styles.closeScheduleField}>
                        <Text style={styles.closeScheduleFieldLabel}>Time</Text>
                        <Pressable
                          onPress={() => setShowCloseTimePicker(true)}
                          style={({ pressed }) => [
                            styles.closeScheduleFieldBox,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.closeScheduleFieldPlaceholder}>
                            {closeTempDate
                              ? closeTempTime.toLocaleTimeString("en-IN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "Select time"}
                          </Text>
                          <Ionicons name="time-outline" size={16} color={GatiMitraMerchant.textTertiary} />
                        </Pressable>
                      </View>
                    </View>
                    <Text style={styles.closeScheduleHint}>
                      Store stays closed until this date & time, or until you turn it ON manually.
                    </Text>
                  </View>
                )}

                <View style={styles.closeReasonSection}>
                  <Text style={styles.closeReasonLabel}>Reason for closing</Text>
                  <Pressable
                    onPress={() => setCloseReasonPickerVisible(true)}
                    style={({ pressed }) => [
                      styles.closeReasonSelect,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={
                        closeReason ? styles.closeReasonValue : styles.closeReasonPlaceholder
                      }
                      numberOfLines={1}
                    >
                      {closeReason ?? "Select reason"}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={16}
                      color={GatiMitraMerchant.textTertiary}
                    />
                  </Pressable>
                  {closeReason === "Other" && (
                    <View style={styles.closeReasonOtherWrap}>
                      <Text style={styles.closeReasonOtherLabel}>Other reason</Text>
                      <TextInput
                        style={styles.closeReasonOtherInput}
                        placeholder="e.g. personal emergency, renovation..."
                        placeholderTextColor={GatiMitraMerchant.textTertiary}
                        value={closeReasonOtherText}
                        onChangeText={setCloseReasonOtherText}
                        multiline
                      />
                    </View>
                  )}
                </View>

                <View style={styles.warningActions}>
                  <Pressable
                    onPress={closeWarningModal}
                    style={({ pressed }) => [
                      styles.warningBtn,
                      styles.warningBtnCancel,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.warningBtnCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={confirmWarningModal}
                    style={({ pressed }) => [
                      styles.warningBtn,
                      styles.warningBtnConfirm,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.warningBtnConfirmText}>Confirm</Text>
                  </Pressable>
                </View>
              </ScrollView>
            ) : (
              <>
                <View style={styles.warningIconWrap}>
                  <Ionicons name="warning-outline" size={28} color={GatiMitraMerchant.warning} />
                </View>
                <Text style={styles.warningTitle}>Confirm</Text>
                <Text style={styles.warningMessage}>
                  {warningModal.storeToSwitch
                    ? `Switch store? You will be managing ${warningModal.storeToSwitch.store_name}.`
                    : ""}
                </Text>
                <View style={styles.warningActions}>
                  <Pressable
                    onPress={closeWarningModal}
                    style={({ pressed }) => [
                      styles.warningBtn,
                      styles.warningBtnCancel,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.warningBtnCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={confirmWarningModal}
                    style={({ pressed }) => [
                      styles.warningBtn,
                      styles.warningBtnConfirm,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.warningBtnConfirmText}>Confirm</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Close mode picker bottom sheet */}
      <Modal
        visible={closeModePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCloseModePickerVisible(false)}
      >
        <Pressable
          style={styles.warningOverlay}
          onPress={() => setCloseModePickerVisible(false)}
        >
          <Pressable
            style={[styles.warningCard, { maxHeight: "70%", alignItems: "stretch" }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.warningTitle, { marginBottom: 4 }]}>Select closure type</Text>
            <Text style={[styles.warningMessage, { marginBottom: 12 }]}>
              Choose how long you want to keep the store closed.
            </Text>
            <ScrollView
              style={{ marginBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >
              {[
                {
                  key: "TEMP" as const,
                  title: "Temporary Closed",
                  subtitle:
                    "Close until a specific date and time. Reopens automatically then, or you can turn it ON manually.",
                },
                {
                  key: "TODAY" as const,
                  title: "Close for today",
                  subtitle: "Reopens automatically at tomorrow's opening time.",
                },
                {
                  key: "MANUAL" as const,
                  title: "Until I manually turn it ON",
                  subtitle:
                    "Store stays OFF even during operating hours until you turn it ON.",
                },
              ].map((option) => {
                const active = closeMode === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => {
                      setCloseMode(option.key);
                      setCloseModePickerVisible(false);
                    }}
                    style={({ pressed }) => [
                      styles.closeReasonOptionRow,
                      active && styles.closeReasonOptionRowActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={active ? styles.closeReasonOptionTextActive : styles.closeReasonOptionText}
                    >
                      {option.title}
                    </Text>
                    <Text style={styles.closeOptionSubtitle}>{option.subtitle}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.warningActions}>
              <Pressable
                onPress={() => setCloseModePickerVisible(false)}
                style={({ pressed }) => [
                  styles.warningBtn,
                  styles.warningBtnCancel,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.warningBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => setCloseModePickerVisible(false)}
                style={({ pressed }) => [
                  styles.warningBtn,
                  styles.warningBtnConfirm,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.warningBtnConfirmText}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Reason picker bottom sheet */}
      <Modal
        visible={closeReasonPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCloseReasonPickerVisible(false)}
      >
        <Pressable
          style={styles.warningOverlay}
          onPress={() => setCloseReasonPickerVisible(false)}
        >
          <Pressable
            style={[styles.warningCard, { maxHeight: "70%", alignItems: "stretch" }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.warningTitle, { marginBottom: 4 }]}>Select reason</Text>
            <Text style={[styles.warningMessage, { marginBottom: 12 }]}>
              Pick why you&apos;re closing the store. This helps your account manager understand the
              pattern.
            </Text>
            <ScrollView
              style={{ marginBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >
              {[
                "Staff shortage",
                "Inventory restock",
                "Device issue / electricity",
                "Run out of Gas",
                "Payment issue",
                "Rush of offline orders",
                "Equipment issue",
                "Holiday / Off",
                "Maintenance",
                "Personal / Emergency",
                "Kitchen / Prep area issue",
                "Supplier delay",
                "Other",
              ].map((reason) => {
                const active = closeReason === reason;
                return (
                  <Pressable
                    key={reason}
                    onPress={() => {
                      setCloseReason(reason);
                      setCloseReasonPickerVisible(false);
                    }}
                    style={({ pressed }) => [
                      styles.closeReasonOptionRow,
                      active && styles.closeReasonOptionRowActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={active ? styles.closeReasonOptionTextActive : styles.closeReasonOptionText}
                      numberOfLines={2}
                    >
                      {reason}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.warningActions}>
              <Pressable
                onPress={() => setCloseReasonPickerVisible(false)}
                style={({ pressed }) => [
                  styles.warningBtn,
                  styles.warningBtnCancel,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.warningBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => setCloseReasonPickerVisible(false)}
                style={({ pressed }) => [
                  styles.warningBtn,
                  styles.warningBtnConfirm,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.warningBtnConfirmText}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Close-store date & time pickers (TEMP mode) */}
      {showCloseDatePicker && NativeDateTimePicker && (
        <NativeDateTimePicker
          value={closeTempDate ?? new Date()}
          mode="date"
          display="default"
          onChange={(event: { type?: string }, date?: Date) => {
            if (event?.type === "dismissed") {
              setShowCloseDatePicker(false);
              return;
            }
            if (date) {
              setCloseTempDate(date);
              setShowCloseDatePicker(false);
            }
          }}
          minimumDate={new Date()}
        />
      )}

      {showCloseTimePicker && (
        <TimePickerModal
          visible={showCloseTimePicker}
          value={closeTempTime}
          title="Reopen time"
          onConfirm={(date) => {
            setCloseTempTime(date);
            setShowCloseTimePicker(false);
          }}
          onCancel={() => setShowCloseTimePicker(false)}
        />
      )}
    </View>
  );
}

export function MerchantHeaderLogo() {
  return (
    <AppAssetImage
      assetKey={MX.auth.logo}
      style={styles.logo}
      resizeMode="contain"
      accessibilityLabel="GatiMitra"
    />
  );
}

/** Share Restaurant button (replaces notification icon in header). */
export function MerchantHeaderNotification({ onPress }: { onPress?: () => void }) {
  const { selectedStore } = useSelectedStore();
  const handlePress = async () => {
    if (onPress) {
      onPress();
      return;
    }
    const store = selectedStore;
    if (!store) return;
    const base = getConfig().storeWebBaseUrl;
    const url = `${base}/home/merchant/${store.id}`;
    const message = `${store.store_name}\n${store.full_address || ""}\n${url}`;
    try {
      await Share.share({ url, message, title: "Share Restaurant" });
    } catch {
      // user cancelled or share not available
    }
  };
  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.bellWrap, pressed && styles.pressed, GatiMitraMerchant.cursorPointer]}
      accessibilityRole="button"
      accessibilityLabel="Share Restaurant"
    >
      <Ionicons name="share-social" size={BELL_SIZE} color={GatiMitraMerchant.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: GatiMitraMerchant.cardBg,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  mainSection: {
    paddingHorizontal: H_PADDING,
    paddingTop: 14,
    paddingBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },
  mainSectionNoCard: {
    paddingBottom: 10,
  },
  mainHeader: {
    marginBottom: 14,
  },
  mainHeaderCompact: {
    marginBottom: 0,
  },
  mainHeaderInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: HEADER_RIGHT_EDGE,
  },
  leftSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    gap: LOGO_TO_GREETING_GAP,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: RADAR_TO_BELL_GAP,
    marginLeft: RADAR_LEFT_MARGIN,
  },
  radarWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  headerBackBtn: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
  },
  greetingBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  greeting: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  bellWrap: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  bellPressable: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  notificationBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#DC2626",
  },
  notificationCountBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  notificationCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.7,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 96,
    paddingHorizontal: 16,
  },
  pickerCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.16,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 8,
  },
  pickerList: {
    maxHeight: 260,
    marginBottom: 8,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.divider,
    gap: 10,
  },
  pickerItemActive: {
    backgroundColor: "#F0FDF4",
  },
  pickerItemTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  pickerItemName: {
    fontSize: 14,
    fontWeight: "500",
    color: GatiMitraMerchant.textPrimary,
  },
  pickerItemNameActive: {
    color: GatiMitraMerchant.primary,
  },
  pickerItemSub: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 1,
  },
  manageStoresBtn: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    paddingVertical: 6,
  },
  manageStoresText: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  statusCard: {
    borderRadius: CARD_RADIUS,
    padding: CARD_PADDING,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  statusCardOnline: {
    borderLeftWidth: 4,
    borderLeftColor: GatiMitraMerchant.storeOnline,
  },
  statusCardOffline: {
    borderLeftWidth: 4,
    borderLeftColor: GatiMitraMerchant.storeOffline,
  },
  scheduleOffBanner: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  scheduleOffBannerTitle: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#78350F",
    marginBottom: 4,
  },
  scheduleOffBannerLine: {
    fontSize: 11,
    lineHeight: 16,
    color: "#78350F",
    marginTop: 2,
  },
  scheduleOffPhaseActive: {
    fontWeight: "700",
    color: "#9F1239",
  },
  scheduleOffPhaseUpcoming: {
    fontWeight: "700",
    color: "#92400E",
  },
  rushBanner: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FDBA74",
  },
  rushBannerTitle: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#9A3412",
    marginBottom: 4,
  },
  rushBannerLine: {
    fontSize: 11,
    lineHeight: 16,
    color: "#9A3412",
  },
  rushBannerActive: {
    fontWeight: "700",
    color: "#C2410C",
  },
  statusCardInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusCardLeft: {
    flex: 1,
    minWidth: 0,
  },
  statusCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  statusCardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  autoOpenTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(22, 163, 74, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(22, 163, 74, 0.3)",
  },
  autoOpenTagText: {
    fontSize: 10,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  statusCardSubtitle: {
    fontSize: 13,
    fontWeight: "400",
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  statusCardMeta: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 2,
  },
  statusCardCountdown: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 4,
  },
  statusCardCountdownBold: {
    fontWeight: "700",
    color: "#DC2626",
  },
  statusCardCountdownAboveToggle: {
    fontSize: 12,
    color: "#DC2626",
    fontWeight: "700",
    marginBottom: 6,
    textAlign: "center",
  },
  statusCardRight: {
    marginLeft: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  warningOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  warningCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 24,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  warningIconWrap: {
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 8,
  },
  warningMessage: {
    fontSize: 15,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  warningActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  warningBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BUTTON_RADIUS,
    alignItems: "center",
    justifyContent: "center",
  },
  warningBtnCancel: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  warningBtnConfirm: {
    backgroundColor: GatiMitraMerchant.navy,
  },
  warningBtnCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  warningBtnConfirmText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  // Store ON modal specific styles
  // Store ON modal specific styles
  storeOnIconWrap: {
    alignItems: "center",
    marginBottom: 10,
  },
  storeOnIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  storeOnTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    marginBottom: 6,
  },
  storeOnBody: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    marginBottom: 10,
    lineHeight: 20,
  },
  storeOnAlert: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FBBF24",
    marginBottom: 16,
  },
  storeOnAlertText: {
    flex: 1,
    fontSize: 12,
    color: "#92400E",
  },
  storeOnConfirmBtn: {
    backgroundColor: "#15803D",
  },
  storeOnConfirmText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  outsideHoursIconCircle: {
    backgroundColor: "#FFFBEB",
  },
  outsideHoursCard: {
    maxWidth: 400,
  },
  outsideHoursBodySecondary: {
    marginTop: 8,
  },
  outsideHoursConfirmBtn: {
    backgroundColor: "#D97706",
    flex: 1.35,
    minWidth: 168,
  },
  outsideHoursConfirmText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
  },
  // Store OFF modal (close) options
  storeOffTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "left",
    marginBottom: 12,
  },
  storeOffScroll: {
    maxHeight: 420,
  },
  closeModeLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 4,
  },
  closeModeSelect: {
    marginBottom: 12,
  },
  closeOptionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  closeOptionRowActive: {
    borderColor: "#F97316",
    backgroundColor: "#FFFBEB",
  },
  closeOptionRadioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    marginRight: 10,
  },
  closeOptionRadioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "#F97316",
  },
  closeOptionTextWrap: {
    flex: 1,
  },
  closeOptionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 2,
  },
  closeOptionSubtitle: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
  },
  closeScheduleCard: {
    width: "100%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
    marginBottom: 6,
  },
  closeScheduleLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 4,
  },
  closeScheduleRow: {
    flexDirection: "row",
    gap: 8,
  },
  closeScheduleField: {
    flex: 1,
  },
  closeScheduleFieldLabel: {
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 4,
  },
  closeScheduleFieldBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  closeScheduleFieldPlaceholder: {
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
  },
  closeScheduleHint: {
    marginTop: 6,
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
  },
  closeReasonSection: {
    width: "100%",
    marginBottom: 16,
  },
  closeReasonLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 4,
  },
  closeReasonSelect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  closeReasonPlaceholder: {
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
  },
  closeReasonValue: {
    fontSize: 12,
    color: GatiMitraMerchant.textPrimary,
  },
  closeReasonOptionRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: "#FFFFFF",
  },
  closeReasonOptionRowActive: {
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: "#ECFDF3",
  },
  closeReasonOptionText: {
    fontSize: 13,
    color: GatiMitraMerchant.textPrimary,
  },
  closeReasonOptionTextActive: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  closeReasonOtherWrap: {
    marginTop: 8,
  },
  closeReasonOtherLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 4,
  },
  closeReasonOtherInput: {
    minHeight: 60,
    maxHeight: 100,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: GatiMitraMerchant.textPrimary,
  },
});
