/**
 * GatiMitra Merchant — Premium multi-layer header.
 * Layout: [Store selector] ---- [ONLINE toggle / radar]
 * 3-line menu only on Flow hub (Earnings, Growth, Offers, Reviews).
 */

import { useEffect, useState, useMemo } from "react";
import { View, Image, Pressable, StyleSheet, Platform, LayoutAnimation, Modal, ScrollView, Share, Alert, TextInput } from "react-native";
import { AppText as Text } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSegments, usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, HEADER_RIGHT_EDGE, CARD_RADIUS, CARD_PADDING, BUTTON_RADIUS } from "@/constants/theme";
import { getConfig } from "@/config/env";
import { OnlineOfflineToggle } from "@/components/OnlineOfflineToggle";
import { RadarLiveIndicator } from "@/components/RadarLiveIndicator";
import { ManageOrdersStoresSheet } from "@/components/ManageOrdersStoresSheet";
import { TimePickerModal } from "@/components/TimePickerModal";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useActiveTab } from "@/context/ActiveTabContext";
import { useAuth } from "@/context/AuthContext";
import { useProfileNav } from "@/context/ProfileNavContext";
import { AuthProxyImage } from "@/components/AuthProxyImage";
import { MerchantBackButton } from "@/components/MerchantBackButton";
import { useMerchantGoBack, useMerchantNavigate, merchantPush } from "@/lib/merchantNavigation";
import { getOperatingHours, getCachedOutlet, getOutlet, prefetchOutlet, prefetchOperatingHours, peekOperatingHoursCache, resolveImageUrl, subscribeOperatingHoursUpdated, type OperatingHours, type DaySlots } from "@/services/outletApi";
import {
  getNextOpenDayStartIso,
  getNextOpenIsoAfterIstCalendarDay,
  isWithinOperatingHours,
  nowInStoreTz,
  operatingHoursToFlatRow,
} from "@/lib/merchantStoreNextOpenIso";
import { formatCloseReasonForCard } from "@/lib/formatCloseReasonForCard";
import type { ChildStore } from "@/context/AuthContext";
import {
  formatStoreHeaderSubtitle,
  resolveStoreLocationLabel,
} from "@/lib/selectedStoreStorage";

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
  const { dayOfWeek } = nowInStoreTz();
  const dayKey: DayKey = DAY_KEYS[dayOfWeek];
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
  if (!pathname.includes("/profile") && !pathname.includes("/support/chat")) return null;
  if (pathname.includes("offer-insights")) return "Detailed performance";
  if (pathname.includes("order-history")) return "Order history";
  if (pathname.includes("/offers")) return "Offers & Promotions";
  if (pathname.includes("edit-store")) return "Outlet info";
  if (pathname.includes("change-history")) return "Change history";
  if (pathname.includes("business-details")) return "Phone numbers";
  if (pathname.includes("/address")) return "Delivery settings";
  if (pathname.includes("/hours")) return "Outlet timings";
  if (pathname.includes("/bank")) return "Bank account";
  if (pathname.includes("/staff")) return "Manage staff";
  if (pathname.includes("/status")) return "Store status";
  if (pathname.includes("preparation-time")) return "Rush hour";
  if (pathname.includes("auto-accept")) return "Auto accept";
  if (pathname.includes("printer-settings")) return "Thermal printer";
  if (pathname.includes("/vacation")) return "Schedule off";
  if (pathname.includes("/preferences")) return "Preferences";
  if (pathname.includes("/communications")) return "Manage communication";
  if (pathname.includes("activity-feed")) return "Recent activity";
  if (pathname.includes("/contact")) return "Contact us";
  if (pathname.includes("/tickets")) return "My tickets";
  if (pathname.includes("/help") || pathname.includes("/support/chat")) return "Support chat";
  if (pathname.includes("/complaints")) return "Complaints";
  if (pathname.includes("/reviews")) return "Reviews";
  if (pathname.includes("/plans")) return "Plans & Subscription";
  if (pathname.includes("/learning")) return "Learning centre";
  return null;
}

function resolveProfileSubPageSubtitle(pathname: string | undefined): string | null {
  if (!pathname) return null;
  if (pathname.includes("/plans")) return "Choose a plan that works best for your restaurant.";
  if (pathname.includes("activity-feed")) return "Track changes across app, partner site, and dashboard.";
  if (pathname.includes("preparation-time")) return "Tell us when your kitchen needs more prep time for orders.";
  if (pathname.includes("/vacation")) return "Choose a reason and when the store will reopen.";
  if (pathname.includes("/bank")) return "Add and verify bank accounts with Cashfree.";
  if (pathname.includes("auto-accept")) return "Automatically accept new orders after your configured delay.";
  if (pathname.includes("printer-settings")) return "Set receipt width for kitchen order tickets (KOT).";
  if (pathname.includes("/preferences")) return "Alerts, delivery radius, and store defaults.";
  if (pathname.includes("/communications")) return "Control WhatsApp alerts and business reports.";
  if (pathname.includes("/contact")) return "Tell us what you need — we'll get back on WhatsApp or phone.";
  if (pathname.includes("/tickets")) return "View and track your support tickets.";
  if (pathname.includes("/complaints")) return "See customer complaints and respond.";
  if (pathname.includes("/reviews")) return "Read and reply to customer reviews.";
  if (pathname.includes("order-history")) return "Browse past orders for this store.";
  if (pathname.includes("edit-store")) return "Update outlet name, logo, and basic details.";
  if (pathname.includes("/address")) return "Delivery radius and pickup settings.";
  if (pathname.includes("/hours")) return "Set when your outlet accepts orders.";
  if (pathname.includes("/staff")) return "Add staff and manage access.";
  if (pathname.includes("/status")) return "Control online/offline and store availability.";
  if (pathname.includes("/offers")) return "Create and manage offers for customers.";
  if (pathname.includes("offer-insights")) return "See how your offers are performing.";
  if (pathname.includes("/learning")) return "India's Lowest Commission platform";
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

/** Full-screen headers (chat, etc.) — hide the tab-level MerchantHeader entirely. */
function isStandaloneScreenHeaderRoute(pathname: string | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname.includes("/help") ||
    pathname.includes("/support/chat") ||
    pathname.includes("/onboarding-benefits")
  );
}

/** Parent brand logo in the header — hidden when no store logo is configured. */
function StoreHeaderLogo({
  logoUrl,
  token,
}: {
  logoUrl: string | null | undefined;
  token: string | null;
}) {
  const resolved = resolveImageUrl(logoUrl);
  if (!resolved) return null;
  if (token) {
    return (
      <View style={styles.logo}>
        <AuthProxyImage
          uri={resolved}
          token={token}
          style={styles.logoImage}
          resizeMode="cover"
          accessibilityLabel="Store logo"
        />
      </View>
    );
  }
  return (
    <View style={styles.logo}>
      <Image
        source={{ uri: resolved }}
        style={styles.logoImage}
        resizeMode="cover"
        accessibilityLabel="Store logo"
      />
    </View>
  );
}

function MainHeader({
  compact,
  pickerVisible,
  setPickerVisible,
  onRequestSwitchStore,
  pathname,
  showHeaderToggle,
  onToggleRequest,
  reopenAtIso: reopenAtIsoProp,
  reopenCountdownLabelPrefix,
}: {
  compact?: boolean;
  pickerVisible: boolean;
  setPickerVisible: (v: boolean) => void;
  onRequestSwitchStore: (store: ChildStore) => void;
  pathname?: string;
  showHeaderToggle?: boolean;
  onToggleRequest?: () => void;
  /** Offline reopen target — shown as countdown under the ONLINE/OFFLINE toggle. */
  reopenAtIso?: string | null;
  reopenCountdownLabelPrefix?: string;
}) {
  const { isOnline, scheduledClosure, manualCloseUntil, restrictionType } = useStoreStatus();
  const reopenAtIso = normalizeIso(reopenAtIsoProp);
  const countdownPrefix = reopenCountdownLabelPrefix ?? "Opens in";
  const [countdownTime, setCountdownTime] = useState<string | null>(() =>
    reopenAtIso && !isOnline ? formatNextReopenCountdown(reopenAtIso) : null
  );

  useEffect(() => {
    if (isOnline || !reopenAtIso || !showHeaderToggle) {
      setCountdownTime(null);
      return;
    }
    const tick = () => {
      setCountdownTime(formatNextReopenCountdown(reopenAtIso));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isOnline, reopenAtIso, showHeaderToggle]);
  const {
    selectedStore,
    managedStores,
    manageAllStores,
    setManagedStores,
  } = useSelectedStore();
  const hasScheduledClosure =
    scheduledClosure != null ||
    restrictionType === "PERMANENT_SHUT" ||
    restrictionType === "VACATION" ||
    (manualCloseUntil != null &&
      manualCloseUntil !== "" &&
      new Date(manualCloseUntil).getTime() > Date.now());
  const { partner, token } = useAuth();
  const { returnRoute, setReturnRoute, vacationHeader } = useProfileNav();
  const router = useRouter();
  const [storeLocationLabel, setStoreLocationLabel] = useState("");
  const goBack = useMerchantGoBack();
  const segments = useSegments();
  const tab = segments[segments.length - 1] ?? "index";
  const isProfileSection = segments.includes("profile");
  const isVacationPage = isProfileSection && (pathname?.includes("/vacation") ?? false);
  const profileSubPageTitle = isProfileSection
    ? isVacationPage && vacationHeader?.title
      ? vacationHeader.title
      : resolveProfileSubPage(pathname)
    : null;
  const profileSubPageSubtitle = isProfileSection
    ? isVacationPage && vacationHeader?.subtitle
      ? vacationHeader.subtitle
      : resolveProfileSubPageSubtitle(pathname)
    : null;
  const isProfileRootWithReturn =
    isProfileSection && !profileSubPageTitle && returnRoute != null && returnRoute.length > 0;
  const isEarningsSection = segments.includes("earnings");
  const earningsSubPageTitle = isEarningsSection ? resolveEarningsSubPage(pathname) : null;
  const subPageTitle =
    profileSubPageTitle ?? earningsSubPageTitle ?? (isProfileRootWithReturn ? "Profile" : null);
  /** 3-line menu only on Flow hub (Earnings / Growth / Offers / Reviews) — not Zone/Home tabs. */
  const showFlowMenuButton =
    segments.includes("earnings") ||
    segments.includes("growth") ||
    segments.includes("reviews") ||
    (typeof pathname === "string" && pathname.includes("/offers"));
  const pageTitle = PAGE_TITLES[String(tab)] ?? "Dashboard";
  const stores = (partner?.childStores ?? []).filter(
    (s) => String(s.approval_status || "").toUpperCase() === "APPROVED"
  );
  const isMultiStoreMode = manageAllStores || managedStores.length > 1;
  const headerTitle = isMultiStoreMode
    ? `All Stores (${managedStores.length})`
    : truncateStoreNameForHeader(
        selectedStore?.store_name ?? "Select a store",
        HEADER_STORE_NAME_MAX_CHARS
      );

  useEffect(() => {
    if (Platform.OS !== "web") {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
  }, [isOnline]);

  useEffect(() => {
    if (!selectedStore?.id || !token) {
      setStoreLocationLabel("");
      return;
    }
    let cancelled = false;
    const applyLocation = (outlet?: { landmark?: string | null; city?: string | null } | null) => {
      if (cancelled) return;
      setStoreLocationLabel(
        resolveStoreLocationLabel(
          selectedStore.full_address,
          outlet ?? null,
          selectedStore.city
        )
      );
    };
    applyLocation(getCachedOutlet(selectedStore.id, token));
    prefetchOutlet(selectedStore.id, token);
    void getOutlet(selectedStore.id, token)
      .then((outlet) => applyLocation(outlet))
      .catch(() => applyLocation(null));
    return () => {
      cancelled = true;
    };
  }, [selectedStore?.id, selectedStore?.full_address, selectedStore?.city, token]);

  const singleStoreSubtitle = selectedStore
    ? formatStoreHeaderSubtitle(
        selectedStore.store_id,
        storeLocationLabel ||
          resolveStoreLocationLabel(selectedStore.full_address, null, selectedStore.city)
      )
    : pageTitle;

  const openProfileFromMenu = () => {
    if (!pathname) return;
    merchantPush(router, "/(tabs)/profile", {
      fromPath: pathname,
      setReturnRoute,
    });
  };


  return (
    <View style={[styles.mainHeader, compact && styles.mainHeaderCompact]}>
      <View
        style={[
          styles.mainHeaderInner,
          showFlowMenuButton
            ? styles.mainHeaderInnerFlowMenuFlush
            : styles.mainHeaderInnerFlushRight,
        ]}
      >
        <View style={[styles.leftSection, subPageTitle && styles.leftSectionSubPage]}>
          {subPageTitle ? (
            <>
              <MerchantBackButton onPress={goBack} />
              <View style={styles.subPageTitleBlock}>
                <Text style={styles.subPageTitle} numberOfLines={1} ellipsizeMode="tail">
                  {subPageTitle}
                </Text>
                {profileSubPageSubtitle ? (
                  <Text style={styles.subPageSubtitle} numberOfLines={2}>
                    {profileSubPageSubtitle}
                  </Text>
                ) : null}
              </View>
            </>
          ) : (
            <>
          <Pressable
            disabled={stores.length === 0}
            onPress={() => {
              if (stores.length > 0) setPickerVisible(true);
            }}
            style={({ pressed }) => [
              styles.greetingBlock,
              pressed && styles.pressed,
              GatiMitraMerchant.cursorPointer,
            ]}
          >
            <View style={styles.greetingRow}>
              <Text style={styles.greeting} numberOfLines={1} ellipsizeMode="clip">
                {headerTitle}
              </Text>
              {stores.length > 0 && (
                <Ionicons
                  name={pickerVisible ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={GatiMitraMerchant.textSecondary}
                />
              )}
            </View>
            <Text style={styles.subtitle} numberOfLines={1}>
              {isMultiStoreMode
                ? manageAllStores
                  ? `Managing all stores · Active: ${truncateStoreNameForHeader(
                      selectedStore?.store_name ?? "Outlet",
                      18
                    )}`
                  : `${managedStores.length} outlets on board`
                : selectedStore
                  ? singleStoreSubtitle
                  : pageTitle}
            </Text>
          </Pressable>
            </>
          )}
        </View>
        <View style={styles.rightSection}>
          {isOnline && !showHeaderToggle && !isProfileSection ? (
            <View style={styles.radarWrap} accessibilityLabel="Store is live">
              <RadarLiveIndicator compact />
            </View>
          ) : null}
          {showHeaderToggle && onToggleRequest ? (
            <View
              style={styles.headerToggleWrap}
              onStartShouldSetResponder={() => true}
            >
              <OnlineOfflineToggle isOnline={isOnline} onToggle={onToggleRequest} />
              {!isOnline && countdownTime ? (
                <Text style={styles.headerToggleCountdown} numberOfLines={1}>
                  {countdownPrefix}{" "}
                  <Text style={styles.headerToggleCountdownBold}>{countdownTime}</Text>
                </Text>
              ) : null}
            </View>
          ) : null}
          {isProfileSection && !profileSubPageTitle && !showFlowMenuButton ? (
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
          ) : null}
          {showFlowMenuButton ? (
            <Pressable
              onPress={openProfileFromMenu}
              style={({ pressed }) => [
                styles.bellWrap,
                styles.headerMenuWrap,
                pressed && styles.pressed,
                GatiMitraMerchant.cursorPointer,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open profile menu"
            >
              <Ionicons name="menu" size={BELL_SIZE} color={GatiMitraMerchant.textPrimary} />
            </Pressable>
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
        onManagedStoresChange={(next) => {
          setManagedStores(next);
        }}
        onSwitchOutlet={(store) => {
          if (store.id === selectedStore?.id) return;
          // Warning modal confirms the active-outlet change; multi-store
          // board is preserved via switchActiveOutlet when already managing many.
          onRequestSwitchStore(store);
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
  onPressCard,
  onPressTodayHours,
  offlineSubtitle,
  autoReopenLabel,
  scheduleLabel,
  showAutoOpenTag,
  todayHoursLabel,
  reopenAtIso: _reopenAtIsoProp,
  reopenAtFormatted: _reopenAtFormatted,
  reopenCountdownLabelPrefix: _reopenCountdownLabelPrefix,
  lastOpenedLine,
  lastClosedLine,
}: {
  onPressCard?: () => void;
  /** Opens operating hours for the active store (does not open store-status list). */
  onPressTodayHours?: () => void;
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
}) {
  const { isOnline } = useStoreStatus();

  useEffect(() => {
    if (Platform.OS !== "web") {
      const { LayoutAnimation } = require("react-native");
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
  }, [isOnline]);

  return (
    <Pressable
      onPress={onPressCard}
      disabled={!onPressCard}
      style={({ pressed }) => [
        styles.statusCard,
        isOnline ? styles.statusCardOnline : styles.statusCardOffline,
        onPressCard && pressed ? styles.statusCardPressed : null,
      ]}
      accessibilityRole={onPressCard ? "button" : undefined}
      accessibilityLabel="Open store status"
    >
      <View style={styles.statusCardInner}>
        <View style={styles.statusCardMainRow}>
          <View style={styles.statusCardLeft}>
            <View style={styles.statusCardTitleRow}>
              <Text style={[styles.statusCardTitle, styles.statusBannerText]}>Store Status</Text>
              {showAutoOpenTag && (
                <View style={styles.autoOpenTagBanner}>
                  <Ionicons name="time-outline" size={9} color="#FFFFFF" />
                  <Text style={styles.autoOpenTagTextBanner}>Auto open</Text>
                </View>
              )}
            </View>
            <Text style={[styles.statusCardSubtitle, styles.statusBannerSubtext]} numberOfLines={1}>
              {isOnline ? "You are receiving orders" : (offlineSubtitle ?? "Closed: Manual close")}
            </Text>
          </View>
          <View style={styles.statusCardRightMeta}>
            {isOnline && lastOpenedLine ? (
              <Text style={[styles.statusCardMetaRight, styles.statusBannerMeta]} numberOfLines={1}>
                {lastOpenedLine}
              </Text>
            ) : null}
            {!isOnline && lastClosedLine ? (
              <Text style={[styles.statusCardMetaRight, styles.statusBannerMeta]} numberOfLines={1}>
                {lastClosedLine}
              </Text>
            ) : null}
            {!isOnline && autoReopenLabel ? (
              <Text style={[styles.statusCardMetaRight, styles.statusBannerMeta]} numberOfLines={2}>
                {autoReopenLabel}
              </Text>
            ) : null}
            {isOnline && (todayHoursLabel || scheduleLabel) ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  onPressTodayHours?.();
                }}
                disabled={!onPressTodayHours}
                hitSlop={6}
                accessibilityRole={onPressTodayHours ? "button" : undefined}
                accessibilityLabel="Open operating hours"
              >
                <Text
                  style={[
                    styles.statusCardMetaRight,
                    styles.statusBannerMeta,
                    onPressTodayHours ? styles.statusBannerHoursLink : null,
                  ]}
                  numberOfLines={2}
                >
                  {todayHoursLabel ?? scheduleLabel}
                </Text>
              </Pressable>
            ) : scheduleLabel ? (
              <Text style={[styles.statusCardMetaRight, styles.statusBannerMeta]} numberOfLines={1}>
                {scheduleLabel}
              </Text>
            ) : null}
            {!isOnline && todayHoursLabel ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  onPressTodayHours?.();
                }}
                disabled={!onPressTodayHours}
                hitSlop={6}
                accessibilityRole={onPressTodayHours ? "button" : undefined}
                accessibilityLabel="Open operating hours"
              >
                <Text
                  style={[
                    styles.statusCardMetaRight,
                    styles.statusBannerMeta,
                    onPressTodayHours ? styles.statusBannerHoursLink : null,
                  ]}
                  numberOfLines={2}
                >
                  {todayHoursLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}


type WarningModalType = "store-status" | "switch-store" | "outside-hours";

export function MerchantCustomHeader() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const { push: merchantNavPush } = useMerchantNavigate();
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
    statusReason,
    unavailableReason,
    reopenAtIso: reopenAtIsoFromContext,
    nextOpenIso,
    nextOpenTime,
    nextCloseTime,
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
  const { switchActiveOutlet } = useSelectedStore();

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (isOnline) return;
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [isOnline]);

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
  const topPadding = insets.top;

  // Refetch when store, auth, or route changes (e.g. back from profile/hours). Do not tie to status poll —
  // lastRefreshedAt updated every few seconds caused duplicate GET operating-hours + status storms.
  useEffect(() => {
    if (!selectedStore?.id || !token) {
      setTodayHoursLabel(null);
      setOperatingHours(null);
      return;
    }
    const storeIdNum = selectedStore.id;
    const applyHours = (hours: OperatingHours | null) => {
      setOperatingHours(hours);
      setTodayHoursLabel(getTodayHoursLabel(hours));
    };
    const cached = peekOperatingHoursCache(storeIdNum);
    if (cached) applyHours(cached);
    prefetchOperatingHours(storeIdNum, token);
    let cancelled = false;
    getOperatingHours(storeIdNum, token)
      .then((hours) => {
        if (cancelled) return;
        applyHours(hours ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setTodayHoursLabel(null);
          setOperatingHours(null);
        }
      });
    const unsub = subscribeOperatingHoursUpdated((sid) => {
      if (sid !== storeIdNum || cancelled) return;
      void getOperatingHours(storeIdNum, token)
        .then((hours) => {
          if (cancelled) return;
          applyHours(hours ?? null);
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
      unsub();
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
      // Preserve Manage All Stores board when switching the active outlet.
      switchActiveOutlet(warningModal.storeToSwitch);
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
  if (isTempClose && primaryReopenIso) {
    // "Closed for" = remaining time until reopen (not elapsed since toggle).
    const untilMs = new Date(primaryReopenIso).getTime();
    const leftMs = untilMs - nowTick;
    if (Number.isFinite(leftMs) && leftMs > 0) {
      const min = Math.max(1, Math.round(leftMs / 60000));
      if (min < 60) tempClosedDurationLabel = `Closed for ${min} min`;
      else {
        const h = Math.floor(min / 60);
        const m = min % 60;
        tempClosedDurationLabel = m > 0 ? `Closed for ${h}h ${m}m` : `Closed for ${h}h`;
      }
    }
  }

  if (!isOnline) {
    if (isTempClose && primaryReopenIso) {
      const when = formatIstDateTimeCompact(primaryReopenIso);
      if (when) {
        autoReopenLabel = tempClosedDurationLabel
          ? `${tempClosedDurationLabel} • Reopening at ${when}`
          : `Reopening at ${when}`;
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

  const resolvedTodayHoursLabel = useMemo((): string | null => {
    if (todayHoursLabel) return todayHoursLabel;
    if (!isOnline) return null;
    if (nextOpenTime && nextCloseTime) {
      return `Today: ${formatSlotTime(nextOpenTime)} – ${formatSlotTime(nextCloseTime)}`;
    }
    if (nextCloseTime) return `Today: until ${formatSlotTime(nextCloseTime)}`;
    if (nextOpenTime) return `Today: from ${formatSlotTime(nextOpenTime)}`;
    return null;
  }, [todayHoursLabel, isOnline, nextOpenTime, nextCloseTime]);

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
    if (tType.startsWith("AUTO")) {
      lastClosedLine = `Last: Auto closed · ${timeStr}`;
    } else if (isGatiMitraActor(lastToggledByEmail) || isGatiMitraActor(lastToggledByName)) {
      lastClosedLine = `Last: Closed by GatiMitra (agent: ${lastToggledByEmail || "unknown"}) · ${timeStr}`;
    } else {
      const who = lastToggledByName || lastToggledById || "Owner";
      lastClosedLine = `Last: Closed by ${who} · ${timeStr}`;
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

  if (isMenuStandaloneHeaderRoute(pathname) || isStandaloneScreenHeaderRoute(pathname)) {
    return null;
  }

  return (
    <>
    <View style={[styles.wrapper, { paddingTop: topPadding }]}>
      <View style={[styles.mainSection, !isHomeScreen && styles.mainSectionNoCard]}>
        <MainHeader
          compact={!isHomeScreen}
          pickerVisible={pickerVisible}
          setPickerVisible={setPickerVisible}
          onRequestSwitchStore={showSwitchStoreWarning}
          pathname={pathname}
          showHeaderToggle={isHomeScreen}
          onToggleRequest={showStoreStatusWarning}
          reopenAtIso={!isOnline ? primaryReopenIso : null}
          reopenCountdownLabelPrefix={!isOnline && primaryReopenIso ? "Opens in" : undefined}
        />
      </View>
    </View>
    {isHomeScreen ? (
      <View style={styles.statusCardSection}>
        <StoreStatusCard
          onPressCard={() => merchantNavPush("/restaurant-status")}
          onPressTodayHours={() => {
            if (!selectedStore) return;
            merchantNavPush("/(tabs)/profile/hours");
          }}
          offlineSubtitle={!isOnline ? closedReasonLine : undefined}
          autoReopenLabel={autoReopenLabel}
          scheduleLabel={scheduleLabel}
          showAutoOpenTag={!isTempClose && autoOpenFromSchedule}
          todayHoursLabel={(() => {
            if (isTempClose) return null;
            if (resolvedTodayHoursLabel === "Today: Closed" && !isOnline) return null;
            if (resolvedTodayHoursLabel) return resolvedTodayHoursLabel;
            if (!isOnline && nextOpenTime) return `Today: Next open at ${formatSlotTime(nextOpenTime)}`;
            if (!isOnline && nextCloseTime) return `Today: Next close at ${formatSlotTime(nextCloseTime)}`;
            return null;
          })()}
          reopenAtIso={!isOnline ? primaryReopenIso : null}
          reopenCountdownLabelPrefix={!isOnline && primaryReopenIso ? "Opens in" : undefined}
          reopenAtFormatted={!isOnline ? formatIstDateTimeCompact(primaryReopenIso) : null}
          lastOpenedLine={isOnline ? lastOpenedLine : null}
          lastClosedLine={!isOnline ? lastClosedLine : null}
        />
      </View>
    ) : null}

      <Modal
        visible={warningModal.visible}
        transparent
        animationType={
          warningModal.type === "store-status" && warningModal.goingOffline ? "slide" : "fade"
        }
        onRequestClose={closeWarningModal}
      >
        <Pressable
          style={[
            styles.warningOverlay,
            warningModal.type === "store-status" && warningModal.goingOffline
              ? styles.warningOverlayBottomSheet
              : null,
          ]}
          onPress={closeWarningModal}
        >
          <Pressable
            style={[
              styles.warningCard,
              warningModal.type === "outside-hours" && styles.outsideHoursCard,
              warningModal.type === "store-status" && warningModal.goingOffline
                ? [styles.warningCardBottomSheet, { paddingBottom: Math.max(insets.bottom, 16) }]
                : null,
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {warningModal.type === "store-status" && warningModal.goingOffline ? (
              <View style={styles.bottomSheetHandle} />
            ) : null}
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
                      merchantNavPush("/(tabs)/profile/hours");
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
                            !!closeTempDate && styles.closeScheduleFieldBoxActive,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text
                            style={
                              closeTempDate
                                ? styles.closeScheduleFieldValue
                                : styles.closeScheduleFieldPlaceholder
                            }
                          >
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
                            color={
                              closeTempDate
                                ? GatiMitraMerchant.navy
                                : GatiMitraMerchant.textTertiary
                            }
                          />
                        </Pressable>
                      </View>
                      <View style={styles.closeScheduleField}>
                        <Text style={styles.closeScheduleFieldLabel}>Time</Text>
                        <Pressable
                          onPress={() => setShowCloseTimePicker(true)}
                          style={({ pressed }) => [
                            styles.closeScheduleFieldBox,
                            styles.closeScheduleFieldBoxActive,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.closeScheduleFieldValue}>
                            {closeTempTime.toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Text>
                          <Ionicons name="time-outline" size={16} color={GatiMitraMerchant.navy} />
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
    </>
  );
}

export function MerchantHeaderLogo() {
  const { partner, token } = useAuth();
  const { selectedStore } = useSelectedStore();
  return (
    <StoreHeaderLogo
      logoUrl={selectedStore?.parent_logo_url ?? partner?.parent?.store_logo ?? null}
      token={token}
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
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  mainSection: {
    paddingHorizontal: H_PADDING,
    paddingTop: 6,
    paddingBottom: 8,
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
    paddingBottom: 8,
  },
  statusCardSection: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
  },
  mainHeader: {
    marginBottom: 0,
  },
  mainHeaderCompact: {
    marginBottom: 0,
  },
  mainHeaderInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: HEADER_RIGHT_EDGE,
    minHeight: 44,
  },
  /** Zone/Home: no 3-line menu — pull ONLINE toggle flush to the right edge. */
  mainHeaderInnerFlushRight: {
    paddingRight: 2,
  },
  /** Flow hub: 3-line menu sits closer to the right edge. */
  mainHeaderInnerFlowMenuFlush: {
    paddingRight: 4,
  },
  headerMenuWrap: {
    marginRight: -4,
  },
  leftSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    gap: LOGO_TO_GREETING_GAP,
  },
  leftSectionSubPage: {
    gap: 2,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 0,
    gap: RADAR_TO_BELL_GAP,
    marginLeft: RADAR_LEFT_MARGIN,
  },
  radarWrap: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerToggleWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginRight: -2,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    aspectRatio: 1,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: GatiMitraMerchant.surfaceWarm,
  },
  logoImage: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  subPageTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  subPageTitle: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 20,
    color: GatiMitraMerchant.textPrimary,
  },
  subPageSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
    color: GatiMitraMerchant.textSecondary,
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
    alignSelf: "stretch",
    width: "100%",
    borderRadius: 0,
    paddingHorizontal: H_PADDING,
    paddingVertical: 10,
    borderWidth: 0,
  },
  statusCardOnline: {
    backgroundColor: "#15803D",
  },
  statusCardOffline: {
    backgroundColor: "#991B1B",
  },
  statusCardPressed: {
    opacity: 0.94,
  },
  statusCardInnerPressable: {
    borderRadius: 0,
  },
  statusBannerCarousel: {
    marginBottom: 10,
  },
  statusBannerSlide: {
    paddingRight: 0,
  },
  statusBannerDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  statusBannerDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  statusBannerDotActive: {
    width: 14,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  scheduleOffBanner: {
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
    width: "100%",
  },
  statusCardMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  statusCardLeft: {
    flex: 1,
    minWidth: 0,
  },
  statusCardRightMeta: {
    flexShrink: 0,
    maxWidth: "52%",
    alignItems: "flex-end",
    gap: 1,
  },
  statusCardMetaRight: {
    fontSize: 10,
    color: GatiMitraMerchant.textTertiary,
    textAlign: "right",
  },
  statusBannerText: {
    color: "#FFFFFF",
  },
  statusBannerSubtext: {
    color: "rgba(255,255,255,0.9)",
  },
  statusBannerMeta: {
    color: "rgba(255,255,255,0.82)",
  },
  statusBannerHoursLink: {
    color: "#FEF3C7",
    fontWeight: "600",
    textDecorationLine: "none",
  },
  statusBannerCountdown: {
    color: "#FECACA",
  },
  statusBannerCountdownBold: {
    fontWeight: "700",
    color: "#FFFFFF",
  },
  headerToggleCountdown: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    maxWidth: 120,
  },
  headerToggleCountdownBold: {
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
  },
  autoOpenTagBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  autoOpenTagTextBanner: {
    fontSize: 9,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 0.1,
  },
  statusCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  statusCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  autoOpenTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: "rgba(22, 163, 74, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(22, 163, 74, 0.3)",
  },
  autoOpenTagText: {
    fontSize: 9,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  statusCardSubtitle: {
    fontSize: 12,
    fontWeight: "400",
    color: GatiMitraMerchant.textSecondary,
    marginTop: 1,
  },
  statusCardTodayHours: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  statusCardMeta: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 1,
  },
  statusCardHoursLink: {
    color: "#2563EB",
    fontWeight: "600",
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
  statusCardCountdownRight: {
    fontSize: 10,
    color: "#DC2626",
    fontWeight: "700",
    textAlign: "right",
  },
  warningOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  warningOverlayBottomSheet: {
    justifyContent: "flex-end",
    alignItems: "stretch",
    padding: 0,
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
  warningCardBottomSheet: {
    maxWidth: "100%",
    maxHeight: "92%",
    borderRadius: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingHorizontal: 20,
    alignItems: "stretch",
  },
  bottomSheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: GatiMitraMerchant.border,
    marginBottom: 12,
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
    maxHeight: 520,
    width: "100%",
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
  closeScheduleFieldBoxActive: {
    borderColor: GatiMitraMerchant.navy,
    backgroundColor: "#F8FAFC",
  },
  closeScheduleFieldPlaceholder: {
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
  },
  closeScheduleFieldValue: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
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
