import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { riderSupportService, type RiderTicketListItem } from "@/src/services/riderSupport.service";
import { colors } from "@/src/theme";

const TEAL = colors.primary[600];
const TEAL_LIGHT = colors.primary[50];
/** Matches ProfilePage list background so cards read as elevated surfaces */
const SCREEN_BG = "#F4F6F8";
const CARD_RADIUS = 22;
const CARD_BORDER = "#CBD5E1";
const GREEN_ACTION = "#059669";

const CARD_ELEVATION = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  android: {
    elevation: 4,
  },
  default: {},
});

type IonName = ComponentProps<typeof Ionicons>["name"];

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function categoryTagLabel(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  if (!s) return "SUPPORT";
  if (s.length <= 12) return s;
  return s.slice(0, 12);
}

function categoryVisual(category: string | null | undefined): {
  icon: IonName;
  iconBg: string;
  iconColor: string;
  pillBg: string;
  pillColor: string;
} {
  const key = (category ?? "").toUpperCase();
  if (key.includes("ORDER") || key === "DELIVERY") {
    return {
      icon: "receipt-outline",
      iconBg: "#EFF6FF",
      iconColor: "#2563EB",
      pillBg: "#DBEAFE",
      pillColor: "#1D4ED8",
    };
  }
  if (key.includes("PAYMENT") || key.includes("EARNING")) {
    return {
      icon: "wallet-outline",
      iconBg: "#FEF3C7",
      iconColor: "#B45309",
      pillBg: "#FEF3C7",
      pillColor: "#B45309",
    };
  }
  if (key.includes("TECHNICAL") || key.includes("APP") || key === "OTHER") {
    return {
      icon: "bug-outline",
      iconBg: "#FCE7F3",
      iconColor: "#DB2777",
      pillBg: "#FCE7F3",
      pillColor: "#BE185D",
    };
  }
  return {
    icon: "chatbubble-ellipses-outline",
    iconBg: TEAL_LIGHT,
    iconColor: TEAL,
    pillBg: TEAL_LIGHT,
    pillColor: TEAL,
  };
}

function queueStatusUi(status: string): {
  label: string;
  icon: IonName;
  bg: string;
  border: string;
  color: string;
  resolved: boolean;
} {
  const s = status.toUpperCase();
  if (s === "IN_PROGRESS" || s === "ASSIGNED" || s === "WAITING_FOR_USER") {
    return {
      label: "In process",
      icon: "sync-outline",
      bg: "#FFFBEB",
      border: "#FDE68A",
      color: "#B45309",
      resolved: false,
    };
  }
  if (s === "RESOLVED" || s === "CLOSED") {
    return {
      label: s === "CLOSED" ? "Closed" : "Resolved",
      icon: "checkmark-circle",
      bg: "#ECFDF5",
      border: "#A7F3D0",
      color: "#047857",
      resolved: true,
    };
  }
  if (s === "REOPENED") {
    return {
      label: "Reopened",
      icon: "refresh-circle",
      bg: "#EFF6FF",
      border: "#BFDBFE",
      color: "#1D4ED8",
      resolved: false,
    };
  }
  return {
    label: s === "OPEN" ? "Open" : status,
    icon: "ellipse-outline",
    bg: "#EFF6FF",
    border: "#BFDBFE",
    color: "#1D4ED8",
    resolved: false,
  };
}

function DashedDivider() {
  return (
    <View style={styles.dashedWrap}>
      {Array.from({ length: 28 }).map((_, i) => (
        <View key={i} style={styles.dashDot} />
      ))}
    </View>
  );
}

function TicketQueueCard({
  item,
  onPress,
}: {
  item: RiderTicketListItem;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const st = queueStatusUi(item.status);
  const createdWhen = formatRelativeTime(item.created_at);
  const activityWhen = formatRelativeTime(
    item.last_response_at ?? item.updated_at ?? item.created_at,
  );
  const categoryRaw = item.ticket_category || item.ticket_title;
  const visual = categoryVisual(categoryRaw);
  const tag = categoryTagLabel(categoryRaw);
  const titleText = item.subject || item.ticket_title || "Support request";
  const preview = (item.description ?? "").trim();

  const infoMessage = st.resolved
    ? t(
        "profile.myQueueResolvedInfo",
        "Our team has resolved this issue. Thank you for helping us improve!",
      )
    : t(
        "profile.myQueueActiveInfo",
        "Our support team is reviewing your request. We'll update you here soon.",
      );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cardShell, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${titleText}, ${st.label}`}
      android_ripple={{ color: "rgba(13, 148, 136, 0.12)" }}
    >
      <View style={styles.cardSurface}>
      <View style={styles.cardTop}>
        <View style={[styles.iconBox, { backgroundColor: visual.iconBg }]}>
          <Ionicons name={visual.icon} size={24} color={visual.iconColor} />
        </View>

        <View style={styles.cardTopMeta}>
          <View style={[styles.categoryPill, { backgroundColor: visual.pillBg }]}>
            <Text style={[styles.categoryPillText, { color: visual.pillColor }]}>{tag}</Text>
          </View>
          <Text style={styles.ticketIdText} numberOfLines={1}>
            #{item.ticket_id}
          </Text>
          {createdWhen ? (
            <Text style={styles.createdText}>
              {t("profile.myQueueCreated", "Created {{time}}", { time: createdWhen })}
            </Text>
          ) : null}
        </View>

        {activityWhen ? (
          <View style={styles.timeCol}>
            <Ionicons name="time-outline" size={14} color="#94A3B8" />
            <Text style={styles.timeColText}>{activityWhen}</Text>
          </View>
        ) : null}
      </View>

      <DashedDivider />

      <Text style={styles.cardTitle} numberOfLines={2}>
        {titleText}
      </Text>

      {preview ? (
        <Text style={styles.cardPreview} numberOfLines={2}>
          {preview}
        </Text>
      ) : null}

      <View style={[styles.infoBox, st.resolved ? styles.infoBoxResolved : styles.infoBoxActive]}>
        <View style={styles.infoBoxLeft}>
          <Ionicons
            name="information-circle"
            size={22}
            color={st.resolved ? "#2563EB" : TEAL}
            style={styles.infoIcon}
          />
          <Text style={styles.infoText}>{infoMessage}</Text>
        </View>
        <View style={styles.infoDecor}>
          <Ionicons
            name="shield-checkmark"
            size={36}
            color={st.resolved ? "#22C55E" : TEAL}
          />
        </View>
      </View>

      <View style={styles.cardFooter}>
        <View style={[styles.statusPill, { backgroundColor: st.bg, borderColor: st.border }]}>
          <Ionicons name={st.icon} size={15} color={st.color} />
          <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
        </View>
        <View style={styles.openChatRow}>
          <Text style={styles.openChatText}>{t("profile.myQueueOpenChat", "Open chat")}</Text>
          <Ionicons name="chevron-forward" size={18} color={GREEN_ACTION} />
        </View>
      </View>
      </View>
    </Pressable>
  );
}

function QueueCaughtUpFooter() {
  const { t } = useTranslation();
  return (
    <View style={styles.caughtUpWrap}>
      <View style={styles.skyline}>
        {Array.from({ length: 9 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.skylineBar,
              { height: 12 + (i % 3) * 10, opacity: 0.35 + (i % 2) * 0.15 },
            ]}
          />
        ))}
      </View>
      <View style={styles.plantRow}>
        <Ionicons name="leaf-outline" size={28} color="#CBD5E1" />
        <View style={styles.plantStem} />
        <Ionicons name="leaf-outline" size={22} color="#94A3B8" />
      </View>
      <Text style={styles.caughtUpTitle}>
        {t("profile.myQueueCaughtUpTitle", "You're all caught up!")}
      </Text>
      <Text style={styles.caughtUpSub}>
        {t("profile.myQueueCaughtUpSub", "We'll notify you when there's an update.")}
      </Text>
    </View>
  );
}

export function MyTicketsScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["rider-support-tickets"],
    queryFn: () => riderSupportService.listTickets(),
    refetchOnWindowFocus: true,
  });

  const tickets = data ?? [];
  const openCount = useMemo(
    () =>
      tickets.filter((tk) => {
        const s = tk.status.toUpperCase();
        return s !== "RESOLVED" && s !== "CLOSED";
      }).length,
    [tickets],
  );

  const showCaughtUpFooter = tickets.length > 0 && openCount === 0;

  const openTicketChat = useCallback((item: RiderTicketListItem) => {
    router.push({
      pathname: "/ticket-chat/[id]",
      params: { id: String(item.id) },
    });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: RiderTicketListItem }) => (
      <TicketQueueCard item={item} onPress={() => openTicketChat(item)} />
    ),
    [openTicketChat],
  );

  const countLabel =
    tickets.length === 1
      ? t("profile.myQueueCountOne", "1 ticket")
      : t("profile.myQueueCount", "{{count}} tickets", { count: tickets.length });

  const countSubLabel =
    tickets.length === 0
      ? null
      : openCount > 0
        ? openCount === 1
          ? t("profile.myQueueActiveOne", "1 needs your attention")
          : t("profile.myQueueActive", "{{count}} need your attention", { count: openCount })
        : t("profile.myQueueAllCaughtUp", "You're all caught up");

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={t("common.back", "Back")}
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>{t("profile.myQueue", "My queue")}</Text>
        {!isLoading && tickets.length > 0 ? (
          <View style={styles.headerMeta}>
            <Text style={styles.headerMetaTitle} numberOfLines={1}>
              {countLabel}
            </Text>
            {countSubLabel ? (
              <Text style={styles.headerMetaSub} numberOfLines={1}>
                {countSubLabel}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.headerMetaSpacer} />
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={() => refetch()}
              tintColor={TEAL}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.cardGap} />}
          ListFooterComponent={showCaughtUpFooter ? <QueueCaughtUpFooter /> : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="chatbubbles-outline" size={40} color={TEAL} />
              </View>
              <Text style={styles.emptyTitle}>{t("profile.myQueueEmpty", "No tickets yet")}</Text>
              <Text style={styles.emptySub}>
                {error
                  ? t("profile.myQueueError", "Could not load tickets. Pull to refresh.")
                  : t("profile.myQueueEmptySub", "Raise a ticket from Profile → Raise Ticket")}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    flexShrink: 0,
  },
  backBtnPressed: { opacity: 0.85 },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    flexShrink: 0,
  },
  headerMeta: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  headerMetaSpacer: { flex: 1 },
  headerMetaTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "right",
  },
  headerMetaSub: {
    marginTop: 2,
    fontSize: 11,
    color: "#64748B",
    textAlign: "right",
  },
  list: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28 },
  cardGap: { height: 24 },
  /** Shadow/elevation only — border lives on cardSurface (Android hides border when combined with elevation). */
  cardShell: {
    width: "100%",
    borderRadius: CARD_RADIUS,
    ...CARD_ELEVATION,
  },
  cardSurface: {
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    padding: 16,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    overflow: "hidden",
  },
  cardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.992 }],
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardTopMeta: {
    flex: 1,
    minWidth: 0,
  },
  categoryPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  categoryPillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  ticketIdText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: 0.2,
  },
  createdText: {
    marginTop: 2,
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "500",
  },
  timeCol: {
    alignItems: "flex-end",
    flexShrink: 0,
    gap: 2,
    paddingTop: 2,
  },
  timeColText: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "600",
  },
  dashedWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 14,
    overflow: "hidden",
  },
  dashDot: {
    width: 6,
    height: 1,
    backgroundColor: "#CBD5E1",
    borderRadius: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 24,
    marginBottom: 6,
  },
  cardPreview: {
    fontSize: 14,
    color: "#64748B",
    lineHeight: 20,
    marginBottom: 12,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    overflow: "hidden",
  },
  infoBoxResolved: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  infoBoxActive: {
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
  },
  infoBoxLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  },
  infoIcon: {
    marginTop: 1,
    flexShrink: 0,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: "#334155",
    fontWeight: "500",
  },
  infoDecor: {
    marginLeft: 8,
    opacity: 0.9,
    flexShrink: 0,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "700",
  },
  openChatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  openChatText: {
    fontSize: 14,
    fontWeight: "700",
    color: GREEN_ACTION,
  },
  caughtUpWrap: {
    alignItems: "center",
    paddingTop: 28,
    paddingBottom: 16,
    paddingHorizontal: 24,
  },
  skyline: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
    height: 40,
    marginBottom: 16,
  },
  skylineBar: {
    width: 14,
    backgroundColor: "#CBD5E1",
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  plantRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 4,
    marginBottom: 16,
  },
  plantStem: {
    width: 3,
    height: 22,
    backgroundColor: "#94A3B8",
    borderRadius: 2,
    marginBottom: 2,
  },
  caughtUpTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  caughtUpSub: {
    marginTop: 6,
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },
  empty: {
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: TEAL_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  emptySub: {
    marginTop: 8,
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },
});
