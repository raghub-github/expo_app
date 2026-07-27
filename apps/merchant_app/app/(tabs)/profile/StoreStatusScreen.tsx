import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ScrollView, RefreshControl, Dimensions, Pressable, ActivityIndicator, Alert, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  getStoreStatusWeekly,
  getStoreStatusHistory,
  type WeeklyDay,
  type StatusHistoryEntry,
} from "@/services/storeStatusApi";
import { formatCloseReasonForCard } from "@/lib/formatCloseReasonForCard";

const CHART_HEIGHT = 120;
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const BAR_GAP = 6;
const MAX_BARS = 7;
const BAR_MAX_WIDTH = (SCREEN_WIDTH - H_PADDING * 2 - BAR_GAP * (MAX_BARS - 1)) / MAX_BARS;

function formatIstTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Calcutta",
  }).format(d);
}

function formatIstDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Calcutta",
  }).format(d);
}

/** Day, date and time in IST e.g. "Mon, 14 Mar 2025, 12:00 am" */
function formatIstDayDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Calcutta",
  }).format(d);
}

/** Date and time in IST (Asia/Calcutta) for history: "14 Mar 2025, 2:30 PM" */
function formatHistoryDateAndTimeIst(iso: string | null | undefined): string {
  if (iso == null || (typeof iso === "string" && !iso.trim())) return "—";
  const s = typeof iso === "string" ? iso.trim() : String(iso);
  let d: Date;
  const num = Number(s);
  if (Number.isFinite(num)) {
    d = num > 1e12 ? new Date(num) : new Date(num * 1000);
  } else {
    d = new Date(s);
  }
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Calcutta",
  }).format(d);
}

/** Bare `YYYY-MM-DDTHH:mm` from API = IST wall time (same as MerchantHeader / dashboard). */
function parseCountdownTargetIso(isoStr: string): Date {
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

/** Dashboard / Partner parity: `Opens in {h}h {m}m {s}s`. */
function formatCountdown(iso: string | null): string | null {
  if (!iso) return null;
  const target = parseCountdownTargetIso(iso.trim());
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  const s = Math.floor((diffMs % 60000) / 1000);
  return `Opens in ${h}h ${m}m ${s}s`;
}

type StatusBadgeType = "OPEN" | "CLOSED_MANUAL" | "CLOSED_SCHEDULE" | "CLOSED_FORCED";

type StoreStatusScreenProps = { reopenPromptFromNotification?: boolean };

export default function StoreStatusScreen({ reopenPromptFromNotification }: StoreStatusScreenProps) {
  const router = useRouter();
  const {
    isOnline,
    toggle,
    loading,
    autoOpenFromSchedule,
    manualActivationLock,
    scheduledClosure,
    manualCloseUntil,
    manualCloseReason,
    manualCloseStartAt,
    closedBy,
    restrictionType,
    upcomingScheduledClosure,
    statusReason,
    unavailableReason,
    reopenAtIso: reopenAtIsoFromContext,
    refresh,
  } = useStoreStatus();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();

  const [refreshing, setRefreshing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [weeklyDays, setWeeklyDays] = useState<WeeklyDay[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const reopenPromptShownRef = useRef(false);

  useEffect(() => {
    if (!reopenPromptFromNotification || reopenPromptShownRef.current || isOnline) return;
    reopenPromptShownRef.current = true;
    Alert.alert(
      "Your store can now reopen",
      "Business hours are active and your scheduled closure has ended.",
      [
        { text: "Stay Closed", style: "cancel" },
        {
          text: "Go Online",
          onPress: () => {
            toggle().then(() => router.replace("/(tabs)")).catch(() => {});
          },
        },
      ]
    );
  }, [reopenPromptFromNotification, isOnline, toggle, router]);

  const fetchWeekly = useCallback(async () => {
    if (!selectedStore?.id || !token) {
      setWeeklyDays([]);
      return;
    }
    setWeeklyLoading(true);
    try {
      const { days } = await getStoreStatusWeekly(selectedStore.id, token);
      setWeeklyDays(days);
    } catch {
      setWeeklyDays([]);
    } finally {
      setWeeklyLoading(false);
    }
  }, [selectedStore?.id, token]);

  const fetchHistory = useCallback(async () => {
    if (!selectedStore?.id || !token) {
      setStatusHistory([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const { history } = await getStoreStatusHistory(selectedStore.id, token, 20);
      setStatusHistory(history);
    } catch {
      setStatusHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [selectedStore?.id, token]);

  useEffect(() => {
    void fetchWeekly();
  }, [fetchWeekly]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  useFocusEffect(
    useCallback(() => {
      void fetchHistory();
    }, [fetchHistory])
  );

  // Same instant as dashboard: context already applies manual vs legacy EOD vs schedule next_open.
  const reopenAtIso = reopenAtIsoFromContext;

  const closedReasonLabelByStatus: Record<string, string> = {
    manual_lock: "Store locked manually",
    forced_lock: "Store locked manually",
    manual_close: "Temporarily closed",
    schedule_closed: "Outside operating hours",
    outside_operating_hours: "Outside operating hours",
    manual_indefinite: "Closed until manually reopened",
  };
  const isTempClose =
    !isOnline &&
    manualCloseUntil != null &&
    manualCloseUntil !== "" &&
    new Date(manualCloseUntil).getTime() > Date.now();
  const closedReason = useMemo(() => {
    if (isOnline) return null;
    if (isTempClose)
      return manualCloseReason && String(manualCloseReason).trim() !== ""
        ? `Temp closed: ${formatCloseReasonForCard(String(manualCloseReason).trim()) ?? String(manualCloseReason).trim()}`
        : "Temporarily closed";
    if (statusReason != null && closedReasonLabelByStatus[statusReason])
      return closedReasonLabelByStatus[statusReason];
    if (unavailableReason != null && closedReasonLabelByStatus[unavailableReason])
      return closedReasonLabelByStatus[unavailableReason];
    if (scheduledClosure?.reason)
      return formatCloseReasonForCard(String(scheduledClosure.reason).trim()) ?? String(scheduledClosure.reason);
    if (restrictionType) return restrictionType;
    if (manualActivationLock) return "Store locked manually";
    return "Manual close";
  }, [isOnline, isTempClose, manualCloseReason, statusReason, unavailableReason, scheduledClosure, restrictionType, manualActivationLock]);

  const statusBadge: StatusBadgeType = useMemo(() => {
    if (isOnline) return "OPEN";
    if (manualActivationLock) return "CLOSED_FORCED";
    if (
      statusReason === "schedule_closed" ||
      statusReason === "outside_operating_hours" ||
      scheduledClosure?.reason ||
      restrictionType === "SCHEDULED"
    )
      return "CLOSED_SCHEDULE";
    return "CLOSED_MANUAL";
  }, [isOnline, manualActivationLock, statusReason, scheduledClosure, restrictionType]);

  const isManualClose = !isOnline && !scheduledClosure?.reason && !restrictionType && !manualActivationLock;
  const exactReason =
    isManualClose && manualCloseReason?.trim()
      ? formatCloseReasonForCard(manualCloseReason.trim()) ?? manualCloseReason.trim()
      : closedReason;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), fetchWeekly(), fetchHistory()]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleQuickReopen = async () => {
    if (loading || reopening || isOnline) return;
    setReopening(true);
    try {
      await toggle();
      router.replace("/(tabs)");
    } catch {
      // alert already shown by context
    } finally {
      setReopening(false);
    }
  };

  const maxOrders = useMemo(() => Math.max(1, ...weeklyDays.map((d) => d.orders_count)), [weeklyDays]);

  const reopenTimeLabel = reopenAtIso ? formatIstDateTime(reopenAtIso) : null;
  const [countdownLabel, setCountdownLabel] = useState<string | null>(() =>
    reopenAtIso ? formatCountdown(reopenAtIso) : null
  );
  useEffect(() => {
    if (!reopenAtIso) {
      setCountdownLabel(null);
      return;
    }
    const update = () => setCountdownLabel(formatCountdown(reopenAtIso));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [reopenAtIso]);

  const nextAutoOpenLabel =
    !isOnline && reopenAtIso && autoOpenFromSchedule && !manualActivationLock
      ? `Next auto open: ${formatIstDayDateTime(reopenAtIso)}`
      : null;

  const getHistoryActionLabel = (action: string): string => {
    const map: Record<string, string> = {
      manual_open: "Opened",
      manual_close: "Closed – Manual",
      scheduled_close: "Closed – Schedule",
      schedule_closed: "Closed – Schedule",
      store_closed_auto: "Closed – Auto (schedule)",
      store_opened_auto: "Opened – Auto (schedule)",
      store_open: "Opened",
      store_close: "Closed",
      status_change: "Status change",
    };
    return map[action] ?? action.replace(/_/g, " ");
  };

  const isOpenAction = (action: string): boolean => {
    return /open|opened/i.test(action) && !/close|closed/i.test(action);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        stickyHeaderIndices={[3]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Store Status card – scrolls with content */}
        <View style={[styles.card, isOnline ? styles.cardOnline : styles.cardOffline]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Store status</Text>
            <View style={[styles.badge, styles[`badge_${statusBadge}`]]}>
              <Text style={styles.badgeText}>
                {statusBadge === "OPEN"
                  ? "OPEN"
                  : statusBadge === "CLOSED_MANUAL"
                    ? "CLOSED – Manual"
                    : statusBadge === "CLOSED_SCHEDULE"
                      ? "CLOSED – Schedule"
                      : "CLOSED – Forced Lock"}
              </Text>
            </View>
          </View>
          <Text style={styles.cardSubtitle}>
            {isOnline
              ? "Store is online and accepting orders."
              : "Store is currently offline."}
          </Text>

          {!isOnline && (
            <View style={styles.metaBlock}>
              {exactReason != null && (
                <Text style={styles.metaText}>Reason: {exactReason}</Text>
              )}
              {closedBy != null && closedBy !== "" && (
                <Text style={styles.metaText}>Closed by: {closedBy}</Text>
              )}
              {manualCloseStartAt != null && (
                <Text style={styles.metaText}>Closed at: {formatIstTime(manualCloseStartAt)}</Text>
              )}
              {reopenTimeLabel != null ? (
                <Text style={styles.metaText}>Closed until: {reopenTimeLabel}</Text>
              ) : (
                !isOnline && (
                  <Text style={styles.metaText}>Closed until manually reopened.</Text>
                )
              )}
              {(countdownLabel != null || (reopenAtIso && reopenTimeLabel != null)) && (
                <Text style={styles.countdown}>
                  {countdownLabel ?? `Reopens at ${reopenTimeLabel}`}
                </Text>
              )}
            </View>
          )}

          {!isOnline && (
            <Pressable
              onPress={handleQuickReopen}
              disabled={loading || reopening}
              style={({ pressed }) => [
                styles.quickReopenBtn,
                pressed && styles.pressed,
                (loading || reopening) && styles.quickReopenDisabled,
              ]}
            >
              {reopening ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.quickReopenBtnText}>Go online</Text>
              )}
            </Pressable>
          )}
        </View>

        {/* Automation card */}
        <View style={styles.automationCard}>
          <View style={styles.automationHeader}>
            <View style={styles.automationIconWrap}>
              <Ionicons name="flash-outline" size={18} color={GatiMitraMerchant.primary} />
            </View>
            <Text style={styles.automationTitle}>Automation</Text>
          </View>
          <View style={styles.automationRows}>
            <View style={styles.automationRow}>
              <Ionicons name="calendar-outline" size={16} color={GatiMitraMerchant.textSecondary} />
              <Text style={styles.automationLabel}>Auto-open from schedule</Text>
              <View style={[styles.automationPill, autoOpenFromSchedule ? styles.automationPillOn : styles.automationPillOff]}>
                <Text style={[styles.automationPillText, autoOpenFromSchedule ? styles.automationPillTextOn : styles.automationPillTextOff]}>
                  {autoOpenFromSchedule ? "On" : "Off"}
                </Text>
              </View>
            </View>
            <View style={styles.automationRow}>
              <Ionicons name="lock-closed-outline" size={18} color={GatiMitraMerchant.textSecondary} />
              <Text style={styles.automationLabel}>Force keep store closed</Text>
              <View style={[styles.automationPill, manualActivationLock ? styles.automationPillOn : styles.automationPillOff]}>
                <Text style={[styles.automationPillText, manualActivationLock ? styles.automationPillTextOn : styles.automationPillTextOff]}>
                  {manualActivationLock ? "On" : "Off"}
                </Text>
              </View>
            </View>
          </View>
          {nextAutoOpenLabel != null && (
            <View style={styles.automationNextWrap}>
              <Ionicons name="time-outline" size={16} color={GatiMitraMerchant.primary} />
              <Text style={styles.automationNextText}>{nextAutoOpenLabel}</Text>
            </View>
          )}
          <Text style={styles.automationHelper}>
            Delivery settings → Store availability
          </Text>
        </View>

        {/* Weekly orders */}
        <View style={styles.weeklyCard}>
          <View style={styles.weeklyHeader}>
            <View style={styles.weeklyIconWrap}>
              <Ionicons name="bar-chart-outline" size={20} color={GatiMitraMerchant.primary} />
            </View>
            <View style={styles.weeklyTitleWrap}>
              <Text style={styles.weeklyTitle}>Weekly orders</Text>
              <Text style={styles.weeklySubtitle}>Orders per day</Text>
            </View>
          </View>
          {weeklyLoading ? (
            <View style={styles.weeklyChartArea}>
              <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
              <Text style={styles.weeklyPlaceholderText}>Loading...</Text>
            </View>
          ) : weeklyDays.length === 0 ? (
            <View style={styles.weeklyEmpty}>
              <View style={styles.weeklyEmptyIconWrap}>
                <Ionicons name="cart-outline" size={32} color={GatiMitraMerchant.textTertiary} />
              </View>
              <Text style={styles.weeklyEmptyTitle}>No data this week</Text>
              <Text style={styles.weeklyEmptySubtitle}>Orders will appear here as they come in</Text>
            </View>
          ) : (
            <>
              {maxOrders === 0 ? (
                <View style={styles.weeklyEmptyInline}>
                  <View style={styles.weeklyEmptyIconWrapSmall}>
                    <Ionicons name="cart-outline" size={24} color={GatiMitraMerchant.textTertiary} />
                  </View>
                  <Text style={styles.weeklyEmptyInlineText}>No orders this week yet</Text>
                </View>
              ) : null}
              <View style={styles.weeklyChartRow}>
                {weeklyDays.map((day) => {
                  const heightRatio = maxOrders > 0 ? day.orders_count / maxOrders : 0;
                  const barHeight = Math.max(
                    heightRatio * CHART_HEIGHT,
                    day.orders_count > 0 ? 12 : 6
                  );
                  const hasOrders = day.orders_count > 0;
                  return (
                    <View key={day.date} style={styles.weeklyBarWrap}>
                      <Text style={styles.weeklyBarValue} numberOfLines={1}>
                        {day.orders_count}
                      </Text>
                      <View style={styles.weeklyBarTrack}>
                        <View
                          style={[
                            styles.weeklyBar,
                            {
                              height: barHeight,
                              backgroundColor: hasOrders
                                ? GatiMitraMerchant.primary
                                : GatiMitraMerchant.surfaceSubtle,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.weeklyBarDay} numberOfLines={1}>
                        {day.label.split(" ")[0]}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* 3: Sticky – Status history section header */}
        <View style={styles.historyStickyHeader}>
          <View style={styles.historyStickyHeaderInner}>
            <View style={styles.historyStickyIconWrap}>
              <Ionicons name="time-outline" size={22} color="#fff" />
            </View>
            <View style={styles.historyStickyTextWrap}>
              <Text style={styles.historyStickyTitle}>Status history</Text>
              <Text style={styles.historyStickySubtitle}>
                Recent open/close and scheduled changes
              </Text>
            </View>
            {statusHistory.length > 0 && (
              <View style={styles.historyStickyBadge}>
                <Text style={styles.historyStickyBadgeText}>{statusHistory.length}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Status history list – own scroll section (sticky header above) */}
        {historyLoading ? (
          <View style={[styles.historyListCard, styles.historyListCardFirst]}>
            <Text style={styles.chartPlaceholder}>Loading...</Text>
          </View>
        ) : statusHistory.length === 0 ? (
          <View style={[styles.historyListCard, styles.historyListCardFirst]}>
            <Text style={styles.chartPlaceholder}>No history yet</Text>
          </View>
        ) : (
          statusHistory.map((entry, idx) => {
            const isOpen = isOpenAction(entry.action);
            const actionLabel = getHistoryActionLabel(entry.action);
            const dateTimeStr = formatHistoryDateAndTimeIst(entry.at);
            return (
              <View
                key={`${entry.id}-${entry.at}`}
                style={[
                  styles.historyRow,
                  idx === 0 && styles.historyRowFirst,
                  isOpen ? styles.historyRowOpen : styles.historyRowClosed,
                ]}
              >
                <View style={styles.historyRowTop}>
                  <Text style={[styles.historyAction, isOpen ? styles.historyActionOpen : styles.historyActionClosed]}>
                    {actionLabel}
                  </Text>
                  <View style={styles.historyDateTimeWrap}>
                    <Ionicons
                      name="time-outline"
                      size={14}
                      color={GatiMitraMerchant.textPrimary}
                      style={styles.historyDateTimeIcon}
                    />
                    <Text style={styles.historyDateTime}>{dateTimeStr}</Text>
                  </View>
                </View>
                {(entry.reason ?? entry.performed_by) && (
                  <Text style={styles.historyMeta} numberOfLines={2}>
                    {[entry.reason, entry.performed_by ? `by ${entry.performed_by}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.background,
  },
  body: {
    flex: 1,
  },
  content: {
    paddingHorizontal: H_PADDING,
    paddingVertical: 16,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  cardOnline: {
    borderLeftWidth: 4,
    borderLeftColor: GatiMitraMerchant.storeOnline,
  },
  cardOffline: {
    borderLeftWidth: 4,
    borderLeftColor: GatiMitraMerchant.storeOffline,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  cardSubtitle: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
  },
  metaBlock: {
    marginTop: 10,
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  countdown: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "#DC2626",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  badge_OPEN: {
    backgroundColor: "#DCFCE7",
    color: GatiMitraMerchant.storeOnline,
  },
  badge_CLOSED_MANUAL: {
    backgroundColor: "#FEE2E2",
    color: GatiMitraMerchant.storeOffline,
  },
  badge_CLOSED_SCHEDULE: {
    backgroundColor: "#FEF3C7",
    color: "#B45309",
  },
  badge_CLOSED_FORCED: {
    backgroundColor: "#E2E8F0",
    color: "#475569",
  },
  quickReopenBtn: {
    marginTop: 14,
    backgroundColor: GatiMitraMerchant.storeOnline,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  quickReopenDisabled: {
    opacity: 0.7,
  },
  quickReopenBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  pressed: {
    opacity: 0.85,
  },
  automationCard: {
    borderRadius: 16,
    backgroundColor: GatiMitraMerchant.cardBg,
    padding: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderLeftWidth: 4,
    borderLeftColor: GatiMitraMerchant.primary,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  automationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  automationIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(62, 180, 137, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  automationTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  automationRows: {
    gap: 6,
  },
  automationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    borderRadius: 8,
  },
  automationLabel: {
    flex: 1,
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    fontWeight: "500",
  },
  automationPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    minWidth: 44,
    alignItems: "center",
  },
  automationPillOn: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
  },
  automationPillOff: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  automationPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  automationPillTextOn: {
    color: GatiMitraMerchant.storeOnline,
  },
  automationPillTextOff: {
    color: GatiMitraMerchant.textSecondary,
  },
  automationNextWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(62, 180, 137, 0.08)",
    borderRadius: 8,
  },
  automationNextText: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  automationHelper: {
    marginTop: 6,
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
  },
  weeklyCard: {
    borderRadius: 16,
    backgroundColor: GatiMitraMerchant.cardBg,
    padding: 18,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  weeklyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  weeklyIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(62, 180, 137, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  weeklyTitleWrap: {
    flex: 1,
  },
  weeklyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  weeklySubtitle: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  weeklyChartArea: {
    minHeight: 140,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  weeklyPlaceholderText: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
  },
  weeklyEmpty: {
    minHeight: 140,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  weeklyEmptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  weeklyEmptyIconWrapSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  weeklyEmptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  weeklyEmptySubtitle: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
  },
  weeklyEmptyInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
    paddingVertical: 8,
  },
  weeklyEmptyInlineText: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
  },
  weeklyChartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: CHART_HEIGHT + 52,
    gap: BAR_GAP,
  },
  weeklyBarWrap: {
    flex: 1,
    alignItems: "center",
    minWidth: 0,
    maxWidth: BAR_MAX_WIDTH,
  },
  weeklyBarValue: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 6,
  },
  weeklyBarTrack: {
    flex: 1,
    width: "85%",
    justifyContent: "flex-end",
    alignItems: "center",
    minHeight: CHART_HEIGHT,
  },
  weeklyBar: {
    width: "100%",
    minHeight: 6,
    borderRadius: 8,
  },
  weeklyBarDay: {
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 6,
    fontWeight: "500",
  },
  historyStickyHeader: {
    backgroundColor: GatiMitraMerchant.primary,
    paddingVertical: 14,
    paddingHorizontal: H_PADDING,
    borderBottomWidth: 0,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
    }),
  },
  historyStickyHeaderInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  historyStickyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  historyStickyTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  historyStickyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  historyStickySubtitle: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.9)",
    marginTop: 2,
  },
  historyStickyBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  historyStickyBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  historyListCard: {
    minHeight: 120,
    justifyContent: "center",
  },
  historyListCardFirst: {
    marginTop: 4,
  },
  chartPlaceholder: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    paddingVertical: 8,
  },
  historyList: {
    gap: 10,
  },
  historyRow: {
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: GatiMitraMerchant.border,
    borderLeftColor: GatiMitraMerchant.border,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
      android: { elevation: 2 },
    }),
  },
  historyRowFirst: {
    marginTop: 4,
  },
  historyRowOpen: {
    borderLeftColor: GatiMitraMerchant.storeOnline,
    backgroundColor: "rgba(22, 163, 74, 0.04)",
  },
  historyRowClosed: {
    borderLeftColor: GatiMitraMerchant.storeOffline,
    backgroundColor: "rgba(220, 38, 38, 0.04)",
  },
  historyRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  historyAction: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    flex: 1,
  },
  historyActionOpen: {
    color: GatiMitraMerchant.storeOnline,
  },
  historyActionClosed: {
    color: GatiMitraMerchant.storeOffline,
  },
  historyDateTimeWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  historyDateTimeIcon: {
    marginRight: 4,
  },
  historyDateTime: {
    fontSize: 13,
    color: GatiMitraMerchant.textPrimary,
    fontWeight: "600",
  },
  historyMeta: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 4,
    lineHeight: 20,
    fontWeight: "500",
  },
});
