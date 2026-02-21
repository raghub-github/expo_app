/**
 * Ticket detail – open query; show subject, description, status, dates, resolution.
 */

import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { ticketService } from "@/services/ticket.service";

const TEAL = "#14b8a6";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const CARD_BG = "#FFFFFF";
const PAGE_BG = "#F0F4F3";
const SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 3,
};

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    OPEN: "Open",
    IN_PROGRESS: "In progress",
    RESOLVED: "Resolved",
    CLOSED: "Closed",
  };
  return map[s] ?? s;
}

export default function TicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticketId = id ? parseInt(id, 10) : NaN;
  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ["support", "ticket", id],
    queryFn: () => ticketService.getTicket(ticketId),
    enabled: !isNaN(ticketId),
  });

  if (isNaN(ticketId)) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Invalid ticket</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={TEAL} />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (error || !ticket) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color={TEXT_GRAY} />
        <Text style={styles.errorText}>Could not load ticket</Text>
      </View>
    );
  }

  const created = ticket.created_at
    ? new Date(ticket.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "";
  const updated = ticket.updated_at
    ? new Date(ticket.updated_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "";
  const resolved = ticket.resolved_at
    ? new Date(ticket.resolved_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.card, SHADOW]}>
        <View style={styles.headerRow}>
          <Text style={styles.ticketId}>{ticket.ticket_id}</Text>
          <View style={[styles.statusPill, (ticket.status === "OPEN" || ticket.status === "IN_PROGRESS") ? styles.statusOpen : styles.statusClosed]}>
            <Text style={styles.statusText}>{statusLabel(ticket.status)}</Text>
          </View>
        </View>
        <Text style={styles.subject}>{ticket.subject}</Text>
        <Text style={styles.meta}>Created {created}</Text>
        {updated !== created && <Text style={styles.meta}>Updated {updated}</Text>}
      </View>

      <Text style={styles.sectionLabel}>Description</Text>
      <View style={[styles.card, SHADOW]}>
        <Text style={styles.body}>{ticket.description}</Text>
      </View>

      {ticket.resolution ? (
        <>
          <Text style={styles.sectionLabel}>Resolution</Text>
          <View style={[styles.card, SHADOW]}>
            <Text style={styles.body}>{ticket.resolution}</Text>
            {resolved && <Text style={styles.meta}>Resolved {resolved}</Text>}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const PAD_H = 20;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAGE_BG },
  content: { padding: PAD_H, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: PAGE_BG },
  loadingText: { marginTop: 12, fontSize: 14, color: TEXT_GRAY },
  errorText: { marginTop: 12, fontSize: 16, color: TEXT_GRAY },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  ticketId: { fontSize: 13, fontWeight: "600", color: TEAL },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusOpen: { backgroundColor: "#E0F2F1" },
  statusClosed: { backgroundColor: "#F3F4F6" },
  statusText: { fontSize: 12, fontWeight: "600", color: TITLE_DARK },
  subject: { fontSize: 18, fontWeight: "700", color: TITLE_DARK },
  meta: { fontSize: 12, color: TEXT_GRAY, marginTop: 8 },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: TEXT_GRAY, marginBottom: 8, marginLeft: 4 },
  body: { fontSize: 15, color: TITLE_DARK, lineHeight: 22 },
});
