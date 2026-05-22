/**
 * My Support — list of the customer's tickets.
 * Tap a row → opens the chat detail.
 * Bottom FAB → raise a new ticket.
 */

import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { customerSupportService, type TicketListItem } from "@/services/customerSupport.service";
import { GatiMitraColors } from "@/constants/gatimitra";

function statusBadge(status: string): { label: string; color: string; bg: string } {
  const s = String(status).toUpperCase();
  if (s === "OPEN" || s === "REOPENED") return { label: s === "REOPENED" ? "Reopened" : "Open", color: "#1d4ed8", bg: "#dbeafe" };
  if (s === "ASSIGNED") return { label: "Assigned", color: "#1d4ed8", bg: "#dbeafe" };
  if (s === "IN_PROGRESS") return { label: "In progress", color: "#7c3aed", bg: "#ede9fe" };
  if (s === "WAITING_FOR_USER") return { label: "Awaiting you", color: "#b45309", bg: "#fef3c7" };
  if (s === "WAITING_FOR_MERCHANT" || s === "WAITING_FOR_RIDER" || s === "PENDING") return { label: "Pending", color: "#b45309", bg: "#fef3c7" };
  if (s === "RESOLVED") return { label: "Resolved", color: "#15803d", bg: "#dcfce7" };
  if (s === "CLOSED") return { label: "Closed", color: "#374151", bg: "#e5e7eb" };
  if (s === "REJECTED") return { label: "Rejected", color: "#b91c1c", bg: "#fee2e2" };
  if (s === "ESCALATED") return { label: "Escalated", color: "#b91c1c", bg: "#fee2e2" };
  if (s === "SNOOZED") return { label: "Snoozed", color: "#6b7280", bg: "#f3f4f6" };
  return { label: s, color: "#374151", bg: "#e5e7eb" };
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function SupportListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["customer-support-tickets"],
    queryFn: () => customerSupportService.listTickets(),
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const tickets = data ?? [];

  const renderItem = useCallback(
    ({ item }: { item: TicketListItem }) => {
      const sb = statusBadge(item.status);
      const lastActivity = item.last_response_at ?? item.updated_at ?? item.created_at;
      const lastByAgent = item.last_response_by_type === "AGENT";
      return (
        <TouchableOpacity
          onPress={() => router.push({ pathname: "/support/[ticketId]", params: { ticketId: String(item.id) } })}
          activeOpacity={0.72}
          style={styles.card}
        >
          <View style={styles.cardTop}>
            <View style={styles.ticketIconWrap}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={GatiMitraColors.primaryMint} />
            </View>
            <View style={styles.cardMain}>
              <View style={styles.cardHeader}>
                <Text style={styles.subject} numberOfLines={1}>
                  {item.subject || item.ticket_title || "Ticket"}
                </Text>
                <View style={[styles.badge, { backgroundColor: sb.bg }]}>
                  <Text style={[styles.badgeText, { color: sb.color }]}>{sb.label}</Text>
                </View>
              </View>
              {item.description ? (
                <Text style={styles.body} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              <View style={styles.cardFooter}>
                <Text style={styles.ref}>#{item.ticket_id}</Text>
                <View style={styles.footerRight}>
                  {lastByAgent ? (
                    <View style={styles.dotAgent}>
                      <View style={styles.dot} />
                      <Text style={styles.dotText}>Agent replied</Text>
                    </View>
                  ) : null}
                  <Text style={styles.when}>{formatWhen(lastActivity)}</Text>
                </View>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
          </View>
        </TouchableOpacity>
      );
    },
    [router]
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={GatiMitraColors.primaryMint} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" backgroundColor="#fff" />
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top - 8, 0) }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerSide} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={GatiMitraColors.textPrimaryNew} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Support</Text>
          <View style={styles.headerSide} />
        </View>

        <FlatList
          data={tickets}
          keyExtractor={(t) => String(t.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96, paddingTop: 8 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="chatbubbles-outline" size={40} color={GatiMitraColors.primaryMint} />
              </View>
              <Text style={styles.emptyTitle}>No tickets yet</Text>
              <Text style={styles.emptyBody}>
                Need help? Tap “Raise a ticket” below — an agent will get back to you in chat.
              </Text>
              {error ? (
                <Text style={styles.errorText} numberOfLines={3}>
                  {(error as Error).message}
                </Text>
              ) : null}
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={GatiMitraColors.primaryMint} />
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />

        <TouchableOpacity
          onPress={() => router.push("/support/new")}
          style={[styles.fab, { bottom: insets.bottom + 16 }]}
          activeOpacity={0.9}
        >
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.fabText}>Raise a ticket</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraColors.softBackground },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: GatiMitraColors.softBackground },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraColors.border,
  },
  headerSide: { width: 40, alignItems: "flex-start" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    ...GatiMitraColors.elevationShadow,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  ticketIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  cardMain: { flex: 1 },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4, gap: 8 },
  subject: { flex: 1, fontSize: 15, fontWeight: "700", color: GatiMitraColors.textPrimaryNew },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  body: { fontSize: 13, color: GatiMitraColors.textSecondary, lineHeight: 18, marginBottom: 8 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ref: { fontSize: 11, color: GatiMitraColors.textSecondary, fontWeight: "600" },
  footerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  dotAgent: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GatiMitraColors.primaryMint },
  dotText: { fontSize: 11, fontWeight: "700", color: GatiMitraColors.primaryMint },
  when: { fontSize: 11, color: GatiMitraColors.textSecondary },
  empty: { paddingTop: 48, alignItems: "center", paddingHorizontal: 32, gap: 8 },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: GatiMitraColors.textPrimaryNew, marginTop: 12 },
  emptyBody: { fontSize: 14, color: GatiMitraColors.textSecondary, textAlign: "center", lineHeight: 20 },
  errorText: { color: "#b91c1c", fontSize: 12, marginTop: 12, textAlign: "center" },
  fab: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: GatiMitraColors.primaryMint,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 28,
    shadowColor: GatiMitraColors.primaryMint,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  fabText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
