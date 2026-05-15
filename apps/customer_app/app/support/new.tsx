/**
 * Raise a new general support ticket.
 *
 * Flow:
 *  1. Fetch admin-curated catalog of titles (POST /help-sections), grouped by
 *     section_id (orders / payments / account / app / general).
 *  2. Customer picks a section → picks a title from that section → fills
 *     subject + description.
 *  3. POST /tickets → backend resolves group_id + tags from the title row and
 *     auto-routes to the right agent queue.
 *  4. Navigate to /support/[ticketId] to start the chat.
 *
 * Title list is purposefully driven entirely by `ticket_titles` rows seeded
 * in migration 0223. Adding new titles in the admin panel
 * (super-admin/ticket-settings → Titles → ticket_section=customer +
 * customer_section_id set) makes them appear here automatically — no client
 * change required.
 */

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  customerSupportService,
  type HelpSection,
} from "@/services/customerSupport.service";
import { GatiMitraColors } from "@/constants/gatimitra";

const SECTION_LABELS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  orders: { label: "Order issues", icon: "fast-food-outline", color: "#dc2626" },
  payments: { label: "Payments & refunds", icon: "card-outline", color: "#0ea5e9" },
  account: { label: "Account & profile", icon: "person-circle-outline", color: "#7c3aed" },
  app: { label: "App problems", icon: "construct-outline", color: "#64748b" },
  general: { label: "Something else", icon: "help-circle-outline", color: "#15803d" },
};

export default function RaiseTicketScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // Optional initial section from query (?section=orders etc.)
  const { section: sectionParam } = useLocalSearchParams<{ section?: string | string[] }>();
  const initialSection = Array.isArray(sectionParam) ? sectionParam[0] : sectionParam;

  const [selectedSection, setSelectedSection] = useState<string | null>(initialSection ?? null);
  const [selectedTitle, setSelectedTitle] = useState<HelpSection | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const { data: catalog, isLoading: catalogLoading } = useQuery({
    queryKey: ["customer-support-help-sections"],
    queryFn: () => customerSupportService.getHelpSections(),
    staleTime: 5 * 60_000,
  });

  /** Group titles by section_id. */
  const groupedSections = useMemo(() => {
    const map = new Map<string, HelpSection[]>();
    for (const t of catalog ?? []) {
      const k = t.section_id || "general";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    // Stable display order: orders → payments → account → app → general → others
    const preferredOrder = ["orders", "payments", "account", "app", "general"];
    const sorted: Array<{ key: string; items: HelpSection[] }> = [];
    for (const k of preferredOrder) if (map.has(k)) sorted.push({ key: k, items: map.get(k)! });
    for (const [k, v] of map) if (!preferredOrder.includes(k)) sorted.push({ key: k, items: v });
    return sorted;
  }, [catalog]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTitle) throw new Error("Please pick what your issue is about.");
      const subj = subject.trim() || selectedTitle.title_text || "Support request";
      const desc = description.trim();
      if (desc.length < 10) throw new Error("Please describe the issue in at least 10 characters.");
      return customerSupportService.createTicket({
        ticket_title_id: selectedTitle.ticket_title_id,
        section_code: selectedTitle.section_id ?? undefined,
        subject: subj,
        description: desc,
      });
    },
    onSuccess: (ticket) => {
      // Invalidate list and navigate to chat.
      queryClient.invalidateQueries({ queryKey: ["customer-support-tickets"] });
      router.replace({ pathname: "/support/[ticketId]", params: { ticketId: String(ticket.id) } });
    },
    onError: (err) => {
      Alert.alert("Could not raise ticket", err instanceof Error ? err.message : "Try again.");
    },
  });

  if (catalogLoading && !catalog) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={GatiMitraColors.emerald} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.h1}>What can we help you with?</Text>
      <Text style={styles.h2}>Pick a category, then choose the exact issue.</Text>

      {!selectedSection ? (
        // Step 1: pick section
        <View style={{ marginTop: 16, gap: 10 }}>
          {groupedSections.map((g) => {
            const meta = SECTION_LABELS[g.key] ?? {
              label: g.key.replace(/_/g, " "),
              icon: "help-circle-outline" as keyof typeof Ionicons.glyphMap,
              color: "#64748b",
            };
            return (
              <TouchableOpacity
                key={g.key}
                onPress={() => setSelectedSection(g.key)}
                style={styles.sectionCard}
                activeOpacity={0.85}
              >
                <View style={[styles.sectionIcon, { backgroundColor: `${meta.color}15` }]}>
                  <Ionicons name={meta.icon} size={22} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>{meta.label}</Text>
                  <Text style={styles.sectionCount}>{g.items.length} options</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
              </TouchableOpacity>
            );
          })}
          {groupedSections.length === 0 ? (
            <Text style={styles.emptyText}>
              No help topics configured yet. Please contact support directly.
            </Text>
          ) : null}
        </View>
      ) : !selectedTitle ? (
        // Step 2: pick title in section
        <View style={{ marginTop: 8 }}>
          <TouchableOpacity onPress={() => setSelectedSection(null)} style={styles.backRow}>
            <Ionicons name="chevron-back" size={18} color={GatiMitraColors.emerald} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <View style={{ marginTop: 10, gap: 8 }}>
            {(groupedSections.find((g) => g.key === selectedSection)?.items ?? []).map((t) => (
              <TouchableOpacity
                key={t.ticket_title_id}
                onPress={() => {
                  setSelectedTitle(t);
                  setSubject(t.title_text ?? "");
                }}
                style={styles.titleCard}
                activeOpacity={0.85}
              >
                <Text style={styles.titleCardText}>{t.title_text}</Text>
                <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        // Step 3: subject + description
        <View style={{ marginTop: 8 }}>
          <TouchableOpacity onPress={() => setSelectedTitle(null)} style={styles.backRow}>
            <Ionicons name="chevron-back" size={18} color={GatiMitraColors.emerald} />
            <Text style={styles.backText}>Change topic</Text>
          </TouchableOpacity>
          <View style={styles.selectedBox}>
            <Text style={styles.selectedLabel}>You picked</Text>
            <Text style={styles.selectedText}>{selectedTitle.title_text}</Text>
            {selectedTitle.group_name ? (
              <Text style={styles.selectedGroup}>Routed to: {selectedTitle.group_name}</Text>
            ) : null}
          </View>

          <Text style={styles.fieldLabel}>Subject</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            style={styles.input}
            placeholder="Brief title for your issue"
            placeholderTextColor={GatiMitraColors.textSecondary}
            maxLength={500}
          />

          <Text style={styles.fieldLabel}>Describe the problem</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            style={[styles.input, styles.textarea]}
            placeholder="Tell us what happened. Include any order details or steps so the agent can help faster."
            placeholderTextColor={GatiMitraColors.textSecondary}
            multiline
            maxLength={10000}
          />
          <Text style={styles.charCount}>{description.length}/10000</Text>

          <TouchableOpacity
            disabled={createMutation.isPending}
            onPress={() => createMutation.mutate()}
            style={[styles.submitBtn, createMutation.isPending && { opacity: 0.6 }]}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={18} color="#fff" />
                <Text style={styles.submitText}>Raise ticket</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.note}>
            An agent will be assigned automatically. You can chat with them in the next screen and attach photos if needed.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraColors.softBackground },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  h1: { fontSize: 22, fontWeight: "800", color: GatiMitraColors.textPrimary },
  h2: { fontSize: 14, color: GatiMitraColors.textSecondary, marginTop: 4 },
  sectionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  sectionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: GatiMitraColors.textPrimary },
  sectionCount: { fontSize: 12, color: GatiMitraColors.textSecondary, marginTop: 2 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8 },
  backText: { color: GatiMitraColors.emerald, fontWeight: "700" },
  titleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  titleCardText: { flex: 1, fontSize: 14, color: GatiMitraColors.textPrimary, fontWeight: "600" },
  selectedBox: {
    backgroundColor: "#ECFDF5",
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  selectedLabel: { fontSize: 11, color: "#15803d", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  selectedText: { fontSize: 15, fontWeight: "700", color: "#0f172a", marginTop: 2 },
  selectedGroup: { fontSize: 12, color: "#15803d", marginTop: 4 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: GatiMitraColors.textPrimary, marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: GatiMitraColors.textPrimary,
    backgroundColor: "#fff",
  },
  textarea: { minHeight: 130, textAlignVertical: "top" },
  charCount: { textAlign: "right", fontSize: 11, color: GatiMitraColors.textSecondary, marginTop: 4 },
  submitBtn: {
    backgroundColor: GatiMitraColors.emerald,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 20,
  },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  note: { fontSize: 12, color: GatiMitraColors.textSecondary, textAlign: "center", marginTop: 10, lineHeight: 18 },
  emptyText: { color: GatiMitraColors.textSecondary, fontStyle: "italic", padding: 16, textAlign: "center" },
});
