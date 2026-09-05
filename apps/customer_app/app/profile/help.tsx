/**
 * Help & Support – create ticket, my tickets list, open ticket. Data from unified_tickets.
 */

import { useCallback } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { ticketService, type TicketListItem } from "@/services/ticket.service";

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

function TicketRow({ ticket, onPress }: { ticket: TicketListItem; onPress: () => void }) {
  const date = ticket.created_at
    ? new Date(ticket.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "";
  return (
    <TouchableOpacity style={styles.ticketRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.ticketRowMain}>
        <AppText style={styles.ticketSubject} numberOfLines={2}>{ticket.subject}</AppText>
        <AppText style={styles.ticketMeta}>{ticket.ticket_id} · {date}</AppText>
      </View>
      <View style={[styles.statusPill, ticket.status === "OPEN" || ticket.status === "IN_PROGRESS" ? styles.statusOpen : styles.statusClosed]}>
        <AppText style={styles.statusText}>{statusLabel(ticket.status)}</AppText>
      </View>
      <Ionicons name="chevron-forward" size={20} color={TEXT_GRAY} />
    </TouchableOpacity>
  );
}

export default function HelpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["support", "tickets"],
    queryFn: () => ticketService.getMyTickets({ limit: 50 }),
    placeholderData: (previous) => previous,
  });
  const tickets = data?.tickets ?? [];
  const onRefresh = useCallback(() => refetch(), [refetch]);

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching && !isLoading} onRefresh={onRefresh} tintColor={TEAL} />
        }
      >
        {/* Create ticket */}
        <TouchableOpacity
          style={[styles.createCard, SHADOW]}
          onPress={() => router.push("/profile/ticket-create")}
          activeOpacity={0.85}
        >
          <View style={styles.createIconWrap}>
            <Ionicons name="add-circle-outline" size={28} color={TEAL} />
          </View>
          <View style={styles.createTextWrap}>
            <AppText style={styles.createTitle}>Create a ticket</AppText>
            <AppText style={styles.createSub}>Describe your issue and we’ll get back to you.</AppText>
          </View>
          <Ionicons name="chevron-forward" size={22} color={TEXT_GRAY} />
        </TouchableOpacity>

        {/* My tickets */}
        <AppText style={styles.sectionTitle}>My tickets</AppText>
        {isLoading && tickets.length === 0 ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="small" color={TEAL} />
            <AppText style={styles.loaderText}>Loading…</AppText>
          </View>
        ) : tickets.length === 0 ? (
          <View style={[styles.emptyCard, SHADOW]}>
            <Ionicons name="document-text-outline" size={40} color={TEXT_GRAY} />
            <AppText style={styles.emptyTitle}>No tickets yet</AppText>
            <AppText style={styles.emptySub}>Create a ticket above to get help.</AppText>
          </View>
        ) : (
          <View style={[styles.listCard, SHADOW]}>
            {tickets.map((t, index) => (
              <View
                key={t.id}
                style={[styles.ticketRowWrap, index < tickets.length - 1 && styles.ticketRowBorder]}
              >
                <TicketRow
                  ticket={t}
                  onPress={() => router.push({ pathname: "/profile/ticket/[id]", params: { id: String(t.id) } })}
                />
              </View>
            ))}
          </View>
        )}

        {/* Quick links — FAQ, Contact, Grievance — sourced from the legal pack */}
        <AppText style={styles.sectionTitle}>Quick links</AppText>
        <View style={[styles.listCard, SHADOW]}>
          <TouchableOpacity
            style={styles.quickRow}
            onPress={() => router.push("/profile/legal/faq" as never)}
            activeOpacity={0.7}
          >
            <Ionicons name="help-circle-outline" size={22} color={TEAL} />
            <View style={styles.quickRowText}>
              <AppText style={styles.quickRowTitle}>FAQ</AppText>
              <AppText style={styles.quickRowSub}>Common questions — food, rides, parcels</AppText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={TEXT_GRAY} />
          </TouchableOpacity>
          <View style={styles.quickDivider} />
          <TouchableOpacity
            style={styles.quickRow}
            onPress={() => router.push("/profile/legal/contact-us" as never)}
            activeOpacity={0.7}
          >
            <Ionicons name="call-outline" size={22} color={TEAL} />
            <View style={styles.quickRowText}>
              <AppText style={styles.quickRowTitle}>Contact Us</AppText>
              <AppText style={styles.quickRowSub}>Every email, phone, and address</AppText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={TEXT_GRAY} />
          </TouchableOpacity>
          <View style={styles.quickDivider} />
          <TouchableOpacity
            style={styles.quickRow}
            onPress={() => router.push("/profile/legal/grievance-redressal-mechanism" as never)}
            activeOpacity={0.7}
          >
            <Ionicons name="hammer-outline" size={22} color={TEAL} />
            <View style={styles.quickRowText}>
              <AppText style={styles.quickRowTitle}>Grievance Redressal</AppText>
              <AppText style={styles.quickRowSub}>How to file & escalate — IT Rules 2021</AppText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={TEXT_GRAY} />
          </TouchableOpacity>
          <View style={styles.quickDivider} />
          <TouchableOpacity
            style={styles.quickRow}
            onPress={() => router.push("/profile/legal/safety-policy" as never)}
            activeOpacity={0.7}
          >
            <Ionicons name="shield-checkmark-outline" size={22} color={TEAL} />
            <View style={styles.quickRowText}>
              <AppText style={styles.quickRowTitle}>Safety Policy</AppText>
              <AppText style={styles.quickRowSub}>SOS, women safety, incident reporting</AppText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={TEXT_GRAY} />
          </TouchableOpacity>
        </View>

        {/* Contact */}
        <AppText style={styles.sectionTitle}>Contact us</AppText>
        <View style={[styles.contactCard, SHADOW]}>
          <AppText style={styles.contactLabel}>Email</AppText>
          <AppText style={styles.contactValue}>support@gatimitra.com</AppText>
          <AppText style={styles.contactLabel}>Phone</AppText>
          <AppText style={styles.contactValue}>+91 1800-xxx-xxxx</AppText>
          <AppText style={styles.contactLabel}>Grievance Officer</AppText>
          <AppText style={styles.contactValue}>grievance.officer@gatimitra.com</AppText>
        </View>

        {/* All policies entry */}
        <TouchableOpacity
          style={[styles.allPoliciesCard, SHADOW]}
          activeOpacity={0.85}
          onPress={() => router.push("/profile/legal" as never)}
        >
          <Ionicons name="book-outline" size={22} color={TEAL} />
          <View style={{ flex: 1 }}>
            <AppText style={styles.allPoliciesTitle}>All Policies & Legal Documents</AppText>
            <AppText style={styles.allPoliciesSub}>Refund, privacy, safety, subscriptions & more</AppText>
          </View>
          <Ionicons name="chevron-forward" size={20} color={TEXT_GRAY} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const PAD_H = 20;
const CARD_RADIUS = 20;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAGE_BG },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: PAD_H, paddingTop: 16, paddingBottom: 40 },
  createCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: CARD_RADIUS,
    padding: 18,
  },
  createIconWrap: { marginRight: 14 },
  createTextWrap: { flex: 1 },
  createTitle: { fontSize: 17, fontWeight: "700", color: TITLE_DARK },
  createSub: { fontSize: 13, color: TEXT_GRAY, marginTop: 4 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: TEXT_GRAY,
    marginTop: 24,
    marginBottom: 10,
    marginLeft: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  loaderWrap: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 24, gap: 10 },
  loaderText: { fontSize: 14, color: TEXT_GRAY },
  emptyCard: {
    backgroundColor: CARD_BG,
    borderRadius: CARD_RADIUS,
    padding: 32,
    alignItems: "center",
  },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: TITLE_DARK, marginTop: 12 },
  emptySub: { fontSize: 14, color: TEXT_GRAY, marginTop: 6 },
  listCard: {
    backgroundColor: CARD_BG,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
  },
  ticketRowWrap: {},
  ticketRowBorder: { borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  ticketRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  ticketRowMain: { flex: 1, marginRight: 10 },
  ticketSubject: { fontSize: 15, fontWeight: "600", color: TITLE_DARK },
  ticketMeta: { fontSize: 12, color: TEXT_GRAY, marginTop: 4 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  statusOpen: { backgroundColor: "#E0F2F1" },
  statusClosed: { backgroundColor: "#F3F4F6" },
  statusText: { fontSize: 11, fontWeight: "600", color: TITLE_DARK },
  contactCard: {
    backgroundColor: CARD_BG,
    borderRadius: CARD_RADIUS,
    padding: 18,
  },
  contactLabel: { fontSize: 12, fontWeight: "600", color: TEXT_GRAY, marginTop: 12 },
  contactValue: { fontSize: 15, color: TITLE_DARK, marginTop: 4 },
  quickRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 12,
  },
  quickRowText: { flex: 1 },
  quickRowTitle: { fontSize: 15, fontWeight: "600", color: TITLE_DARK },
  quickRowSub: { fontSize: 12.5, color: TEXT_GRAY, marginTop: 2 },
  quickDivider: { height: 1, backgroundColor: "#F0F0F0", marginLeft: 52 },
  allPoliciesCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: CARD_BG,
    borderRadius: CARD_RADIUS,
    padding: 18,
    marginTop: 18,
  },
  allPoliciesTitle: { fontSize: 15, fontWeight: "700", color: TITLE_DARK },
  allPoliciesSub: { fontSize: 12.5, color: TEXT_GRAY, marginTop: 4 },
});
