/**
 * My Support — list of the customer's tickets (WhatsApp-style chat list).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import {
  View,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { customerSupportService, type TicketListItem } from "@/services/customerSupport.service";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreFonts } from "@/constants/storeTypography";
import { supportHeaderPaddingTop } from "@/lib/supportLayout";
import { SupportNewTicketHost } from "@/components/support/SupportNewTicketHost";
import { useAuthStore } from "@/store/authStore";
import { useCustomerTicketsListRealtime } from "@/hooks/useCustomerTicketsListRealtime";
import { useCustomerSupportReadStore } from "@/store/customerSupportReadStore";
import {
  computeTicketReadWatermark,
  ticketListNeedsAttention,
  ticketListUnreadCount,
} from "@/lib/customerSupportReadStorage";

function formatListTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: "short" });
  }
  return d.toLocaleDateString(undefined, { day: "numeric", month: "numeric", year: "2-digit" });
}

function previewText(item: TicketListItem): string {
  if (item.description?.trim()) return item.description.trim();
  if (item.ticket_title?.trim()) return item.ticket_title.trim();
  return "Support ticket";
}

function isAwaitingUser(status: string): boolean {
  return String(status).toUpperCase().replace(/-/g, "_") === "WAITING_FOR_USER";
}

function listStatusBadge(status: string): { label: string; color: string; bg: string } {
  const s = String(status).toUpperCase().replace(/-/g, "_");
  if (s === "OPEN" || s === "REOPENED") return { label: s === "REOPENED" ? "Reopened" : "Open", color: "#1d4ed8", bg: "#dbeafe" };
  if (s === "ASSIGNED") return { label: "Assigned", color: "#1d4ed8", bg: "#dbeafe" };
  if (s === "IN_PROGRESS") return { label: "In progress", color: "#7c3aed", bg: "#ede9fe" };
  if (s === "WAITING_FOR_USER") return { label: "Awaiting you", color: "#b45309", bg: "#fef3c7" };
  if (s === "WAITING_FOR_MERCHANT" || s === "WAITING_FOR_RIDER" || s === "PENDING") {
    return { label: "Pending", color: "#b45309", bg: "#fef3c7" };
  }
  if (s === "RESOLVED") return { label: "Resolved", color: "#15803d", bg: "#dcfce7" };
  if (s === "CLOSED") return { label: "Closed", color: "#374151", bg: "#e5e7eb" };
  if (s === "REJECTED") return { label: "Rejected", color: "#b91c1c", bg: "#fee2e2" };
  if (s === "ESCALATED") return { label: "Escalated", color: "#b91c1c", bg: "#fee2e2" };
  return { label: s.replace(/_/g, " "), color: "#374151", bg: "#f3f4f6" };
}

export default function SupportListScreen() {
  const router = useRouter();
  const { newTicket } = useLocalSearchParams<{ newTicket?: string }>();
  const insets = useSafeAreaInsets();
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const openedFromParamRef = useRef(false);

  useEffect(() => {
    const shouldOpen = newTicket === "1" || newTicket === "true";
    if (shouldOpen && !openedFromParamRef.current) {
      openedFromParamRef.current = true;
      setNewTicketOpen(true);
    }
  }, [newTicket]);
  const authToken = useAuthStore((s) => s.session?.accessToken ?? null);
  const customerSub = useAuthStore((s) => s.session?.userId ?? null);
  const readAtByTicketId = useCustomerSupportReadStore((s) => s.readAtByTicketId);
  const setCustomerSub = useCustomerSupportReadStore((s) => s.setCustomerSub);
  const hydrateReadMap = useCustomerSupportReadStore((s) => s.hydrate);
  const markTicketRead = useCustomerSupportReadStore((s) => s.markTicketRead);

  useEffect(() => {
    setCustomerSub(customerSub);
  }, [customerSub, setCustomerSub]);

  useFocusEffect(
    useCallback(() => {
      void hydrateReadMap();
    }, [hydrateReadMap])
  );

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["customer-support-tickets"],
    queryFn: () => customerSupportService.listTickets(),
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useCustomerTicketsListRealtime({
    enabled: Boolean(authToken) && !isLoading,
    authToken,
    onStale: () => {
      void refetch();
    },
  });

  const tickets = data ?? [];

  const renderItem = useCallback(
    ({ item }: { item: TicketListItem }) => {
      const lastActivity = item.last_response_at ?? item.updated_at ?? item.created_at;
      const lastReadAt = readAtByTicketId[String(item.id)] ?? null;
      const unreadCount = ticketListUnreadCount(item, lastReadAt);
      const needsAttention = ticketListNeedsAttention(item, lastReadAt);
      const lastByAgent = String(item.last_response_by_type ?? "").toUpperCase() === "AGENT";
      const title = item.subject || item.ticket_title || "Support ticket";
      const statusChip = listStatusBadge(item.status);

      return (
        <TouchableOpacity
          onPress={() => {
            markTicketRead(
              item.id,
              computeTicketReadWatermark([], item.updated_at, item.last_response_at)
            );
            router.push({ pathname: "/support/[ticketId]", params: { ticketId: String(item.id) } });
          }}
          activeOpacity={0.65}
          style={styles.row}
        >
          <View style={styles.avatar}>
            <Ionicons name="headset" size={22} color={GatiMitraColors.emerald} />
          </View>

          <View style={styles.rowBody}>
            <View style={styles.rowTop}>
              <AppText style={styles.title} numberOfLines={1}>
                {title}
              </AppText>
              <View style={styles.rowMetaCol}>
                <View style={[styles.statusPill, { backgroundColor: statusChip.bg }]}>
                  <AppText style={[styles.statusPillText, { color: statusChip.color }]} numberOfLines={1}>
                    {statusChip.label}
                  </AppText>
                </View>
                <AppText style={[styles.time, needsAttention && styles.timeUnread]}>
                  {formatListTime(lastActivity)}
                </AppText>
              </View>
            </View>

            <View style={styles.rowBottom}>
              <AppText
                style={[styles.preview, needsAttention && styles.previewUnread]}
                numberOfLines={1}
              >
                {lastByAgent ? "Support: " : ""}
                {previewText(item)}
              </AppText>
              {unreadCount > 0 ? (
                <View style={styles.unreadBadge}>
                  <AppText style={styles.unreadBadgeText}>
                    {unreadCount > 99 ? "99+" : String(unreadCount)}
                  </AppText>
                </View>
              ) : isAwaitingUser(item.status) ? (
                <View style={styles.actionDot} />
              ) : null}
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [router, readAtByTicketId, markTicketRead]
  );

  if (isLoading) {
    return (
      <>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={GatiMitraColors.emerald} />
        </View>
        <SupportNewTicketHost visible={newTicketOpen} onClose={() => setNewTicketOpen(false)} />
      </>
    );
  }

  return (
    <>
      <StatusBar style="dark" backgroundColor="#fff" />
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: supportHeaderPaddingTop(insets.top) }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerSide} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={GatiMitraColors.textPrimaryNew} />
          </TouchableOpacity>
          <AppText style={styles.headerTitle}>My Support</AppText>
          <View style={styles.headerSideRight} />
        </View>

        <FlatList
          data={tickets}
          keyExtractor={(t) => String(t.id)}
          renderItem={renderItem}
          contentContainerStyle={
            tickets.length === 0
              ? { flexGrow: 1, paddingBottom: insets.bottom + 24, paddingHorizontal: 12 }
              : { paddingBottom: insets.bottom + 24, paddingHorizontal: 12, paddingTop: 8 }
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="chatbubbles-outline" size={36} color={GatiMitraColors.emerald} />
              </View>
              <AppText style={styles.emptyTitle}>No tickets yet</AppText>
              <AppText style={styles.emptyBody}>
                Tap the + button below to raise your first ticket.
              </AppText>
              {error ? (
                <AppText style={styles.errorText} numberOfLines={3}>
                  {(error as Error).message}
                </AppText>
              ) : null}
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={GatiMitraColors.emerald}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separatorGap} />}
        />

        <TouchableOpacity
          onPress={() => setNewTicketOpen(true)}
          style={[styles.fab, { bottom: insets.bottom + 16 }]}
          activeOpacity={0.9}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>

        <SupportNewTicketHost visible={newTicketOpen} onClose={() => setNewTicketOpen(false)} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  headerSide: { width: 40, alignItems: "flex-start" },
  headerSideRight: { width: 40, alignItems: "flex-end" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontFamily: StoreFonts.loraBold,
    color: GatiMitraColors.textPrimaryNew,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 4,
  },
  rowMetaCol: {
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
    maxWidth: "42%",
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 10,
    fontFamily: StoreFonts.poppinsBold,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontFamily: StoreFonts.loraBold,
    color: "#111827",
  },
  time: {
    fontSize: 12,
    fontFamily: StoreFonts.poppinsSemiBold,
    color: "#94A3B8",
  },
  timeUnread: {
    color: GatiMitraColors.emerald,
  },
  rowBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  preview: {
    flex: 1,
    fontSize: 14,
    fontFamily: StoreFonts.loraRegular,
    color: "#64748B",
    lineHeight: 19,
  },
  previewUnread: {
    color: "#334155",
    fontFamily: StoreFonts.loraBold,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: GatiMitraColors.emerald,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: StoreFonts.poppinsBold,
  },
  actionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#F59E0B",
  },
  separatorGap: {
    height: 8,
  },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 36, gap: 8 },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: StoreFonts.loraBold,
    color: GatiMitraColors.textPrimaryNew,
    marginTop: 12,
  },
  emptyBody: {
    fontSize: 14,
    fontFamily: StoreFonts.loraRegular,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 12,
    marginTop: 12,
    textAlign: "center",
    fontFamily: StoreFonts.loraRegular,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: GatiMitraColors.emerald,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: GatiMitraColors.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
});
