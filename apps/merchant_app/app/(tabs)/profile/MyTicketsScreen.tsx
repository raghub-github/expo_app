import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { getStoreTickets, type TicketSummary } from "@/services/ticketApi";

function formatTicketDate(input: string): string {
  try {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return "-";
    try {
      return new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    } catch {
      return d.toLocaleString("en-IN");
    }
  } catch {
    return "-";
  }
}

export default function MyTicketsScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();

  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const storeId = selectedStore?.id ?? null;

  const [filter, setFilter] = useState<
    "ALL" | "OPEN" | "WAITING_FOR_USER" | "RESOLVED" | "CLOSED"
  >("ALL");

  useEffect(() => {
    if (!token || !storeId) {
      setLoading(false);
      if (!storeId) setError("No store selected.");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await getStoreTickets(storeId, token);
        if (!cancelled) {
          setTickets(list);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load tickets.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, token]);

  const statusLabel = (s: string) => {
    const v = s.toUpperCase();
    if (v === "OPEN") return "Open";
    if (v === "IN_PROGRESS") return "In progress";
     if (v === "WAITING_FOR_USER") return "Waiting for you";
    if (v === "RESOLVED") return "Resolved";
    if (v === "CLOSED") return "Closed";
    return v;
  };

  const statusStyle = (s: string) => {
    const v = s.toUpperCase();
    if (v === "RESOLVED" || v === "CLOSED") return styles.statusResolved;
    if (v === "IN_PROGRESS" || v === "WAITING_FOR_USER") return styles.statusInProgress;
    return styles.statusOpen;
  };

  const sections = useMemo(
    () => [
      {
        key: "OPEN" as const,
        title: "Open / In progress",
        statuses: ["OPEN", "IN_PROGRESS"],
      },
      {
        key: "WAITING_FOR_USER" as const,
        title: "Waiting for you",
        statuses: ["WAITING_FOR_USER"],
      },
      {
        key: "RESOLVED" as const,
        title: "Resolved",
        statuses: ["RESOLVED"],
      },
      {
        key: "CLOSED" as const,
        title: "Closed",
        statuses: ["CLOSED"],
      },
    ],
    []
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
        <Text style={styles.loadingText}>Loading your tickets…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons
          name="alert-circle-outline"
          size={40}
          color={GatiMitraMerchant.textTertiary}
        />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {tickets.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons
            name="chatbubbles-outline"
            size={32}
            color={GatiMitraMerchant.textTertiary}
          />
          <Text style={styles.emptyTitle}>No tickets yet</Text>
          <Text style={styles.emptySubtitle}>
            Raise a new query from Help & support when you need assistance.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.filterRow}>
            {[
              { key: "ALL", label: "All" },
              { key: "OPEN", label: "Open" },
              { key: "WAITING_FOR_USER", label: "Waiting for you" },
              { key: "RESOLVED", label: "Resolved" },
              { key: "CLOSED", label: "Closed" },
            ].map((f) => (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key as any)}
                style={({ pressed }) => [
                  styles.filterChip,
                  filter === f.key && styles.filterChipActive,
                  pressed && styles.filterChipPressed,
                ]}
              >
                <Text
                  style={
                    filter === f.key ? styles.filterTextActive : styles.filterText
                  }
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {sections.map((section) => {
            if (filter !== "ALL" && filter !== section.key) return null;
            const bucket = tickets.filter((t) =>
              section.statuses.includes(t.status.toUpperCase())
            );
            if (bucket.length === 0) return null;
            return (
              <View key={section.key} style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {bucket.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() =>
                      router.push({
                        pathname: "/support/chat/[ticketId]",
                        params: { ticketId: String(t.id) },
                      })
                    }
                    style={({ pressed }) => [
                      styles.ticketRow,
                      pressed && styles.ticketRowPressed,
                    ]}
                  >
                    <View style={styles.ticketLeft}>
                      <Text style={styles.ticketId} numberOfLines={1}>
                        {t.ticket_id}
                      </Text>
                      <Text style={styles.ticketMeta} numberOfLines={1}>
                        {t.ticket_title ?? t.ticket_category ?? "Support"} •{" "}
                        {(t as any).created_at_display && (t as any).created_at_display !== ""
                          ? (t as any).created_at_display
                          : formatTicketDate(t.created_at)}
                      </Text>
                    </View>
                    <View style={[styles.statusPill, statusStyle(t.status)]}>
                      <Text style={styles.statusText}>{statusLabel(t.status)}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  content: { padding: H_PADDING, paddingBottom: 24 },
  sectionBlock: {
    marginTop: 12,
  },
  sectionTitle: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: H_PADDING,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
  },
  errorText: {
    marginTop: 12,
    fontSize: 15,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
  ticketRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  ticketRowPressed: { backgroundColor: GatiMitraMerchant.surfaceSubtle },
  ticketLeft: { flex: 1, marginRight: 8, minWidth: 0 },
  ticketId: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  ticketMeta: {
    marginTop: 2,
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
  statusOpen: {
    backgroundColor: GatiMitraMerchant.statusPending,
  },
  statusInProgress: {
    backgroundColor: GatiMitraMerchant.primary,
  },
  statusResolved: {
    backgroundColor: GatiMitraMerchant.statusCompleted,
  },
  emptyCard: {
    marginTop: 40,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  emptySubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  filterChipActive: {
    backgroundColor: GatiMitraMerchant.primary,
    borderColor: GatiMitraMerchant.primary,
  },
  filterChipPressed: {
    opacity: 0.85,
  },
  filterText: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  filterTextActive: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
});

